-- Control de licencias de software por cliente y sus pagos, ligados a Caja.
-- Aditiva. Rollback: drop trigger erp_license_cash_guard on public.cash_movements; drop function erp_license_command, erp_license_json, erp_license_cash_guard;
-- drop table software_license_payments, software_licenses; drop sequence license_number_seq. Los movimientos de caja ya creados se conservan (ledger inmutable).
create sequence if not exists public.license_number_seq start with 1 increment by 1;

create table if not exists public.software_licenses (
  id uuid primary key default gen_random_uuid(),
  license_number text not null unique check (license_number ~ '^LIC-[0-9]{6}$'),
  request_id uuid not null unique,
  payload jsonb not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  customer_name_snapshot text not null,
  software_name text not null check (length(btrim(software_name)) between 2 and 160),
  license_key text check (license_key is null or length(license_key) <= 500),
  plan text not null check (plan in ('monthly','annual','one_time')),
  price_cop bigint not null check (price_cop between 0 and 999999999999),
  starts_on date not null,
  paid_until date,
  status text not null default 'active' check (status in ('active','suspended','cancelled')),
  status_reason text,
  notes text check (notes is null or length(notes) <= 1000),
  version integer not null default 1,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists software_licenses_customer on public.software_licenses(customer_id);
create index if not exists software_licenses_due on public.software_licenses(paid_until) where status='active';

create table if not exists public.software_license_payments (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.software_licenses(id) on delete restrict,
  request_id uuid not null unique,
  payload jsonb not null,
  amount_cop bigint not null check (amount_cop between 1 and 999999999999),
  paid_on date not null,
  payment_method text not null check (payment_method in ('efectivo','transferencia','nequi','daviplata','tarjeta','otro')),
  reference text check (reference is null or length(reference) <= 160),
  period_from date,
  period_to date,
  cash_movement_id uuid not null unique references public.cash_movements(id) on delete restrict,
  reversed_at timestamptz,
  reversal_reason text,
  reversal_movement_id uuid references public.cash_movements(id) on delete restrict,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((period_from is null) = (period_to is null)),
  check (reversed_at is null or (reversal_reason is not null and reversal_movement_id is not null))
);
create index if not exists software_license_payments_license on public.software_license_payments(license_id, paid_on desc);

alter table public.software_licenses enable row level security;
alter table public.software_license_payments enable row level security;
revoke all on table public.software_licenses, public.software_license_payments from anon, authenticated;

create or replace function public.erp_license_json(l public.software_licenses)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select to_jsonb(l) - 'license_key' - 'payload' - 'request_id' || jsonb_build_object(
    'price_cop',l.price_cop::text,'has_key',l.license_key is not null,
    'paid_total_cop',p.paid::text,
    'balance_cop',case when l.plan='one_time' then greatest(l.price_cop-p.paid,0)::text else null end,
    'last_paid_on',p.last_paid,
    'state',case
      when l.status='cancelled' then 'cancelled' when l.status='suspended' then 'suspended'
      when l.plan='one_time' then case when p.paid>=l.price_cop then 'paid' else 'pending_payment' end
      when l.paid_until is null then case when l.starts_on>t.today then 'current' else 'overdue' end
      when l.paid_until<t.today then 'overdue' when l.paid_until<=t.today+7 then 'due_soon' else 'current' end,
    'days_to_due',case when l.plan<>'one_time' and l.paid_until is not null then (l.paid_until-t.today) else null end)
  from (select coalesce(sum(amount_cop) filter (where reversed_at is null),0) as paid, max(paid_on) filter (where reversed_at is null) as last_paid
        from public.software_license_payments where license_id=l.id) p,
       (select (now() at time zone 'America/Bogota')::date as today) t;
$$;
revoke all on function public.erp_license_json(public.software_licenses) from public,anon,authenticated;

-- Un pago de licencia solo se reversa desde Licencias, para que pago, licencia y caja no se desalineen.
create or replace function public.erp_license_cash_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_original public.cash_movements%rowtype;
begin
  if new.reversal_of_id is not null then
    select * into v_original from public.cash_movements where id=new.reversal_of_id;
    if v_original.metadata->>'kind'='software_license' and current_setting('erp.license_reversal',true) is distinct from (v_original.metadata->>'paymentId') then
      raise exception 'license_reverse_through_license';
    end if;
  end if;
  return new;
end;$$;
drop trigger if exists erp_license_cash_guard on public.cash_movements;
create trigger erp_license_cash_guard before insert on public.cash_movements for each row execute function public.erp_license_cash_guard();
revoke all on function public.erp_license_cash_guard() from public,anon,authenticated;

create or replace function public.erp_license_command(p_action text, p_arguments jsonb default '{}', p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  a jsonb:=coalesce(p_arguments,'{}'); actor uuid:=auth.uid(); today date:=(now() at time zone 'America/Bogota')::date;
  l public.software_licenses%rowtype; pay public.software_license_payments%rowtype; c public.customers%rowtype;
  v_amount bigint; v_periods integer; v_from date; v_to date; v_method text; v_paid_on date; v_ref text; v_movement uuid; v_pay_id uuid:=gen_random_uuid();
  v_number text; v_price bigint; v_plan text; v_status text; v_reason text; v_result jsonb; v_paid bigint; v_limit integer; v_offset integer; v_search text; v_state text;
begin
  if p_action in ('list','detail') then
    if not (public.erp_has_permission('sales.read') or public.erp_has_permission('cash.read')) then raise exception 'permission denied' using errcode='42501'; end if;
  elsif p_action in ('create','update','status','key') then perform public.erp_assert_permission('sales.manage');
  elsif p_action in ('payment','payment_reverse') then perform public.erp_assert_permission('cash.manage');
  else raise exception 'license_unknown_action'; end if;
  if jsonb_typeof(a)<>'object' or octet_length(a::text)>8192 then raise exception 'license_invalid_request'; end if;

  if p_action='list' then
    v_limit:=greatest(1,least(coalesce((a->>'limit')::integer,50),100)); v_offset:=greatest(0,least(coalesce((a->>'offset')::integer,0),100000));
    v_search:=nullif(btrim(a->>'search'),''); v_state:=nullif(a->>'state','');
    select jsonb_build_object('items',coalesce(jsonb_agg(j order by (j->>'created_at') desc),'[]'::jsonb)) into v_result from (
      select public.erp_license_json(x) as j from public.software_licenses x
      where (v_search is null or x.customer_name_snapshot ilike '%'||v_search||'%' or x.software_name ilike '%'||v_search||'%' or x.license_number ilike '%'||v_search||'%')
      order by x.created_at desc limit 500) q
      where v_state is null or q.j->>'state'=v_state;
    v_result:=jsonb_set(v_result,'{items}',coalesce((select jsonb_agg(e) from (select e from jsonb_array_elements(v_result->'items') e offset v_offset limit v_limit) s),'[]'::jsonb));
    return v_result||jsonb_build_object('summary',(
      with s as (select x.plan,x.price_cop,x.status,public.erp_license_json(x) as j from public.software_licenses x)
      select jsonb_build_object(
        'active',count(*) filter (where j->>'state' in ('current','due_soon','overdue','paid','pending_payment')),
        'current',count(*) filter (where j->>'state'='current'),'due_soon',count(*) filter (where j->>'state'='due_soon'),
        'overdue',count(*) filter (where j->>'state'='overdue'),'pending_payment',count(*) filter (where j->>'state'='pending_payment'),
        'suspended',count(*) filter (where j->>'state'='suspended'),
        'monthly_recurring_cop',coalesce(sum(case when plan='monthly' then price_cop when plan='annual' then round(price_cop/12.0) else 0 end) filter (where status='active'),0)::text,
        'one_time_balance_cop',coalesce(sum((j->>'balance_cop')::bigint) filter (where plan='one_time' and status='active'),0)::text,
        'collected_month_cop',(select coalesce(sum(amount_cop),0)::text from public.software_license_payments where reversed_at is null and date_trunc('month',paid_on)=date_trunc('month',today::timestamp)))
      from s));
  end if;

  if p_action='detail' then
    select * into l from public.software_licenses where id=(a->>'id')::uuid; if not found then raise exception 'license_not_found'; end if;
    return public.erp_license_json(l)||jsonb_build_object('customer_id',l.customer_id,'payments',coalesce((
      select jsonb_agg(jsonb_build_object('id',p.id,'amount_cop',p.amount_cop::text,'paid_on',p.paid_on,'payment_method',p.payment_method,'reference',p.reference,'period_from',p.period_from,'period_to',p.period_to,
        'cash_movement',(select movement_number from public.cash_movements m where m.id=p.cash_movement_id),'reversed_at',p.reversed_at,'reversal_reason',p.reversal_reason) order by p.paid_on desc,p.created_at desc)
      from public.software_license_payments p where p.license_id=l.id),'[]'::jsonb));
  end if;

  if p_action='key' then
    select * into l from public.software_licenses where id=(a->>'id')::uuid; if not found then raise exception 'license_not_found'; end if;
    insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,metadata)
      values('web_admin',actor::text,'api','license.key_view','software_license',l.id,jsonb_build_object('license',l.license_number));
    return jsonb_build_object('licenseKey',l.license_key);
  end if;

  if p_request_id is null then raise exception 'license_request_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,741));

  if p_action='create' then
    select * into l from public.software_licenses where request_id=p_request_id;
    if found then
      if l.payload<>a or l.created_by<>actor then raise exception 'license_idempotency_conflict'; end if;
      return public.erp_license_json(l);
    end if;
    if exists(select 1 from jsonb_object_keys(a) k where k<>all(array['customerId','software','licenseKey','plan','priceCop','startsOn','notes'])) then raise exception 'license_invalid_request'; end if;
    select * into c from public.customers where id=(a->>'customerId')::uuid and active; if not found then raise exception 'license_customer_not_found'; end if;
    v_plan:=a->>'plan'; v_price:=(a->>'priceCop')::bigint;
    if v_plan not in ('monthly','annual','one_time') or v_price is null or v_price<0 or v_price>999999999999 then raise exception 'license_invalid_request'; end if;
    insert into public.software_licenses(license_number,request_id,payload,customer_id,customer_name_snapshot,software_name,license_key,plan,price_cop,starts_on,notes,created_by)
      values('LIC-'||lpad(nextval('public.license_number_seq')::text,6,'0'),p_request_id,a,c.id,c.full_name,btrim(a->>'software'),nullif(btrim(a->>'licenseKey'),''),v_plan,v_price,
             coalesce(nullif(a->>'startsOn','')::date,today),nullif(btrim(a->>'notes'),''),actor) returning * into l;
    insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,metadata)
      values('web_admin',actor::text,'api','license.create','software_license',l.id,jsonb_build_object('license',l.license_number,'plan',v_plan,'priceCop',v_price::text));
    return public.erp_license_json(l);
  end if;

  select * into l from public.software_licenses where id=(a->>'id')::uuid for update;
  if not found then raise exception 'license_not_found'; end if;

  if p_action in ('update','status') then
    if l.version<>coalesce((a->>'version')::integer,0) then raise exception 'license_version_conflict'; end if;
    if p_action='update' then
      update public.software_licenses set
        license_key=case when a ? 'licenseKey' then nullif(btrim(a->>'licenseKey'),'') else license_key end,
        notes=case when a ? 'notes' then nullif(btrim(a->>'notes'),'') else notes end,
        price_cop=coalesce((a->>'priceCop')::bigint,price_cop), version=version+1, updated_at=now() where id=l.id returning * into l;
    else
      v_status:=a->>'status'; v_reason:=nullif(btrim(a->>'reason'),'');
      if v_status not in ('active','suspended','cancelled') or length(coalesce(v_reason,''))<3 then raise exception 'license_status_reason_required'; end if;
      update public.software_licenses set status=v_status,status_reason=v_reason,version=version+1,updated_at=now() where id=l.id returning * into l;
    end if;
    insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,metadata)
      values('web_admin',actor::text,'api','license.'||p_action,'software_license',l.id,jsonb_build_object('license',l.license_number,'status',l.status));
    return public.erp_license_json(l);
  end if;

  if p_action='payment' then
    select * into pay from public.software_license_payments where request_id=p_request_id;
    if found then
      if pay.payload<>a or pay.created_by<>actor then raise exception 'license_idempotency_conflict'; end if;
      return jsonb_build_object('paymentId',pay.id,'cashMovementId',pay.cash_movement_id,'license',public.erp_license_json(l),'repeated',true);
    end if;
    if exists(select 1 from jsonb_object_keys(a) k where k<>all(array['id','amountCop','periods','paidOn','method','reference'])) then raise exception 'license_invalid_request'; end if;
    if l.status<>'active' then raise exception 'license_not_active'; end if;
    v_amount:=(a->>'amountCop')::bigint; v_method:=a->>'method'; v_ref:=nullif(btrim(a->>'reference'),'');
    v_paid_on:=coalesce(nullif(a->>'paidOn','')::date,today);
    if v_amount is null or v_amount<1 or v_amount>999999999999 or v_method is null or v_method not in ('efectivo','transferencia','nequi','daviplata','tarjeta','otro')
       or v_paid_on>today or v_paid_on<today-400 or length(coalesce(v_ref,''))>160 then raise exception 'license_invalid_request'; end if;
    if l.plan='one_time' then
      select coalesce(sum(amount_cop),0) into v_paid from public.software_license_payments where license_id=l.id and reversed_at is null;
      if v_paid+v_amount>l.price_cop then raise exception 'license_payment_exceeds_balance'; end if;
    else
      v_periods:=coalesce((a->>'periods')::integer,1);
      if v_periods not between 1 and 36 then raise exception 'license_invalid_request'; end if;
      v_from:=coalesce(l.paid_until+1,l.starts_on);
      v_to:=(v_from+make_interval(months=>v_periods*case when l.plan='annual' then 12 else 1 end))::date-1;
    end if;
    v_number:='MOV-'||lpad(nextval('public.cash_movement_number_seq')::text,6,'0');
    insert into public.cash_movements(movement_number,session_id,movement_type,payment_method,amount_cop,description,metadata,created_by)
      values(v_number,public.erp_current_cash_session_id(),'manual_in',v_method,v_amount,
             left('Licencia '||l.license_number||' · '||l.software_name||' · '||l.customer_name_snapshot,300),
             jsonb_build_object('kind','software_license','licenseId',l.id,'licenseNumber',l.license_number,'paymentId',v_pay_id,'reference',v_ref),actor)
      returning id into v_movement;
    insert into public.software_license_payments(id,license_id,request_id,payload,amount_cop,paid_on,payment_method,reference,period_from,period_to,cash_movement_id,created_by)
      values(v_pay_id,l.id,p_request_id,a,v_amount,v_paid_on,v_method,v_ref,v_from,v_to,v_movement,actor);
    if l.plan<>'one_time' then update public.software_licenses set paid_until=greatest(coalesce(paid_until,v_to),v_to),version=version+1,updated_at=now() where id=l.id returning * into l;
    else update public.software_licenses set version=version+1,updated_at=now() where id=l.id returning * into l; end if;
    insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,metadata)
      values('web_admin',actor::text,'api','license.payment','software_license',l.id,jsonb_build_object('license',l.license_number,'amountCop',v_amount::text,'cashMovementId',v_movement));
    return jsonb_build_object('paymentId',v_pay_id,'cashMovementId',v_movement,'license',public.erp_license_json(l),'repeated',false);
  end if;

  if p_action='payment_reverse' then
    v_reason:=nullif(btrim(a->>'reason'),'');
    if length(coalesce(v_reason,''))<3 then raise exception 'license_reason_required'; end if;
    select * into pay from public.software_license_payments where id=(a->>'paymentId')::uuid and license_id=l.id for update;
    if not found then raise exception 'license_payment_not_found'; end if;
    if pay.reversed_at is not null then return jsonb_build_object('paymentId',pay.id,'license',public.erp_license_json(l),'repeated',true); end if;
    perform set_config('erp.license_reversal',pay.id::text,true);
    v_movement:=public.erp_reverse_cash_movement(pay.cash_movement_id,'Pago de licencia '||l.license_number||': '||v_reason);
    update public.software_license_payments set reversed_at=now(),reversal_reason=v_reason,reversal_movement_id=v_movement where id=pay.id;
    update public.software_licenses set paid_until=(select max(period_to) from public.software_license_payments where license_id=l.id and reversed_at is null),version=version+1,updated_at=now() where id=l.id returning * into l;
    insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,metadata)
      values('web_admin',actor::text,'api','license.payment_reverse','software_license',l.id,jsonb_build_object('license',l.license_number,'paymentId',pay.id,'reversalMovementId',v_movement));
    return jsonb_build_object('paymentId',pay.id,'reversalMovementId',v_movement,'license',public.erp_license_json(l),'repeated',false);
  end if;
  raise exception 'license_unknown_action';
end;$$;
revoke all on function public.erp_license_command(text,jsonb,uuid) from public,anon;
grant execute on function public.erp_license_command(text,jsonb,uuid) to authenticated;
notify pgrst, 'reload schema';
