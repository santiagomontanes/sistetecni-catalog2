-- Envíos y recaudos sobre ventas, unidades y caja existentes. No emite documentos fiscales.
-- Compatible/aditiva, desactivada por defecto. Sólo aplicar con autorización del entorno.
begin;
create table if not exists public.erp_shipping_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  reminder_hour integer not null default 20 check(reminder_hour between 0 and 23),
  recipient_ids uuid[] not null default '{}',
  updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);
insert into public.erp_shipping_settings(singleton) values(true) on conflict do nothing;

create table if not exists public.erp_shipments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  recipient_name text not null check(length(btrim(recipient_name)) between 2 and 160),
  recipient_document text not null check(length(btrim(recipient_document)) between 3 and 40),
  recipient_phone text not null check(length(btrim(recipient_phone)) between 7 and 30),
  city text not null check(length(btrim(city)) between 2 and 100),
  department text not null check(length(btrim(department)) between 2 and 100),
  office_pickup boolean not null default false,
  address text not null check(length(btrim(address)) between 3 and 300),
  carrier text not null check(length(btrim(carrier)) between 2 and 100),
  payment_mode text not null check(payment_mode in ('prepaid','cod')),
  sale_value_cop bigint not null check(sale_value_cop>=0),
  collect_cop bigint not null check(collect_cop>=0 and collect_cop<=sale_value_cop),
  freight_cop bigint check(freight_cop>=0),
  deductions_cop bigint not null default 0 check(deductions_cop>=0),
  deduction_reason text,
  guide text check(guide is null or length(btrim(guide)) between 1 and 100),
  status text not null default 'pending_guide' check(status in ('pending_guide','ready','dispatched','incident','delivered','returned','cancelled')),
  collection_status text not null default 'not_due' check(collection_status in ('not_due','pending','partial','reconciled')),
  expected_net_cop bigint check(expected_net_cop>=0),
  received_cop bigint not null default 0 check(received_cop>=0),
  notes text check(length(notes)<=4000),
  guide_registered_at timestamptz, dispatched_at timestamptz, delivered_at timestamptz,
  delivered_by uuid references public.profiles(id), delivery_evidence text,
  version integer not null default 1,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(expected_net_cop is null or received_cop<=expected_net_cop),
  check(payment_mode<>'prepaid' or collect_cop=0),
  check(deductions_cop=0 or (deduction_reason is not null and length(btrim(deduction_reason))>=3))
);
create unique index if not exists erp_shipments_active_sale on public.erp_shipments(sale_id) where status<>'cancelled';
create unique index if not exists erp_shipments_carrier_guide on public.erp_shipments(lower(carrier),guide) where guide is not null;
create index if not exists erp_shipments_status_created on public.erp_shipments(status,created_at desc);
create index if not exists erp_shipments_pending_collection on public.erp_shipments(delivered_at,carrier) where collection_status in ('pending','partial');

create table if not exists public.erp_shipment_units (
  shipment_id uuid not null references public.erp_shipments(id) on delete restrict,
  unit_id uuid not null references public.product_units(id) on delete restrict,
  primary key(shipment_id,unit_id)
);
create table if not exists public.erp_shipping_requests (
  request_id uuid primary key, actor_id uuid not null references public.profiles(id),
  action text not null, arguments jsonb not null, result jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.erp_shipping_deposits (
  id uuid primary key default gen_random_uuid(), amount_cop bigint not null check(amount_cop>0),
  deposited_on date not null, account text not null check(length(btrim(account)) between 2 and 160),
  reference text not null check(length(btrim(reference)) between 1 and 160), evidence text,
  cash_movement_id uuid not null unique references public.cash_movements(id),
  status text not null default 'active' check(status in ('active','reversed')),
  reversal_movement_id uuid unique references public.cash_movements(id), reversal_reason text,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  unique(account,reference)
);
create table if not exists public.erp_shipping_allocations (
  id uuid primary key default gen_random_uuid(), deposit_id uuid not null references public.erp_shipping_deposits(id),
  shipment_id uuid not null references public.erp_shipments(id), amount_cop bigint not null check(amount_cop>0),
  reversed_at timestamptz, created_at timestamptz not null default now(), unique(deposit_id,shipment_id)
);
create index if not exists erp_shipping_allocations_shipment on public.erp_shipping_allocations(shipment_id);
create table if not exists public.erp_shipping_jobs (
  id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('verify_delivery','pending_guides')),
  dedupe_key text not null unique, shipment_id uuid references public.erp_shipments(id),
  due_at timestamptz not null, recipient_ids uuid[] not null default '{}', payload jsonb not null default '{}',
  status text not null default 'pending' check(status in ('pending','processing','done','cancelled')),
  attempts integer not null default 0, lease_until timestamptz, lease_token uuid,
  last_error text, completed_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists erp_shipping_jobs_due on public.erp_shipping_jobs(status,due_at);

-- No acceso directo de escritura: todas las invariantes viven en las RPC.
do $$ declare t text; begin
  foreach t in array array['erp_shipping_settings','erp_shipments','erp_shipment_units','erp_shipping_requests','erp_shipping_deposits','erp_shipping_allocations','erp_shipping_jobs'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public, anon, authenticated',t);
    execute format('grant select on table public.%I to authenticated',t);
    execute format('drop policy if exists shipping_read on public.%I',t);
    execute format('create policy shipping_read on public.%I for select to authenticated using (public.erp_has_permission(%L))',t,
      case when t in ('erp_shipping_deposits','erp_shipping_allocations') then 'cash.read' else 'sales.read' end);
  end loop;
end $$;
drop policy if exists shipping_read on public.erp_shipping_requests;
create policy shipping_read on public.erp_shipping_requests for select to authenticated using(actor_id=auth.uid() and public.erp_has_permission('sales.read'));

-- Dinero: COP ENTEROS, exactamente la valoración del ERP. No se redondean centavos.
create or replace function public.erp_shipping_money(p_value text) returns bigint language plpgsql immutable set search_path=public,pg_temp as $$
begin
  if p_value is null or p_value !~ '^(0|[1-9][0-9]{0,11})$' then raise exception 'shipping_invalid_money_integer_cop'; end if;
  return p_value::bigint;
end $$;
create or replace function public.erp_shipping_business_due(p_at timestamptz,p_days integer default 3)
returns timestamptz language plpgsql immutable set search_path=public,pg_temp as $$
declare d timestamp:=p_at at time zone 'America/Bogota'; n integer:=0;
begin
  if p_at is null or p_days<0 or p_days>30 then raise exception 'shipping_invalid_business_days'; end if;
  while n<p_days loop
    d:=d+interval '1 day';
    if extract(isodow from d)<6 then n:=n+1; end if;
  end loop;
  return d at time zone 'America/Bogota';
end $$;
comment on function public.erp_shipping_business_due(timestamptz,integer) is 'Días laborables: excluye sólo sábados y domingos, NO festivos. Conserva hora local America/Bogota.';
create index if not exists erp_shipments_verification_due on public.erp_shipments(public.erp_shipping_business_due(guide_registered_at,3))
  where guide_registered_at is not null and status in ('ready','dispatched','incident');

create or replace function public.erp_shipping_json(s public.erp_shipments)
returns jsonb language sql stable set search_path=public,pg_temp as $$
select to_jsonb(s)||jsonb_build_object('sale_value_cop',s.sale_value_cop::text,'collect_cop',s.collect_cop::text,
 'freight_cop',s.freight_cop::text,'deductions_cop',s.deductions_cop::text,'expected_net_cop',s.expected_net_cop::text,
 'received_cop',s.received_cop::text,'balance_cop',(coalesce(s.expected_net_cop,0)-s.received_cop)::text,
 'sale_number',(select sale_number from public.sales where id=s.sale_id),
 'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'unit_code',u.unit_code)) from public.erp_shipment_units su join public.product_units u on u.id=su.unit_id where su.shipment_id=s.id),'[]'::jsonb));
$$;

create or replace function public.erp_shipping_permission(p_action text)
returns text language sql immutable set search_path=public,pg_temp as $$
select case
 when p_action in ('list','detail','sales','settings','jobs') then 'sales.read'
 when p_action in ('pending_collections','deposits','metrics') then 'cash.read'
 when p_action in ('create','guide','dispatch','deliver','incident','cancel','return') then 'sales.manage'
 when p_action in ('reconcile','reverse_deposit') then 'cash.manage'
 when p_action='configure' then 'users.manage'
 else null end;
$$;

create or replace function public.erp_shipping_command(p_action text,p_arguments jsonb default '{}',p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  a jsonb:=coalesce(p_arguments,'{}'); actor uuid:=auth.uid(); permission text;
  s public.erp_shipments%rowtype; sale public.sales%rowtype; d public.erp_shipping_deposits%rowtype;
  settings public.erp_shipping_settings%rowtype; old_request public.erp_shipping_requests%rowtype;
  result jsonb; before_state jsonb; items jsonb; entry jsonb; amount bigint; total bigint:=0; net bigint; received bigint;
  v_deposit_id uuid; movement uuid; unit record; count_units integer; offset_n integer; limit_n integer; changed integer;
begin
  permission:=public.erp_shipping_permission(p_action);
  if permission is null then raise exception 'shipping_unknown_action'; end if;
  perform public.erp_assert_permission(permission);
  if jsonb_typeof(a)<>'object' or octet_length(a::text)>32768 then raise exception 'shipping_invalid_arguments'; end if;
  select * into settings from public.erp_shipping_settings where singleton=true;
  if p_action='settings' then return to_jsonb(settings); end if;
  if p_action in ('list','pending_collections') then
    offset_n:=greatest(0,least(coalesce((a->>'offset')::integer,0),100000));
    limit_n:=greatest(1,least(coalesce((a->>'limit')::integer,30),101));
    select coalesce(jsonb_agg(public.erp_shipping_json(q)),'[]') into items from (
      select sh.* from public.erp_shipments sh
      where (p_action<>'pending_collections' or (sh.status='delivered' and sh.collection_status in ('pending','partial')))
      and (nullif(a->>'status','') is null or sh.status=a->>'status')
      and (nullif(a->>'carrier','') is null or lower(sh.carrier)=lower(a->>'carrier'))
      and (nullif(a->>'reference','') is null or sh.guide ilike '%'||(a->>'reference')||'%')
      and (nullif(a->>'from','') is null or sh.delivered_at >= (a->>'from')::date::timestamp at time zone 'America/Bogota')
      and (nullif(a->>'to','') is null or sh.delivered_at < ((a->>'to')::date+1)::timestamp at time zone 'America/Bogota')
      order by sh.created_at desc,sh.id limit limit_n offset offset_n
    ) q;
    return jsonb_build_object('items',items,'offset',offset_n,'limit',limit_n,'hasMore',jsonb_array_length(items)=limit_n);
  elsif p_action='sales' then
    select coalesce(jsonb_agg(to_jsonb(q)),'[]') into items from (
      select sa.id,sa.sale_number,sa.customer_name,sa.customer_document,sa.customer_phone,sa.payment_status,sa.total_cop::text as total_cop
      from public.sales sa where (nullif(a->>'search','') is null or sa.sale_number ilike '%'||(a->>'search')||'%' or sa.customer_name ilike '%'||(a->>'search')||'%')
      and not exists(select 1 from public.erp_shipments sh where sh.sale_id=sa.id and sh.status<>'cancelled')
      and exists(select 1 from public.sale_items si where si.sale_id=sa.id and si.product_unit_id is not null)
      order by sa.created_at desc limit 30
    ) q;
    return jsonb_build_object('items',items);
  elsif p_action='detail' then
    select * into s from public.erp_shipments where id=(a->>'id')::uuid;
    if not found then raise exception 'shipping_not_found'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('operation',e.operation,'at',e.created_at,'actor',e.actor_ref,'detail',e.metadata) order by e.created_at desc),'[]') into items
      from public.audit_events e where e.entity_type='shipment' and e.entity_id=s.id;
    return public.erp_shipping_json(s)||jsonb_build_object('history',items,'document_type','internal_receipt','fiscal_invoice_issued',false);
  elsif p_action='deposits' then
    select coalesce(jsonb_agg(to_jsonb(q)),'[]') into items from (
      select dep.id,dep.amount_cop::text as amount_cop,dep.deposited_on,dep.account,dep.reference,dep.status,dep.evidence,dep.reversal_reason,
      (select jsonb_agg(jsonb_build_object('shipment_id',al.shipment_id,'amount_cop',al.amount_cop::text,'reversed_at',al.reversed_at)) from public.erp_shipping_allocations al where al.deposit_id=dep.id) as allocations
      from public.erp_shipping_deposits dep order by dep.created_at desc limit 50 offset greatest(0,least(coalesce((a->>'offset')::int,0),100000))
    )q; return jsonb_build_object('items',items);
  elsif p_action='jobs' then
    select coalesce(jsonb_agg(to_jsonb(q)),'[]') into items from (select id,kind,due_at,status,attempts,shipment_id,completed_at from public.erp_shipping_jobs order by created_at desc limit 50)q;
    return jsonb_build_object('items',items);
  elsif p_action='metrics' then
    return (select jsonb_build_object('pendingGuide',count(*) filter(where status='pending_guide'),
      'verifyDue',(select count(*) from public.erp_shipments overdue where overdue.guide_registered_at is not null and overdue.status in ('ready','dispatched','incident') and public.erp_shipping_business_due(overdue.guide_registered_at,3)<=now()),
      'netPendingCop',coalesce(sum(expected_net_cop-received_cop) filter(where status='delivered' and collection_status in ('pending','partial')),0)::text,
      'expectedNetCop',coalesce(sum(expected_net_cop) filter(where status='delivered'),0)::text,
      'receivedCop',coalesce(sum(received_cop),0)::text,
      'differenceCop',coalesce(sum(expected_net_cop-received_cop) filter(where status='delivered'),0)::text)
    from public.erp_shipments);
  end if;

  if p_request_id is null then raise exception 'shipping_idempotency_required'; end if;
  -- Serializa la misma clave antes de leer el ledger; rechaza reutilizarla con otro contenido.
  perform pg_advisory_xact_lock(hashtextextended('shipping:'||p_request_id::text,0));
  select * into old_request from public.erp_shipping_requests where request_id=p_request_id;
  if found then
    if old_request.actor_id<>actor or old_request.action<>p_action or old_request.arguments<>a then raise exception 'shipping_idempotency_conflict'; end if;
    return old_request.result||jsonb_build_object('duplicate',true);
  end if;
  if p_action='configure' then
    if a ? 'enabled' then settings.enabled:=(a->>'enabled')::boolean; end if;
    if a ? 'reminderHour' then settings.reminder_hour:=(a->>'reminderHour')::integer; end if;
    if a ? 'recipientIds' then
      select coalesce(array_agg(x::uuid),'{}') into settings.recipient_ids from jsonb_array_elements_text(a->'recipientIds') x;
      if exists(select 1 from unnest(settings.recipient_ids) r where not exists(select 1 from public.profiles p where p.id=r and p.active and public.erp_role_has_permission(p.erp_role,'sales.read'))) then raise exception 'shipping_recipient_not_authorized'; end if;
    end if;
    update public.erp_shipping_settings set enabled=settings.enabled,reminder_hour=settings.reminder_hour,recipient_ids=settings.recipient_ids,updated_by=actor,updated_at=now() where singleton;
    result:=jsonb_build_object('enabled',settings.enabled,'reminderHour',settings.reminder_hour);
  else
    if not settings.enabled then raise exception 'shipping_disabled'; end if;
    if p_action='create' then
      select * into sale from public.sales where id=(a->>'saleId')::uuid for update;
      if not found then raise exception 'shipping_sale_not_found'; end if;
      amount:=public.erp_shipping_money(a->>'collectCop');
      if a->>'paymentMode'='cod' and (sale.payment_status<>'pendiente' or amount<>sale.total_cop or amount=0) then raise exception 'shipping_cod_requires_full_unpaid_sale'; end if;
      if a->>'paymentMode'='prepaid' and (sale.payment_status<>'pagado' or amount<>0) then raise exception 'shipping_prepaid_requires_paid_sale'; end if;
      if a->>'paymentMode'='cod' and exists(select 1 from public.cash_movements cm where cm.sale_id=sale.id and cm.amount_cop>0 and not exists(select 1 from public.cash_movements r where r.reversal_of_id=cm.id)) then raise exception 'shipping_sale_has_existing_cash'; end if;
      perform 1 from public.product_units u join public.sale_items si on si.product_unit_id=u.id where si.sale_id=sale.id order by u.id for update of u;
      select count(*) into count_units from public.sale_items where sale_id=sale.id and product_unit_id is not null;
      if count_units=0 then raise exception 'shipping_sale_requires_units'; end if;
      if exists(select 1 from public.sale_items si join public.product_units u on u.id=si.product_unit_id where si.sale_id=sale.id and u.status<>'sold') then raise exception 'shipping_units_must_be_sold'; end if;
      insert into public.erp_shipments(sale_id,recipient_name,recipient_document,recipient_phone,city,department,office_pickup,address,carrier,payment_mode,sale_value_cop,collect_cop,notes,created_by)
      values(sale.id,btrim(a->>'name'),btrim(a->>'document'),btrim(a->>'phone'),btrim(a->>'city'),btrim(a->>'department'),coalesce((a->>'officePickup')::boolean,false),btrim(a->>'address'),btrim(a->>'carrier'),a->>'paymentMode',sale.total_cop,amount,a->>'notes',actor)
      returning * into s;
      insert into public.erp_shipment_units(shipment_id,unit_id) select s.id,product_unit_id from public.sale_items where sale_id=sale.id and product_unit_id is not null;
    elsif p_action in ('guide','dispatch','deliver','incident','cancel','return') then
      select * into s from public.erp_shipments where id=(a->>'id')::uuid for update;
      if not found then raise exception 'shipping_not_found'; end if;
      if coalesce((a->>'version')::integer,0)<>s.version then raise exception 'shipping_version_conflict'; end if;
      before_state:=jsonb_build_object('status',s.status,'collection_status',s.collection_status,'version',s.version);
      if p_action='guide' then
        if s.status<>'pending_guide' then raise exception 'shipping_guide_already_registered'; end if;
        amount:=public.erp_shipping_money(a->>'freightCop');
        net:=public.erp_shipping_money(coalesce(a->>'deductionsCop','0'));
        if net>0 and length(btrim(coalesce(a->>'deductionReason','')))<3 then raise exception 'shipping_deduction_reason_required'; end if;
        if s.payment_mode='cod' and amount+net>s.collect_cop then raise exception 'shipping_deductions_exceed_collection'; end if;
        update public.erp_shipments set guide=btrim(a->>'guide'),freight_cop=amount,deductions_cop=net,deduction_reason=nullif(btrim(a->>'deductionReason'),''),guide_registered_at=now(),status='ready' where id=s.id returning * into s;
        if s.guide is null then raise exception 'shipping_guide_required'; end if;
        insert into public.erp_shipping_jobs(kind,dedupe_key,shipment_id,due_at,recipient_ids,payload)
        values('verify_delivery','guide:'||s.id,s.id,public.erp_shipping_business_due(now(),3),settings.recipient_ids,jsonb_build_object('shipmentId',s.id,'confirmsDelivery',false)) on conflict(dedupe_key) do nothing;
      elsif p_action='dispatch' then
        if s.status<>'ready' then raise exception 'shipping_dispatch_requires_guide'; end if;
        update public.erp_shipments set status='dispatched',dispatched_at=now() where id=s.id returning * into s;
      elsif p_action='deliver' then
        if s.status not in ('dispatched','incident') then raise exception 'shipping_delivery_requires_dispatch'; end if;
        net:=case when s.payment_mode='cod' then s.collect_cop-s.freight_cop-s.deductions_cop else 0 end;
        if public.erp_shipping_money(a->>'expectedNetCop')<>net then raise exception 'shipping_expected_net_mismatch'; end if;
        if (a->>'deliveredAt')::timestamptz>s.created_at+interval '10 years' or (a->>'deliveredAt')::timestamptz>now()+interval '5 minutes' or (a->>'deliveredAt')::timestamptz<s.dispatched_at then raise exception 'shipping_invalid_delivery_date'; end if;
        if nullif(btrim(a->>'evidence'),'') is null or length(a->>'evidence')>1000 or a->>'deliveredAt' is null then raise exception 'shipping_delivery_evidence_required'; end if;
        if s.payment_mode='cod' and net=0 then raise exception 'shipping_zero_net_requires_manual_accounting_review'; end if;
        update public.erp_shipments set status='delivered',expected_net_cop=net,collection_status=case when net=0 then 'reconciled' else 'pending' end,
          delivered_at=(a->>'deliveredAt')::timestamptz,delivered_by=actor,delivery_evidence=btrim(a->>'evidence') where id=s.id returning * into s;
        update public.erp_shipping_jobs set status='cancelled' where shipment_id=s.id and status in ('pending','processing');
      else
        if length(btrim(coalesce(a->>'reason','')))<3 or length(a->>'reason')>1000 then raise exception 'shipping_reason_required'; end if;
        if p_action='incident' and s.status not in ('dispatched','incident') then raise exception 'shipping_invalid_incident_state'; end if;
        if p_action='cancel' and s.status not in ('pending_guide','ready') then raise exception 'shipping_cancel_requires_undispatched'; end if;
        if p_action='return' and s.status not in ('dispatched','incident','delivered') then raise exception 'shipping_invalid_return_state'; end if;
        if p_action='return' and s.received_cop>0 then raise exception 'shipping_reverse_collection_before_return'; end if;
        -- Cancelar sólo el envío NO anula la venta ni libera stock. Devolución física va a returned,
        -- nunca available: requiere inspección y gestión comercial existente antes de reventa.
        if p_action='return' then
          for unit in select u.* from public.product_units u join public.erp_shipment_units su on su.unit_id=u.id where su.shipment_id=s.id order by u.id for update of u loop
            if unit.status<>'sold' then raise exception 'shipping_return_unit_state_conflict'; end if;
            update public.product_units set status='returned' where id=unit.id;
            insert into public.inventory_movements(unit_id,product_id,movement_type,from_status,to_status,reference_type,reference_id,reason,created_by,actor_ref)
              values(unit.id,unit.product_id,'return','sold','returned','shipment',s.id,a->>'reason',actor,actor::text);
          end loop;
        end if;
        update public.erp_shipments set status=case p_action when 'incident' then 'incident' when 'return' then 'returned' else 'cancelled' end,
          collection_status=case when p_action='return' then 'not_due' else collection_status end where id=s.id returning * into s;
        if p_action in ('return','cancel') then update public.erp_shipping_jobs set status='cancelled' where shipment_id=s.id and status in ('pending','processing'); end if;
      end if;
      update public.erp_shipments set version=version+1,updated_at=now() where id=s.id returning * into s;
    elsif p_action='reconcile' then
      if (a->>'confirmed') is distinct from 'true' then raise exception 'shipping_confirmation_required'; end if;
      amount:=public.erp_shipping_money(a->>'amountCop');
      if amount<=0 or jsonb_typeof(a->'allocations') is distinct from 'array' or jsonb_array_length(a->'allocations') not between 1 and 50 then raise exception 'shipping_invalid_allocations'; end if;
      if (select count(*) from jsonb_array_elements(a->'allocations'))<>(select count(distinct x->>'shipmentId') from jsonb_array_elements(a->'allocations') x) then raise exception 'shipping_duplicate_allocation'; end if;
      -- Orden determinista de locks para que consignaciones superpuestas no hagan deadlock.
      perform 1 from public.erp_shipments sh where sh.id in (select (x->>'shipmentId')::uuid from jsonb_array_elements(a->'allocations') x) order by sh.id for update;
      perform 1 from public.sales sa where sa.id in (select sh.sale_id from public.erp_shipments sh where sh.id in (select (x->>'shipmentId')::uuid from jsonb_array_elements(a->'allocations') x)) order by sa.id for update;
      for entry in select value from jsonb_array_elements(a->'allocations') loop
        select * into s from public.erp_shipments where id=(entry->>'shipmentId')::uuid;
        if not found or s.status<>'delivered' or s.collection_status not in ('pending','partial') then raise exception 'shipping_balance_not_pending'; end if;
        net:=public.erp_shipping_money(entry->>'amountCop');
        if net<=0 or net>s.expected_net_cop-s.received_cop then raise exception 'shipping_allocation_exceeds_balance'; end if;
        if coalesce((entry->>'version')::integer,0)<>s.version then raise exception 'shipping_version_conflict'; end if;
        if exists(select 1 from public.cash_movements cm where cm.sale_id=s.sale_id and cm.amount_cop>0 and not exists(select 1 from public.cash_movements r where r.reversal_of_id=cm.id)) then raise exception 'shipping_sale_has_existing_cash'; end if;
        total:=total+net;
      end loop;
      if total<>amount then raise exception 'shipping_deposit_allocation_mismatch'; end if;
      if (a->>'depositedOn')::date>(now() at time zone 'America/Bogota')::date or a->>'depositedOn' is null then raise exception 'shipping_invalid_deposit_date'; end if;
      v_deposit_id:=gen_random_uuid();
      insert into public.cash_movements(movement_number,session_id,movement_type,payment_method,amount_cop,description,metadata,created_by)
      values('MOV-'||lpad(nextval('public.cash_movement_number_seq')::text,6,'0'),public.erp_current_cash_session_id(),'manual_in','transferencia',amount,'Recaudo transportadora',jsonb_build_object('shippingDepositId',v_deposit_id,'kind','carrier_collection'),actor) returning id into movement;
      insert into public.erp_shipping_deposits(id,amount_cop,deposited_on,account,reference,evidence,cash_movement_id,created_by)
      values(v_deposit_id,amount,(a->>'depositedOn')::date,btrim(a->>'account'),btrim(a->>'reference'),a->>'evidence',movement,actor);
      for entry in select value from jsonb_array_elements(a->'allocations') loop
        net:=public.erp_shipping_money(entry->>'amountCop');
        insert into public.erp_shipping_allocations(deposit_id,shipment_id,amount_cop) values(v_deposit_id,(entry->>'shipmentId')::uuid,net);
        update public.erp_shipments set received_cop=received_cop+net,collection_status=case when received_cop+net=expected_net_cop then 'reconciled' else 'partial' end,version=version+1,updated_at=now()
          where id=(entry->>'shipmentId')::uuid returning * into s;
        update public.sales set payment_status=case when s.collection_status='reconciled' then 'pagado' else 'parcial' end where sales.id=s.sale_id;
        insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,metadata)
          values('web_admin',actor::text,'api','shipping.collection','shipment',s.id,jsonb_build_object('depositId',v_deposit_id,'amountCop',net::text));
      end loop;
      result:=jsonb_build_object('depositId',v_deposit_id,'cashMovementId',movement,'amountCop',amount::text);
    elsif p_action='reverse_deposit' then
      if (a->>'confirmed') is distinct from 'true' or length(btrim(coalesce(a->>'reason','')))<3 then raise exception 'shipping_confirmation_reason_required'; end if;
      select * into d from public.erp_shipping_deposits where erp_shipping_deposits.id=(a->>'id')::uuid for update;
      if not found or d.status<>'active' then raise exception 'shipping_deposit_not_active'; end if;
      perform 1 from public.erp_shipments sh where sh.id in (select al.shipment_id from public.erp_shipping_allocations al where al.deposit_id=d.id) order by sh.id for update;
      perform 1 from public.sales sa where sa.id in (select sh.sale_id from public.erp_shipments sh join public.erp_shipping_allocations al on al.shipment_id=sh.id where al.deposit_id=d.id) order by sa.id for update;
      -- Usar el reverso existente conserva reglas de caja, unicidad y auditoría monetaria.
      perform set_config('erp.shipping_reversal',d.id::text,true);
      movement:=public.erp_reverse_cash_movement(d.cash_movement_id,a->>'reason');
      perform set_config('erp.shipping_reversal','',true);
      update public.erp_shipping_deposits set status='reversed',reversal_movement_id=movement,reversal_reason=a->>'reason' where erp_shipping_deposits.id=d.id;
      for entry in select to_jsonb(al) from public.erp_shipping_allocations al where al.deposit_id=d.id and al.reversed_at is null loop
        net:=(entry->>'amount_cop')::bigint;
        update public.erp_shipments set received_cop=received_cop-net,collection_status=case when received_cop-net=0 then 'pending' else 'partial' end,version=version+1,updated_at=now() where erp_shipments.id=(entry->>'shipment_id')::uuid returning * into s;
        update public.sales set payment_status=case when s.received_cop=0 then 'pendiente' else 'parcial' end where sales.id=s.sale_id;
        insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,metadata)
          values('web_admin',actor::text,'api','shipping.collection_reversed','shipment',s.id,jsonb_build_object('depositId',d.id,'amountCop',net::text,'reason',a->>'reason'));
      end loop;
      update public.erp_shipping_allocations set reversed_at=now() where deposit_id=d.id and reversed_at is null;
      result:=jsonb_build_object('depositId',d.id,'reversalMovementId',movement);
    end if;
  end if;
  if result is null then result:=public.erp_shipping_json(s); end if;
  insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,request_id,before_snapshot,after_snapshot,metadata)
    values('web_admin',actor::text,'api','shipping.'||p_action,case when p_action in ('configure','reconcile','reverse_deposit') then 'shipping_operation' else 'shipment' end,
      s.id,p_request_id::text,before_state,jsonb_build_object('status',s.status,'version',s.version),jsonb_build_object('reason',a->>'reason','depositId',result->>'depositId'));
  insert into public.erp_shipping_requests(request_id,actor_id,action,arguments,result) values(p_request_id,actor,p_action,a,result);
  return result;
end $$;

-- La pantalla de caja anterior no puede revertir sólo el dinero de una consignación
-- dejando su conciliación vigente. Tampoco puede cobrar por segunda vez una venta COD.
create or replace function public.erp_shipping_cash_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare dep uuid;
begin
  if new.reversal_of_id is not null then
    select id into dep from public.erp_shipping_deposits where cash_movement_id=new.reversal_of_id;
    if dep is not null and current_setting('erp.shipping_reversal',true) is distinct from dep::text then
      raise exception 'shipping_reverse_deposit_through_shipping';
    end if;
  end if;
  if new.sale_id is not null and new.amount_cop>0 and exists(select 1 from public.erp_shipments where sale_id=new.sale_id and payment_mode='cod' and status<>'cancelled') then
    raise exception 'shipping_sale_collection_managed';
  end if;
  return new;
end $$;
drop trigger if exists erp_shipping_cash_guard on public.cash_movements;
create trigger erp_shipping_cash_guard before insert on public.cash_movements for each row execute function public.erp_shipping_cash_guard();
revoke all on function public.erp_shipping_cash_guard() from public,anon,authenticated;

-- Outbox duradero. Preparar/consumir avisos NO modifica entrega ni dinero.
create or replace function public.erp_shipping_prepare_jobs()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg public.erp_shipping_settings%rowtype; local_now timestamp:=now() at time zone 'America/Bogota'; inserted integer:=0;
begin
  select * into cfg from public.erp_shipping_settings where singleton;
  if not cfg.enabled then return 0; end if;
  if extract(hour from local_now)>=cfg.reminder_hour then
    insert into public.erp_shipping_jobs(kind,dedupe_key,due_at,recipient_ids,payload)
      select 'pending_guides','nightly:'||local_now::date,now(),cfg.recipient_ids,jsonb_build_object('date',local_now::date,'pendingCount',count(*),'confirmsDelivery',false)
      from public.erp_shipments where status='pending_guide' having count(*)>0 on conflict(dedupe_key) do nothing;
    get diagnostics inserted=row_count;
  end if;
  return inserted;
end $$;
create or replace function public.erp_shipping_claim_jobs(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  perform public.erp_shipping_prepare_jobs();
  if not exists(select 1 from public.erp_shipping_settings where singleton and enabled) then return '[]'; end if;
  with picked as (select id from public.erp_shipping_jobs where due_at<=now() and (status='pending' or (status='processing' and lease_until<now())) order by due_at limit greatest(1,least(p_limit,50)) for update skip locked),
  claimed as (update public.erp_shipping_jobs j set status='processing',attempts=attempts+1,lease_until=now()+interval '5 minutes',lease_token=gen_random_uuid() from picked p where j.id=p.id returning j.*)
  select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed;
  return result;
end $$;
create or replace function public.erp_shipping_complete_job(p_id uuid,p_lease_token uuid,p_success boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer;
begin
  update public.erp_shipping_jobs set status=case when p_success then 'done' else 'pending' end,
    completed_at=case when p_success then now() else null end,lease_until=null,lease_token=null,
    due_at=case when p_success then due_at else now()+least(attempts,60)*interval '1 minute' end,
    last_error=case when p_success then null else left(p_error,80) end
    where id=p_id and status='processing' and lease_token=p_lease_token and lease_until>=now();
  get diagnostics changed=row_count; return changed=1;
end $$;

-- Extensión compatible del dispatcher WhatsApp: reusa operador, rol, HMAC del API,
-- ledger de solicitudes y confirmación de diez minutos ya existentes.
do $$ begin
  if to_regprocedure('public.erp_agent_action_policy_pre_shipping(text)') is null then
    alter function public.erp_agent_action_policy(text) rename to erp_agent_action_policy_pre_shipping;
  end if;
  if to_regprocedure('public.erp_agent_dispatch_pre_shipping(uuid,text,jsonb,uuid)') is null then
    alter function public.erp_agent_dispatch(uuid,text,jsonb,uuid) rename to erp_agent_dispatch_pre_shipping;
  end if;
end $$;
create or replace function public.erp_agent_action_policy(p_action text)
returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select case when p_action in ('shipping.create','shipping.list','shipping.detail','shipping.guide','shipping.dispatch','shipping.deliver','shipping.pending_collections')
 then jsonb_build_object('permission',public.erp_shipping_permission(substr(p_action,10)),'risk',case when p_action in ('shipping.list','shipping.detail','shipping.pending_collections') then 'read' else 'write' end)
 else public.erp_agent_action_policy_pre_shipping(p_action) end;
$$;
create or replace function public.erp_agent_dispatch(p_profile_id uuid,p_action text,p_arguments jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_action in ('shipping.create','shipping.list','shipping.detail','shipping.guide','shipping.dispatch','shipping.deliver','shipping.pending_collections') then
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
  if p_action not in ('shipping.create','shipping.list','shipping.detail','shipping.guide','shipping.dispatch','shipping.deliver','shipping.pending_collections') then raise exception 'shipping_unknown_action'; end if;
  select c.operator_id into operator_id from public.erp_agent_operator_context(p_wa_id_hash) c;
  if operator_id is null then raise exception 'erp_agent_operator_not_authorized' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shipping-agent:'||coalesce(p_meta_message_id,''),0));
  select * into previous from public.whatsapp_erp_requests where meta_message_id=p_meta_message_id;
  if found and (previous.operator_id<>operator_id or previous.request_id<>p_request_id or previous.action<>p_action or previous.arguments<>p_arguments) then
    raise exception 'shipping_idempotency_conflict';
  end if;
  return public.erp_agent_submit_request(p_wa_id_hash,p_meta_message_id,p_request_id,p_action,p_arguments,p_confirmation_hash);
end $$;

revoke all on function public.erp_shipping_money(text),public.erp_shipping_json(public.erp_shipments),public.erp_shipping_permission(text),public.erp_shipping_command(text,jsonb,uuid),public.erp_shipping_business_due(timestamptz,integer),public.erp_shipping_prepare_jobs(),public.erp_shipping_claim_jobs(integer),public.erp_shipping_complete_job(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.erp_shipping_command(text,jsonb,uuid) to authenticated;
grant execute on function public.erp_shipping_prepare_jobs(),public.erp_shipping_claim_jobs(integer),public.erp_shipping_complete_job(uuid,uuid,boolean,text) to service_role;
revoke all on function public.erp_agent_action_policy(text),public.erp_agent_dispatch(uuid,text,jsonb,uuid),public.erp_agent_action_policy_pre_shipping(text),public.erp_agent_dispatch_pre_shipping(uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.erp_agent_action_policy(text) to service_role;
revoke all on function public.erp_shipping_agent_submit(text,text,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.erp_shipping_agent_submit(text,text,uuid,text,jsonb,text) to service_role;

-- Recuperación sin perder evidencia: UPDATE erp_shipping_settings SET enabled=false;
-- y ERP_SHIPPING_ENABLED=false. Se preservan ventas, caja, auditoría y tablas nuevas.
-- Rollback estructural sólo en BD descartable SIN registros: restaurar dispatcher/policy
-- renombrando *_pre_shipping (antes eliminar wrappers), eliminar funciones erp_shipping_*,
-- luego tablas en orden jobs,allocations,deposits,requests,shipment_units,shipments,settings.
-- Nunca borrar tablas con recaudos: los reversos son la operación de recuperación contable.
commit;
