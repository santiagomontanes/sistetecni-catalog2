-- Bot existente + notificaciones internas y entrega persistente por destinatario.
begin;
create or replace function public.erp_agent_action_policy(p_action text)
returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select case when p_action in ('shipping.create','shipping.list','shipping.detail','shipping.sales','shipping.references','shipping.guide','shipping.dispatch','shipping.deliver','shipping.pending_collections')
 then jsonb_build_object('permission',public.erp_shipping_permission(substr(p_action,10)),'risk',case when p_action in ('shipping.list','shipping.detail','shipping.sales','shipping.references','shipping.pending_collections') then 'read' else 'write' end)
 else public.erp_agent_action_policy_pre_shipping(p_action) end;
$$;
create or replace function public.erp_agent_dispatch(p_profile_id uuid,p_action text,p_arguments jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_action in ('shipping.create','shipping.list','shipping.detail','shipping.sales','shipping.references','shipping.guide','shipping.dispatch','shipping.deliver','shipping.pending_collections') then
   perform set_config('request.jwt.claim.sub',p_profile_id::text,true);
   perform set_config('request.jwt.claims',jsonb_build_object('sub',p_profile_id::text,'role','authenticated')::text,true);
   return public.erp_shipping_command(substr(p_action,10),p_arguments,p_request_id);
 end if;
 return public.erp_agent_dispatch_pre_shipping(p_profile_id,p_action,p_arguments,p_request_id);
end $$;

-- El ledger previo acepta reenvíos por meta_message_id. Para este endpoint también
-- comprobamos contenido + request_id: no se confirma por error otro sobre reutilizado.
create or replace function public.erp_shipping_agent_submit(p_wa_id_hash text,p_meta_message_id text,p_request_id uuid,p_action text,p_arguments jsonb,p_confirmation_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous public.whatsapp_erp_requests%rowtype; operator_id uuid;
begin
  if p_action not in ('shipping.create','shipping.list','shipping.detail','shipping.sales','shipping.references','shipping.guide','shipping.dispatch','shipping.deliver','shipping.pending_collections') then raise exception 'shipping_unknown_action'; end if;
  select c.operator_id into operator_id from public.erp_agent_operator_context(p_wa_id_hash) c;
  if operator_id is null then raise exception 'erp_agent_operator_not_authorized' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shipping-agent:'||coalesce(p_meta_message_id,''),0));
  select * into previous from public.whatsapp_erp_requests where meta_message_id=p_meta_message_id;
  if found and (previous.operator_id<>operator_id or previous.request_id<>p_request_id or previous.action<>p_action or previous.arguments<>p_arguments) then
    raise exception 'shipping_idempotency_conflict';
  end if;
  return public.erp_agent_submit_request(p_wa_id_hash,p_meta_message_id,p_request_id,p_action,p_arguments,p_confirmation_hash);
end $$;

create table if not exists public.erp_shipping_notifications(
 id uuid primary key default gen_random_uuid(),job_id uuid not null references public.erp_shipping_jobs(id),
 profile_id uuid not null references public.profiles(id),body text not null,created_at timestamptz not null default now(),read_at timestamptz,
 unique(job_id,profile_id)
);
alter table public.erp_shipping_notifications enable row level security;
revoke all on public.erp_shipping_notifications from public,anon,authenticated;
grant select on public.erp_shipping_notifications to authenticated;
drop policy if exists own_shipping_notifications on public.erp_shipping_notifications;
create policy own_shipping_notifications on public.erp_shipping_notifications for select to authenticated using(profile_id=auth.uid() and public.erp_has_permission('sales.read'));
create index if not exists erp_shipping_notifications_profile on public.erp_shipping_notifications(profile_id,created_at desc);

create table if not exists public.erp_shipping_notification_deliveries(
 job_id uuid not null references public.erp_shipping_jobs(id),profile_id uuid not null references public.profiles(id),
 state text not null default 'ready' check(state in('ready','sending','sent','uncertain','cancelled')),
 send_token uuid,provider_message_id text,attempts integer not null default 0,last_error text,
 started_at timestamptz,sent_at timestamptz,updated_at timestamptz not null default now(),primary key(job_id,profile_id)
);
alter table public.erp_shipping_notification_deliveries enable row level security;
revoke all on public.erp_shipping_notification_deliveries from public,anon,authenticated;
grant select on public.erp_shipping_notification_deliveries to authenticated;
drop policy if exists shipping_delivery_admin_read on public.erp_shipping_notification_deliveries;
create policy shipping_delivery_admin_read on public.erp_shipping_notification_deliveries for select to authenticated using(public.erp_has_permission('users.manage'));

create or replace function public.erp_shipping_reminder_body(p_job uuid) returns text
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare j public.erp_shipping_jobs%rowtype;s public.erp_shipments%rowtype;v_count bigint;v_lines text;
begin
 select * into j from public.erp_shipping_jobs where id=p_job;
 if not found then return null; end if;
 if j.kind='verify_delivery' then
  select * into s from public.erp_shipments where id=j.shipment_id;
  if s.status not in('ready','dispatched','incident') then return null; end if;
  return 'Verificar entrega: guía '||s.guide||' · venta '||(select sale_number from public.sales where id=s.sale_id)||'. Han transcurrido 3 días de lunes a viernes desde el registro de guía. Este aviso no confirma entrega.';
 end if;
 select count(*) into v_count from public.erp_shipments where status='pending_guide';
 select string_agg(x.sale_number,' · ') into v_lines from (select sa.sale_number from public.erp_shipments sh join public.sales sa on sa.id=sh.sale_id where sh.status='pending_guide' order by sh.created_at limit 20)x;
 return 'Resumen de pendientes de guía: '||v_count||'. '||coalesce(v_lines,'Sin pendientes.')||case when v_count>20 then ' (Se muestran 20; revisa la web para el resto.)' else '' end;
end $$;
revoke all on function public.erp_shipping_reminder_body(uuid) from public,anon,authenticated;

create or replace function public.erp_shipping_publish_notifications() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 if not exists(select 1 from public.erp_shipping_settings where enabled) then return 0; end if;
 insert into public.erp_shipping_notifications(job_id,profile_id,body)
 select j.id,p.id,public.erp_shipping_reminder_body(j.id) from public.erp_shipping_jobs j
 cross join lateral unnest(j.recipient_ids) r(id) join public.profiles p on p.id=r.id
 where j.due_at<=now() and j.status<>'cancelled' and p.active and public.erp_role_has_permission(p.erp_role,'sales.read')
 and public.erp_shipping_reminder_body(j.id) is not null
 on conflict(job_id,profile_id) do nothing;
 get diagnostics n=row_count;return n;
end $$;
revoke all on function public.erp_shipping_publish_notifications() from public,anon,authenticated;
grant execute on function public.erp_shipping_publish_notifications() to service_role;

create or replace function public.erp_shipping_reminder_command(p_action text,p_args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.erp_shipping_jobs%rowtype;d public.erp_shipping_notification_deliveries%rowtype;person uuid;body text;token uuid;
begin
 if not exists(select 1 from public.erp_shipping_settings where enabled) then raise exception 'shipping_disabled'; end if;
 if p_action='claim' then return public.erp_shipping_claim_jobs(least(greatest(coalesce((p_args->>'limit')::integer,20),1),50)); end if;
 select * into j from public.erp_shipping_jobs where id=(p_args->>'jobId')::uuid for update;
 if not found then raise exception 'shipping_job_not_found'; end if;
 if p_action='ack' then return jsonb_build_object('acknowledged',public.erp_shipping_complete_job(j.id,(p_args->>'leaseToken')::uuid,coalesce((p_args->>'success')::boolean,false),case when p_args->>'error' ~ '^[a-z_]{1,80}$' then p_args->>'error' else 'worker_retry' end)); end if;
 select c.profile_id into person from public.erp_agent_operator_context(p_args->>'waIdHash') c;
 if person is null or not(person=any(j.recipient_ids)) or not exists(select 1 from public.profiles p where p.id=person and p.active and public.erp_role_has_permission(p.erp_role,'sales.read')) then raise exception 'shipping_reminder_recipient_not_authorized' using errcode='42501'; end if;
 if p_action='begin' then
  if j.status<>'processing' or j.lease_token is distinct from (p_args->>'leaseToken')::uuid or j.lease_until<=now() then raise exception 'shipping_job_lease_invalid'; end if;
  body:=public.erp_shipping_reminder_body(j.id);
  if body is null then return jsonb_build_object('skip',true,'reason','no_longer_due'); end if;
  insert into public.erp_shipping_notification_deliveries(job_id,profile_id) values(j.id,person) on conflict do nothing;
  select * into d from public.erp_shipping_notification_deliveries where job_id=j.id and profile_id=person for update;
  if d.state='sent' then return jsonb_build_object('skip',true,'alreadySent',true); end if;
  if d.state in('sending','uncertain') then
   update public.erp_shipping_notification_deliveries set state='uncertain',last_error='previous_send_outcome_unknown',updated_at=now() where job_id=j.id and profile_id=person;
   return jsonb_build_object('skip',true,'requiresReview',true);
  end if;
  token:=gen_random_uuid();
  update public.erp_shipping_notification_deliveries set state='sending',send_token=token,attempts=attempts+1,started_at=now(),updated_at=now() where job_id=j.id and profile_id=person;
  return jsonb_build_object('skip',false,'sendToken',token,'dedupeKey',j.dedupe_key||':'||person,'body',body);
 elsif p_action='finish' then
  select * into d from public.erp_shipping_notification_deliveries where job_id=j.id and profile_id=person for update;
  if not found or d.send_token is distinct from (p_args->>'sendToken')::uuid then raise exception 'shipping_notification_token_invalid'; end if;
  if d.state='sent' then return jsonb_build_object('recorded',true); end if;
  if p_args->>'outcome'='sent' then
   if length(coalesce(p_args->>'providerMessageId','')) not between 1 and 200 then raise exception 'shipping_provider_message_required'; end if;
   update public.erp_shipping_notification_deliveries set state='sent',provider_message_id=p_args->>'providerMessageId',sent_at=now(),updated_at=now(),last_error=null where job_id=j.id and profile_id=person;
  elsif p_args->>'outcome'='not_sent' then
   update public.erp_shipping_notification_deliveries set state='ready',updated_at=now(),last_error='provider_rejected_before_acceptance' where job_id=j.id and profile_id=person;
  else
   update public.erp_shipping_notification_deliveries set state='uncertain',updated_at=now(),last_error='provider_outcome_unknown' where job_id=j.id and profile_id=person;
  end if;
  return jsonb_build_object('recorded',true);
 end if;
 raise exception 'shipping_unknown_reminder_action';
end $$;
revoke all on function public.erp_shipping_reminder_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.erp_shipping_reminder_command(text,jsonb) to service_role;
create or replace function public.erp_shipping_review_notification(p_job uuid,p_profile uuid,p_outcome text,p_provider_message text,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.erp_shipping_notification_deliveries%rowtype;
begin
 perform public.erp_assert_permission('users.manage');
 if p_outcome not in('sent','not_sent') or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'shipping_notification_review_required'; end if;
 perform 1 from public.erp_shipping_jobs where id=p_job and status='processing' and lease_until>now();
 if found then raise exception 'shipping_notification_still_in_flight'; end if;
 select * into d from public.erp_shipping_notification_deliveries where job_id=p_job and profile_id=p_profile for update;
 if not found or d.state not in('uncertain','sending') then raise exception 'shipping_notification_not_uncertain'; end if;
 if p_outcome='sent' and length(coalesce(p_provider_message,'')) not between 1 and 200 then raise exception 'shipping_provider_message_required'; end if;
 update public.erp_shipping_notification_deliveries set state=case when p_outcome='sent' then 'sent' else 'ready' end,
 provider_message_id=case when p_outcome='sent' then p_provider_message end,sent_at=case when p_outcome='sent' then now() end,last_error=null,updated_at=now() where job_id=p_job and profile_id=p_profile;
 insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,before_snapshot,after_snapshot,metadata)
 values('web_admin',auth.uid()::text,'web','shipping.notification_review','shipping_job',p_job,to_jsonb(d),jsonb_build_object('outcome',p_outcome),jsonb_build_object('reason',p_reason,'profileId',p_profile));
end $$;
revoke all on function public.erp_shipping_review_notification(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.erp_shipping_review_notification(uuid,uuid,text,text,text) to authenticated;
commit;
-- Desactivar envíos detiene publicación/worker. Conservar notificaciones y entregas.
-- Un envío con resultado incierto requiere revisar el proveedor antes de reautorizar;
-- nunca pasar automáticamente a ready por el mero reinicio del proceso.
