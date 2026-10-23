-- Asistencia operativa: aditiva, apagada inicialmente. No constituye nómina legal.
-- Hora servidor, perfiles existentes, pagos en gastos/caja existentes.
begin;
create table if not exists public.attendance_settings(
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  retention_days integer not null default 30 check(retention_days between 1 and 365)
);
insert into public.attendance_settings(singleton) values(true) on conflict do nothing;

create or replace function public.attendance_actor(p_manager boolean default false)
returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_id uuid:=auth.uid(); v_role text;
begin
  select erp_role into v_role from public.profiles where id=v_id and active;
  if v_id is null or v_role is null or v_role='viewer' or (p_manager and v_role not in ('admin','supervisor')) then
    raise exception 'attendance_permission_denied' using errcode='42501';
  end if;
  return v_id;
end;$$;
revoke all on function public.attendance_actor(boolean) from public,anon,authenticated;

create or replace function public.attendance_can_read(p_employee uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
select exists(select 1 from public.profiles where id=auth.uid() and active and erp_role<>'viewer'
  and (id=p_employee or erp_role in ('admin','supervisor','caja')));
$$;
revoke all on function public.attendance_can_read(uuid) from public,anon;
grant execute on function public.attendance_can_read(uuid) to authenticated;

create table if not exists public.attendance_evidence(
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  storage_path text not null unique,
  mime_type text not null check(mime_type='image/jpeg'),
  bytes integer not null check(bytes between 1 and 524288),
  status text not null default 'pending' check(status in ('pending','ready','deleted')),
  created_at timestamptz not null default now(), expires_at timestamptz not null,
  deleted_at timestamptz, deletion_attempts integer not null default 0,
  last_deletion_error text,
  check(storage_path like employee_id::text||'/%'),
  check((status='deleted')=(deleted_at is not null))
);
create index if not exists attendance_evidence_retention on public.attendance_evidence(expires_at) where status<>'deleted';

create table if not exists public.attendance_rates(
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.profiles(id),
  effective_from timestamptz not null, modality text not null check(modality in ('hourly','per_shift')),
  amount_cop bigint not null check(amount_cop between 0 and 1000000000000),
  paid_lunch boolean not null default false, created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id), reason text not null check(length(btrim(reason))>=3),
  unique(employee_id,effective_from)
);
create index if not exists attendance_rates_effective on public.attendance_rates(employee_id,effective_from desc);

create table if not exists public.attendance_settlements(
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.profiles(id),
  period_from date not null, period_to date not null check(period_to>=period_from),
  status text not null default 'draft' check(status in ('draft','approved','voided')),
  seconds_worked bigint not null default 0 check(seconds_worked>=0),
  base_cop bigint not null default 0 check(base_cop>=0), adjustment_cop bigint not null default 0,
  approved_cop bigint check(approved_cop>=0), approved_at timestamptz,
  approved_by uuid references public.profiles(id), approval_reason text,
  created_at timestamptz not null default now(), created_by uuid not null references public.profiles(id)
);
create index if not exists attendance_settlements_employee on public.attendance_settlements(employee_id,created_at desc);

create table if not exists public.attendance_shifts(
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.profiles(id),
  started_at timestamptz not null default now(), lunch_started_at timestamptz, lunch_ended_at timestamptz, ended_at timestamptz,
  evidence_id uuid not null unique references public.attendance_evidence(id),
  rate_snapshot jsonb, version integer not null default 1,
  settlement_id uuid references public.attendance_settlements(id),
  check(lunch_started_at is null or lunch_started_at>=started_at),
  check(lunch_ended_at is null or (lunch_started_at is not null and lunch_ended_at>=lunch_started_at)),
  check(ended_at is null or (ended_at>=started_at and (lunch_started_at is null or (lunch_ended_at is not null and ended_at>=lunch_ended_at))))
);
create unique index if not exists attendance_one_open_shift on public.attendance_shifts(employee_id) where ended_at is null;
create index if not exists attendance_shifts_employee_date on public.attendance_shifts(employee_id,started_at desc);

create table if not exists public.attendance_events(
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.profiles(id),
  shift_id uuid references public.attendance_shifts(id), settlement_id uuid references public.attendance_settlements(id),
  event_type text not null, actor_id uuid not null references public.profiles(id),
  occurred_at timestamptz not null default now(), reason text, before_snapshot jsonb, after_snapshot jsonb
);
create index if not exists attendance_events_employee_date on public.attendance_events(employee_id,occurred_at desc);
create table if not exists public.attendance_payments(
  id uuid primary key default gen_random_uuid(), settlement_id uuid not null references public.attendance_settlements(id),
  employee_id uuid not null references public.profiles(id), expense_id uuid not null unique references public.operating_expenses(id),
  amount_cop bigint not null check(amount_cop>0), kind text not null check(kind in ('advance','payment')),
  reference text not null check(length(btrim(reference)) between 3 and 120),
  created_at timestamptz not null default now(), created_by uuid not null references public.profiles(id),
  unique(employee_id,reference)
);
create index if not exists attendance_payments_settlement on public.attendance_payments(settlement_id,created_at desc);
create table if not exists public.attendance_requests(
  actor_id uuid not null references public.profiles(id), request_key uuid not null,
  payload jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
  primary key(actor_id,request_key)
);

do $$ declare t text; begin
  foreach t in array array['attendance_settings','attendance_evidence','attendance_rates','attendance_settlements','attendance_shifts','attendance_events','attendance_payments','attendance_requests'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('drop policy if exists attendance_read on public.%I',t);
    if t='attendance_settings' then
      execute format('create policy attendance_read on public.%I for select to authenticated using (public.attendance_can_read(auth.uid()))',t);
    elsif t='attendance_requests' then
      execute format('create policy attendance_read on public.%I for select to authenticated using (actor_id=auth.uid() and public.attendance_can_read(auth.uid()))',t);
    else
      execute format('create policy attendance_read on public.%I for select to authenticated using (public.attendance_can_read(employee_id))',t);
    end if;
  end loop;
end;$$;

drop policy if exists attendance_read on public.attendance_evidence;
create policy attendance_read on public.attendance_evidence for select to authenticated using (
  exists(select 1 from public.profiles where id=auth.uid() and active and erp_role<>'viewer'
    and (id=employee_id or erp_role in ('admin','supervisor')))
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('attendance-private','attendance-private',false,524288,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=524288,allowed_mime_types=array['image/jpeg'];
-- Sin políticas de objetos para el cliente: upload/read/delete únicamente en rutas autorizadas.

create or replace function public.attendance_seconds(p_start timestamptz,p_end timestamptz,p_lunch_start timestamptz,p_lunch_end timestamptz,p_paid_lunch boolean)
returns bigint language sql immutable set search_path=public,pg_temp as $$
  select greatest(0,floor(extract(epoch from (p_end-p_start)))-case when p_paid_lunch then 0 else coalesce(floor(extract(epoch from(p_lunch_end-p_lunch_start))),0) end)::bigint;
$$;
revoke all on function public.attendance_seconds(timestamptz,timestamptz,timestamptz,timestamptz,boolean) from public,anon;
grant execute on function public.attendance_seconds(timestamptz,timestamptz,timestamptz,timestamptz,boolean) to authenticated;

create or replace function public.attendance_command(p_action text,p_data jsonb,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=public.attendance_actor(false); v_employee uuid; v_id uuid; v_expense uuid; v_result jsonb;
  v_request public.attendance_requests%rowtype; v_shift public.attendance_shifts%rowtype;
  v_before jsonb; v_rate public.attendance_rates%rowtype; v_set public.attendance_settlements%rowtype;
  v_evidence public.attendance_evidence%rowtype; v_paid bigint; v_amount bigint; v_seconds bigint; v_total bigint:=0;
  v_worked bigint:=0; v_count integer:=0; v_role text; v_reason text:=nullif(btrim(p_data->>'reason'),''); v_allowed text[];
begin
  if p_request_key is null or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'attendance_invalid_request'; end if;
  v_allowed:=case p_action
    when 'settings' then array['enabled','retentionDays','reason']
    when 'evidence.reserve' then array['bytes']
    when 'rate' then array['employeeId','effectiveFrom','modality','amountCop','paidLunch','reason']
    when 'start' then array['evidenceId']
    when 'lunch.start' then array['shiftId','version'] when 'lunch.end' then array['shiftId','version'] when 'end' then array['shiftId','version']
    when 'correct' then array['shiftId','version','startedAt','endedAt','lunchStartedAt','lunchEndedAt','rateId','reason']
    when 'settlement.create' then array['employeeId','from','to']
    when 'settlement.adjust' then array['settlementId','amountCop','reason']
    when 'settlement.approve' then array['settlementId','amountCop','reason']
    when 'settlement.void' then array['settlementId','reason']
    when 'payment' then array['settlementId','amountCop','kind','method','reference']
    when 'payment.reverse' then array['settlementId','paymentId','reason'] end;
  if v_allowed is null or octet_length(p_data::text)>8192 or length(coalesce(v_reason,''))>1000
    or exists(select 1 from jsonb_object_keys(p_data) k where not(k=any(v_allowed))) then raise exception 'attendance_invalid_request'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||p_request_key::text,0));
  select * into v_request from public.attendance_requests where actor_id=v_actor and request_key=p_request_key;
  if found then
    if v_request.payload<>jsonb_build_object('action',p_action,'data',p_data) then raise exception 'attendance_idempotency_conflict'; end if;
    return v_request.result;
  end if;
  select erp_role into v_role from public.profiles where id=v_actor;
  if p_action='settings' then
    perform public.erp_assert_permission('users.manage');
    if length(coalesce(v_reason,''))<3 then raise exception 'attendance_reason_required'; end if;
    update public.attendance_settings set enabled=coalesce((p_data->>'enabled')::boolean,enabled),retention_days=coalesce((p_data->>'retentionDays')::integer,retention_days) where singleton;
    insert into public.attendance_events(employee_id,event_type,actor_id,reason,after_snapshot) values(v_actor,'settings',v_actor,v_reason,p_data);
    v_result:=jsonb_build_object('saved',true);
  else
    if not exists(select 1 from public.attendance_settings where singleton and enabled) then raise exception 'attendance_disabled'; end if;
    if p_action='evidence.reserve' then
      v_id:=gen_random_uuid();
      insert into public.attendance_evidence(id,employee_id,storage_path,mime_type,bytes,expires_at)
      select v_id,v_actor,v_actor::text||'/'||v_id::text||'.jpg','image/jpeg',(p_data->>'bytes')::integer,now()+make_interval(days=>retention_days)
      from public.attendance_settings where singleton returning * into v_evidence;
      v_result:=jsonb_build_object('id',v_id,'path',v_evidence.storage_path);
    elsif p_action='rate' then
      perform public.attendance_actor(true);
      if length(coalesce(v_reason,''))<3 then raise exception 'attendance_reason_required'; end if;
      v_employee:=(p_data->>'employeeId')::uuid;
      perform 1 from public.profiles where id=v_employee and active and erp_role<>'viewer' for update;
      if not found then raise exception 'attendance_employee_not_found'; end if;
      insert into public.attendance_rates(employee_id,effective_from,modality,amount_cop,paid_lunch,created_by,reason)
      values(v_employee,(p_data->>'effectiveFrom')::timestamptz,p_data->>'modality',(p_data->>'amountCop')::bigint,coalesce((p_data->>'paidLunch')::boolean,false),v_actor,v_reason) returning id into v_id;
      insert into public.attendance_events(employee_id,event_type,actor_id,reason,after_snapshot) values(v_employee,'rate',v_actor,v_reason,p_data);
      v_result:=jsonb_build_object('id',v_id);
    elsif p_action='start' then
      perform 1 from public.profiles where id=v_actor for update;
      if exists(select 1 from public.attendance_shifts where employee_id=v_actor and ended_at is null) then raise exception 'attendance_shift_already_open'; end if;
      select * into v_evidence from public.attendance_evidence where id=(p_data->>'evidenceId')::uuid and employee_id=v_actor and status='ready' and expires_at>now() and created_at>now()-interval '15 minutes' for update;
      if not found then raise exception 'attendance_evidence_required'; end if;
      select * into v_rate from public.attendance_rates where employee_id=v_actor and effective_from<=now() order by effective_from desc limit 1;
      insert into public.attendance_shifts(employee_id,evidence_id,rate_snapshot)
      values(v_actor,v_evidence.id,case when v_rate.id is null then null else to_jsonb(v_rate) end) returning * into v_shift;
      insert into public.attendance_events(employee_id,shift_id,event_type,actor_id,after_snapshot) values(v_actor,v_shift.id,'start',v_actor,to_jsonb(v_shift));
      v_result:=to_jsonb(v_shift);
    elsif p_action in ('lunch.start','lunch.end','end','correct') then
      select * into v_shift from public.attendance_shifts where id=(p_data->>'shiftId')::uuid for update;
      if not found then raise exception 'attendance_shift_not_found'; end if;
      if p_action='correct' then perform public.attendance_actor(true);
      elsif v_shift.employee_id<>v_actor then raise exception 'attendance_permission_denied' using errcode='42501'; end if;
      if v_shift.version<>coalesce((p_data->>'version')::integer,0) then raise exception 'attendance_version_conflict' using errcode='40001'; end if;
      if v_shift.settlement_id is not null then raise exception 'attendance_shift_already_settled'; end if;
      v_before:=to_jsonb(v_shift);
      if p_action='correct' then
        if length(coalesce(v_reason,''))<3 then raise exception 'attendance_reason_required'; end if;
        -- Solo correcciones explícitas; no se modifica la evidencia ni una tarifa ya capturada.
        if p_data ? 'rateId' then
          if v_shift.rate_snapshot is not null then raise exception 'attendance_rate_snapshot_frozen'; end if;
          select * into strict v_rate from public.attendance_rates where id=(p_data->>'rateId')::uuid and employee_id=v_shift.employee_id;
          v_shift.rate_snapshot:=to_jsonb(v_rate);
        end if;
        update public.attendance_shifts set started_at=coalesce((p_data->>'startedAt')::timestamptz,started_at),
          lunch_started_at=case when p_data?'lunchStartedAt' then (p_data->>'lunchStartedAt')::timestamptz else lunch_started_at end,
          lunch_ended_at=case when p_data?'lunchEndedAt' then (p_data->>'lunchEndedAt')::timestamptz else lunch_ended_at end,
          ended_at=case when p_data?'endedAt' then (p_data->>'endedAt')::timestamptz else ended_at end,
          rate_snapshot=v_shift.rate_snapshot,version=version+1 where id=v_shift.id returning * into v_shift;
        if greatest(v_shift.started_at,v_shift.lunch_started_at,v_shift.lunch_ended_at,v_shift.ended_at)>now() then raise exception 'attendance_future_correction'; end if;
      else
        if v_shift.ended_at is not null then raise exception 'attendance_shift_closed'; end if;
        if p_action='lunch.start' then
          if v_shift.lunch_started_at is not null then raise exception 'attendance_lunch_already_started'; end if;
          update public.attendance_shifts set lunch_started_at=now(),version=version+1 where id=v_shift.id returning * into v_shift;
        elsif p_action='lunch.end' then
          if v_shift.lunch_started_at is null or v_shift.lunch_ended_at is not null then raise exception 'attendance_lunch_not_open'; end if;
          update public.attendance_shifts set lunch_ended_at=now(),version=version+1 where id=v_shift.id returning * into v_shift;
        else
          if v_shift.lunch_started_at is not null and v_shift.lunch_ended_at is null then raise exception 'attendance_lunch_not_closed'; end if;
          update public.attendance_shifts set ended_at=now(),version=version+1 where id=v_shift.id returning * into v_shift;
        end if;
      end if;
      insert into public.attendance_events(employee_id,shift_id,event_type,actor_id,reason,before_snapshot,after_snapshot)
      values(v_shift.employee_id,v_shift.id,p_action,v_actor,v_reason,v_before,to_jsonb(v_shift));
      v_result:=to_jsonb(v_shift);
    elsif p_action='settlement.create' then
      perform public.attendance_actor(true); v_employee:=(p_data->>'employeeId')::uuid;
      perform 1 from public.profiles where id=v_employee for update;
      if not found then raise exception 'attendance_employee_not_found'; end if;
      insert into public.attendance_settlements(employee_id,period_from,period_to,created_by)
      values(v_employee,(p_data->>'from')::date,(p_data->>'to')::date,v_actor) returning * into v_set;
      for v_shift in select * from public.attendance_shifts where employee_id=v_employee and ended_at is not null and settlement_id is null
        and (started_at at time zone 'America/Bogota')::date between v_set.period_from and v_set.period_to order by started_at for update loop
        if v_shift.rate_snapshot is null then raise exception 'attendance_rate_missing:%',v_shift.id; end if;
        v_seconds:=public.attendance_seconds(v_shift.started_at,v_shift.ended_at,v_shift.lunch_started_at,v_shift.lunch_ended_at,(v_shift.rate_snapshot->>'paid_lunch')::boolean);
        v_amount:=case when v_shift.rate_snapshot->>'modality'='hourly' then round((v_shift.rate_snapshot->>'amount_cop')::numeric*v_seconds/3600)::bigint else (v_shift.rate_snapshot->>'amount_cop')::bigint end;
        v_total:=v_total+v_amount; v_worked:=v_worked+v_seconds; v_count:=v_count+1;
        update public.attendance_shifts set settlement_id=v_set.id where id=v_shift.id;
      end loop;
      if v_count=0 then raise exception 'attendance_no_closed_shifts'; end if;
      update public.attendance_settlements set base_cop=v_total,seconds_worked=v_worked where id=v_set.id returning * into v_set;
      insert into public.attendance_events(employee_id,settlement_id,event_type,actor_id,after_snapshot) values(v_employee,v_set.id,p_action,v_actor,to_jsonb(v_set));
      v_result:=to_jsonb(v_set);
    elsif p_action in ('settlement.adjust','settlement.approve','settlement.void','payment','payment.reverse') then
      select * into v_set from public.attendance_settlements where id=(p_data->>'settlementId')::uuid for update;
      if not found then raise exception 'attendance_settlement_not_found'; end if;
      if p_action in ('payment','payment.reverse') then perform public.erp_assert_permission('expenses.manage');
      else perform public.attendance_actor(true); end if;
      if v_set.status='voided' then raise exception 'attendance_settlement_voided'; end if;
      v_before:=to_jsonb(v_set);
      select coalesce(sum(p.amount_cop),0) into v_paid from public.attendance_payments p join public.operating_expenses e on e.id=p.expense_id where p.settlement_id=v_set.id and e.status='active';
      if p_action='settlement.adjust' then
        if v_set.status<>'draft' then raise exception 'attendance_settlement_frozen'; end if;
        if length(coalesce(v_reason,''))<3 then raise exception 'attendance_reason_required'; end if;
        v_amount:=(p_data->>'amountCop')::bigint;
        if v_set.base_cop+v_set.adjustment_cop+v_amount<0 then raise exception 'attendance_negative_settlement'; end if;
        update public.attendance_settlements set adjustment_cop=adjustment_cop+v_amount where id=v_set.id;
      elsif p_action='settlement.approve' then
        if v_set.status<>'draft' then raise exception 'attendance_settlement_frozen'; end if;
        v_amount:=(p_data->>'amountCop')::bigint;
        if v_amount is null or v_amount<v_paid or length(coalesce(v_reason,''))<3 then raise exception 'attendance_approval_invalid'; end if;
        update public.attendance_settlements set status='approved',approved_cop=v_amount,approved_at=now(),approved_by=v_actor,approval_reason=v_reason where id=v_set.id;
      elsif p_action='settlement.void' then
        if v_set.status<>'draft' or v_paid<>0 or length(coalesce(v_reason,''))<3 then raise exception 'attendance_cannot_void'; end if;
        update public.attendance_shifts set settlement_id=null where settlement_id=v_set.id;
        update public.attendance_settlements set status='voided' where id=v_set.id;
      elsif p_action='payment' then
        v_amount:=(p_data->>'amountCop')::bigint;
        if p_data->>'kind' not in ('advance','payment') or (p_data->>'kind'='payment' and v_set.status<>'approved') then raise exception 'attendance_payment_not_approved'; end if;
        if v_amount is null or v_amount<=0 or v_amount>coalesce(v_set.approved_cop,v_set.base_cop+v_set.adjustment_cop)-v_paid then raise exception 'attendance_payment_exceeds_balance'; end if;
        v_expense:=public.erp_create_operating_expense('nomina','Pago operativo asistencia '||v_set.id::text,v_amount,p_data->>'method',v_set.employee_id::text,null,(now() at time zone 'America/Bogota')::date);
        insert into public.attendance_payments(settlement_id,employee_id,expense_id,amount_cop,kind,reference,created_by)
        values(v_set.id,v_set.employee_id,v_expense,v_amount,p_data->>'kind',btrim(p_data->>'reference'),v_actor) returning id into v_id;
      else
        select expense_id into v_expense from public.attendance_payments where id=(p_data->>'paymentId')::uuid and settlement_id=v_set.id;
        if not found then raise exception 'attendance_payment_not_found'; end if;
        perform public.erp_void_operating_expense(v_expense,v_reason);
      end if;
      select * into v_set from public.attendance_settlements where id=v_set.id;
      insert into public.attendance_events(employee_id,settlement_id,event_type,actor_id,reason,before_snapshot,after_snapshot)
      values(v_set.employee_id,v_set.id,p_action,v_actor,v_reason,v_before,to_jsonb(v_set)||jsonb_build_object('request',p_data,'paymentId',v_id,'expenseId',v_expense));
      v_result:=to_jsonb(v_set)||jsonb_build_object('paymentId',v_id,'expenseId',v_expense);
    else raise exception 'attendance_unknown_action'; end if;
  end if;
  -- Dinero como texto en JSON: preservar bigint al cruzar parsers JavaScript.
  if v_result?'base_cop' then
    v_result:=v_result||jsonb_build_object('base_cop',v_result->>'base_cop','adjustment_cop',v_result->>'adjustment_cop','approved_cop',v_result->>'approved_cop');
  end if;
  insert into public.attendance_requests(actor_id,request_key,payload,result)
  values(v_actor,p_request_key,jsonb_build_object('action',p_action,'data',p_data),v_result);
  return v_result;
end;$$;
revoke all on function public.attendance_command(text,jsonb,uuid) from public,anon;
grant execute on function public.attendance_command(text,jsonb,uuid) to authenticated;

create or replace function public.attendance_directory()
returns table(id uuid,display_name text,erp_role text) language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform public.attendance_actor(false);
  return query select p.id,p.display_name,p.erp_role from public.profiles p
    where p.active and p.erp_role<>'viewer' and (p.id=auth.uid() or exists(select 1 from public.profiles a where a.id=auth.uid() and a.erp_role in ('admin','supervisor','caja')))
    order by p.display_name nulls last,p.id limit 500;
end;$$;
revoke all on function public.attendance_directory() from public,anon;
grant execute on function public.attendance_directory() to authenticated;

create or replace function public.attendance_payment_status(p_settlements uuid[])
returns table(id uuid,settlement_id uuid,amount_cop bigint,kind text,reference text,created_at timestamptz,expense_id uuid,expense_status text)
language sql stable security definer set search_path=public,pg_temp as $$
  select p.id,p.settlement_id,p.amount_cop,p.kind,p.reference,p.created_at,p.expense_id,e.status
    from public.attendance_payments p join public.operating_expenses e on e.id=p.expense_id
    where p.settlement_id=any(p_settlements) and public.attendance_can_read(p.employee_id) order by p.created_at desc limit 1000;
$$;
revoke all on function public.attendance_payment_status(uuid[]) from public,anon;
grant execute on function public.attendance_payment_status(uuid[]) to authenticated;

create or replace function public.attendance_balances(p_settlements uuid[])
returns table(settlement_id uuid,paid_cop bigint,payment_count bigint)
language sql stable security definer set search_path=public,pg_temp as $$
  select s.id,coalesce(sum(case when e.status='active' then p.amount_cop else 0 end),0)::bigint,count(p.id)
  from public.attendance_settlements s left join public.attendance_payments p on p.settlement_id=s.id
  left join public.operating_expenses e on e.id=p.expense_id
  where s.id=any(p_settlements) and public.attendance_can_read(s.employee_id) group by s.id;
$$;
revoke all on function public.attendance_balances(uuid[]) from public,anon;
grant execute on function public.attendance_balances(uuid[]) to authenticated;

commit;

-- Rollback conservador: UPDATE public.attendance_settings SET enabled=false WHERE singleton;
-- Conservar tablas, snapshots, eventos y evidencias para auditoría. El job de retención sigue activo.
-- No borrar tarifas/turnos/pagos. No revertir gastos al desactivar: usar reverso explícito del ERP.
