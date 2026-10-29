-- Devolución en dos pasos: «Devolver» deja el envío en devolución (return_pending) y las unidades siguen vendidas;
-- «Confirmar reingreso» (misma guía) cierra el envío como devuelto y deja las unidades disponibles.
-- Aditiva. Recuperación: volver a aplicar la definición anterior de erp_shipping_command/erp_shipping_permission (migración 20261023070000)
-- y restaurar el check sin 'return_pending' (antes, mover a 'returned' los envíos en return_pending).
alter table public.erp_shipments drop constraint if exists erp_shipments_status_check;
alter table public.erp_shipments add constraint erp_shipments_status_check
  check(status in ('pending_guide','ready','dispatched','incident','delivered','return_pending','returned','cancelled'));

CREATE OR REPLACE FUNCTION public.erp_shipping_permission(p_action text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select case when p_action in('transport_save','difference_review') then 'profitability.manage'
 when p_action in('list','detail','sales','settings','jobs') then 'sales.read'
 when p_action in('pending_collections','deposits','metrics','references') then 'cash.read'
 when p_action in('create','guide','dispatch','deliver','incident','cancel','return','return_confirm') then 'sales.manage'
 when p_action in('reconcile','reverse_deposit','apply_deposit_credit') then 'cash.manage'
 when p_action='configure' then 'users.manage' else null end;
$function$;

CREATE OR REPLACE FUNCTION public.erp_shipping_command(p_action text, p_arguments jsonb DEFAULT '{}'::jsonb, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  a jsonb:=coalesce(p_arguments,'{}'); actor uuid:=auth.uid(); permission text;
  s public.erp_shipments%rowtype; sale public.sales%rowtype; d public.erp_shipping_deposits%rowtype;
  settings public.erp_shipping_settings%rowtype; old_request public.erp_shipping_requests%rowtype;
  result jsonb; before_state jsonb; items jsonb; entry jsonb; amount bigint; total bigint:=0; net bigint; received bigint;
  v_deposit_id uuid; movement uuid; unit record; count_units integer; offset_n integer; limit_n integer; changed integer;
  concept uuid; v_withheld bigint; v_balance bigint; v_reported bigint; v_credit bigint:=0; diff public.erp_shipping_differences%rowtype;
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
  elsif p_action='references' then
    select * into s from public.erp_shipments where id=(a->>'id')::uuid;
    if not found then raise exception 'shipping_not_found'; end if;
    return jsonb_build_object('prepayments',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select cm.id,cm.movement_number,(-cm.amount_cop)::text amount_cop,cm.description from public.cash_movements cm
      where cm.movement_type in('manual_out','expense') and (cm.expense_id is null or exists(select 1 from public.operating_expenses e where e.id=cm.expense_id and e.status='active')) and not exists(select 1 from public.cash_movements r where r.reversal_of_id=cm.id)
      and (coalesce(a->>'search','')='' or cm.movement_number ilike '%'||(a->>'search')||'%') order by cm.created_at desc limit 100)x),'[]'),
      'costs',case when public.erp_has_permission('profitability.view') then coalesce((select jsonb_agg(to_jsonb(x)) from (
        select ce.id,ce.cost_number,ce.amount_cop::text amount_cop,ce.description from public.cost_entries ce
        where ce.sale_id=s.sale_id and ce.category in('transport','sale_fee') and ce.entry_kind='cost' and ce.reference_type is null
        and not exists(select 1 from public.cost_entries r where r.reversal_of_id=ce.id)
        and not exists(select 1 from public.erp_shipping_transport t where t.existing_cost_entry_id=ce.id) order by ce.created_at desc limit 100)x),'[]') else '[]'::jsonb end);
  elsif p_action='deposits' then
    select coalesce(jsonb_agg(to_jsonb(q)),'[]') into items from (
      select dep.id,dep.amount_cop::text as amount_cop,dep.unallocated_cop::text as unallocated_cop,dep.deposited_on,dep.account,dep.reference,dep.status,dep.evidence,dep.reversal_reason,
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
      'differenceCop',coalesce(sum(expected_net_cop-received_cop) filter(where status='delivered'),0)::text,
      'unreviewedDifferences',(select count(*) from public.erp_shipping_differences where status='pending'),
      'unallocatedCop',(select coalesce(sum(unallocated_cop),0)::text from public.erp_shipping_deposits where status='active'))
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
    if p_action='transport_save' then
      if (a->>'confirmed') is distinct from 'true' or length(btrim(coalesce(a->>'reason','')))<3 then raise exception 'shipping_confirmation_reason_required'; end if;
      select * into s from public.erp_shipments where id=(a->>'id')::uuid for update;
      if not found then raise exception 'shipping_not_found'; end if;
      if coalesce((a->>'version')::int,0)<>s.version then raise exception 'shipping_version_conflict'; end if;
      if coalesce((a->>'incurred')::boolean,false) and s.status in('pending_guide','ready') then raise exception 'shipping_transport_not_incurred'; end if;
      before_state:=public.erp_shipping_json(s);
      concept:=public.erp_shipping_transport_save(s.id,a->'concept',s.status in('delivered','return_pending','returned') or coalesce((a->>'incurred')::boolean,false));
      update public.erp_shipments set transport_classified=true,version=version+1,updated_at=now() where id=s.id;
      perform public.erp_shipping_transport_refresh(s.id,false);
      select * into s from public.erp_shipments where id=s.id;
    elsif p_action='difference_review' then
      if (a->>'confirmed') is distinct from 'true' or length(btrim(coalesce(a->>'reason','')))<3 then raise exception 'shipping_confirmation_reason_required'; end if;
      select * into diff from public.erp_shipping_differences where id=(a->>'id')::uuid for update;
      if not found or diff.status<>'pending' then raise exception 'shipping_difference_not_pending'; end if;
      update public.erp_shipping_differences set status=case when coalesce((a->>'resolved')::boolean,false) then 'reviewed' else 'pending' end,reason=btrim(a->>'reason'),reviewed_by=actor,reviewed_at=now() where id=diff.id;
      perform public.erp_shipping_transport_refresh(diff.shipment_id,false);
      select * into s from public.erp_shipments where id=diff.shipment_id;
      result:=jsonb_build_object('id',diff.id,'status',case when coalesce((a->>'resolved')::boolean,false) then 'reviewed' else 'pending' end,'costsCreated',0,'cashCreated',0);
    elsif p_action='apply_deposit_credit' then
      if (a->>'confirmed') is distinct from 'true' then raise exception 'shipping_confirmation_required'; end if;
      select * into d from public.erp_shipping_deposits where id=(a->>'depositId')::uuid for update;
      if not found or d.status<>'active' then raise exception 'shipping_deposit_not_active'; end if;
      select * into s from public.erp_shipments where id=(a->>'id')::uuid for update;
      if not found or s.status<>'delivered' then raise exception 'shipping_balance_not_pending'; end if;
      if coalesce((a->>'version')::int,0)<>s.version then raise exception 'shipping_version_conflict'; end if;
      amount:=public.erp_shipping_money(a->>'amountCop');
      if amount<=0 or amount>d.unallocated_cop or amount>s.expected_net_cop-s.received_cop then raise exception 'shipping_credit_exceeds_balance'; end if;
      insert into public.erp_shipping_allocations(deposit_id,shipment_id,amount_cop) values(d.id,s.id,amount)
      on conflict(deposit_id,shipment_id) do update set amount_cop=erp_shipping_allocations.amount_cop+excluded.amount_cop;
      update public.erp_shipping_deposits set unallocated_cop=unallocated_cop-amount where id=d.id;
      update public.erp_shipments set received_cop=received_cop+amount,collection_status=case when received_cop+amount=expected_net_cop then 'reconciled' else 'partial' end,version=version+1,updated_at=now() where id=s.id returning * into s;
      update public.sales set payment_status=case when s.collection_status='reconciled' then 'pagado' else 'parcial' end where id=s.sale_id;
      result:=jsonb_build_object('depositId',d.id,'appliedCop',amount::text,'cashCreated',0);
    elsif p_action='create' then
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
    elsif p_action in ('guide','dispatch','deliver','incident','cancel','return','return_confirm') then
      select * into s from public.erp_shipments where id=(a->>'id')::uuid for update;
      if not found then raise exception 'shipping_not_found'; end if;
      if coalesce((a->>'version')::integer,0)<>s.version then raise exception 'shipping_version_conflict'; end if;
      before_state:=jsonb_build_object('status',s.status,'collection_status',s.collection_status,'version',s.version);
      if p_action='guide' then
        if s.status<>'pending_guide' then raise exception 'shipping_guide_already_registered'; end if;
        amount:=public.erp_shipping_money(a->>'freightCop');
        net:=public.erp_shipping_money(coalesce(a->>'deductionsCop','0'));
        if net>0 and length(btrim(coalesce(a->>'deductionReason','')))<3 then raise exception 'shipping_deduction_reason_required'; end if;
        if not (a ? 'transport') and s.payment_mode='cod' and amount+net>s.collect_cop then raise exception 'shipping_deductions_exceed_collection'; end if;
        update public.erp_shipments set guide=btrim(a->>'guide'),freight_cop=amount,deductions_cop=net,deduction_reason=nullif(btrim(a->>'deductionReason'),''),guide_registered_at=now(),status='ready' where id=s.id returning * into s;
        if s.guide is null then raise exception 'shipping_guide_required'; end if;
        if a ? 'transport' then
          if jsonb_typeof(a->'transport') is distinct from 'array' or jsonb_array_length(a->'transport') not between 1 and 20 then raise exception 'shipping_transport_items_required'; end if;
          if (select count(*) from jsonb_array_elements(a->'transport'))<>(select count(distinct x->>'code') from jsonb_array_elements(a->'transport') x) then raise exception 'shipping_transport_duplicate_code'; end if;
          if (select count(*) from jsonb_array_elements(a->'transport') x where x->>'kind'='freight')<>1
            or (select public.erp_shipping_money(x->>'amountCop') from jsonb_array_elements(a->'transport') x where x->>'kind'='freight')<>amount then raise exception 'shipping_freight_concept_mismatch'; end if;
          for entry in select value from jsonb_array_elements(a->'transport') loop perform public.erp_shipping_transport_save(s.id,entry,false); end loop;
          update public.erp_shipments set transport_classified=true where id=s.id;
          perform public.erp_shipping_transport_refresh(s.id,false);
          select * into s from public.erp_shipments where id=s.id;
        else
          insert into public.erp_shipping_transport(shipment_id,code,kind,description,amount_cop,cost_bearer,settlement,provisional,updated_by)
            values(s.id,'freight','freight','Flete anterior: pendiente clasificar responsable',amount,'unclassified',case when s.payment_mode='cod' then 'withheld' else 'unclassified' end,true,actor);
          if net>0 then insert into public.erp_shipping_transport(shipment_id,code,kind,description,amount_cop,cost_bearer,settlement,provisional,updated_by)
            values(s.id,'legacy_deductions','other',coalesce(s.deduction_reason,'Conceptos anteriores por revisar'),net,'unclassified',case when s.payment_mode='cod' then 'withheld' else 'unclassified' end,true,actor); end if;
        end if;
        insert into public.erp_shipping_jobs(kind,dedupe_key,shipment_id,due_at,recipient_ids,payload)
        values('verify_delivery','guide:'||s.id,s.id,public.erp_shipping_business_due(now(),3),settings.recipient_ids,jsonb_build_object('shipmentId',s.id,'confirmsDelivery',false)) on conflict(dedupe_key) do nothing;
      elsif p_action='dispatch' then
        if s.status<>'ready' then raise exception 'shipping_dispatch_requires_guide'; end if;
        update public.erp_shipments set status='dispatched',dispatched_at=now() where id=s.id returning * into s;
      elsif p_action='deliver' then
        if s.status not in ('dispatched','incident') then raise exception 'shipping_delivery_requires_dispatch'; end if;
        select coalesce(sum(amount_cop),0) into v_withheld from public.erp_shipping_transport where shipment_id=s.id and settlement='withheld';
        net:=case when s.payment_mode='cod' then s.collect_cop-case when s.transport_classified then v_withheld else s.freight_cop+s.deductions_cop end else 0 end;
        if public.erp_shipping_money(a->>'expectedNetCop')<>net then raise exception 'shipping_expected_net_mismatch'; end if;
        if (a->>'deliveredAt')::timestamptz>s.created_at+interval '10 years' or (a->>'deliveredAt')::timestamptz>now()+interval '5 minutes' or (a->>'deliveredAt')::timestamptz<s.dispatched_at then raise exception 'shipping_invalid_delivery_date'; end if;
        if nullif(btrim(a->>'evidence'),'') is null or length(a->>'evidence')>1000 or a->>'deliveredAt' is null then raise exception 'shipping_delivery_evidence_required'; end if;
        if s.payment_mode='cod' and net=0 then raise exception 'shipping_zero_net_requires_manual_accounting_review'; end if;
        update public.erp_shipments set status='delivered',expected_net_cop=net,collection_status=case when net=0 then 'reconciled' else 'pending' end,
          delivered_at=(a->>'deliveredAt')::timestamptz,delivered_by=actor,delivery_evidence=btrim(a->>'evidence') where id=s.id returning * into s;
        perform public.erp_shipping_transport_refresh(s.id,true);
        select * into s from public.erp_shipments where id=s.id;
        update public.erp_shipping_jobs set status='cancelled' where shipment_id=s.id and status in ('pending','processing');
      else
        if length(btrim(coalesce(a->>'reason','')))<3 or length(a->>'reason')>1000 then raise exception 'shipping_reason_required'; end if;
        if p_action='incident' and s.status not in ('dispatched','incident') then raise exception 'shipping_invalid_incident_state'; end if;
        if p_action='cancel' and s.status not in ('pending_guide','ready') then raise exception 'shipping_cancel_requires_undispatched'; end if;
        if p_action='return' and s.status not in ('dispatched','incident','delivered') then raise exception 'shipping_invalid_return_state'; end if;
        if p_action='return' and s.received_cop>0 then raise exception 'shipping_reverse_collection_before_return'; end if;
        if p_action='return_confirm' and s.status<>'return_pending' then raise exception 'shipping_invalid_return_confirm_state'; end if;
        if p_action='return_confirm' and lower(btrim(coalesce(a->>'guide','')))<>lower(btrim(coalesce(s.guide,''))) then raise exception 'shipping_return_guide_mismatch'; end if;
        -- Cancelar sólo el envío NO anula la venta ni libera stock. Devolución física va a returned,
        -- nunca available: requiere inspección y gestión comercial existente antes de reventa.
        -- Devolver sólo deja el envío «en devolución»: las unidades siguen vendidas hasta confirmar su reingreso.
        -- Al confirmar el reingreso con la misma guía, vuelven a disponible (el trigger del taller exige controles vigentes).
        if p_action='return_confirm' then
          for unit in select u.* from public.product_units u join public.erp_shipment_units su on su.unit_id=u.id where su.shipment_id=s.id order by u.id for update of u loop
            if unit.status<>'sold' then raise exception 'shipping_return_unit_state_conflict'; end if;
            update public.product_units set status='available' where id=unit.id;
            insert into public.inventory_movements(unit_id,product_id,movement_type,from_status,to_status,reference_type,reference_id,reason,created_by,actor_ref)
              values(unit.id,unit.product_id,'return','sold','available','shipment',s.id,a->>'reason',actor,actor::text);
          end loop;
        end if;
        update public.erp_shipments set status=case p_action when 'incident' then 'incident' when 'return' then 'return_pending' when 'return_confirm' then 'returned' else 'cancelled' end,
          collection_status=case when p_action in ('return','return_confirm') then 'not_due' else collection_status end where id=s.id returning * into s;
        if coalesce((a->>'recognizeTransport')::boolean,false) then perform public.erp_shipping_transport_refresh(s.id,true); end if;
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
        if net<=0 or (net>s.expected_net_cop-s.received_cop and coalesce((entry->>'finalSettlement')::boolean,false) is distinct from true) then raise exception 'shipping_allocation_exceeds_balance'; end if;
        v_credit:=v_credit+greatest(0,net-(s.expected_net_cop-s.received_cop));
        if coalesce((entry->>'version')::integer,0)<>s.version then raise exception 'shipping_version_conflict'; end if;
        if exists(select 1 from public.cash_movements cm where cm.sale_id=s.sale_id and cm.amount_cop>0 and not exists(select 1 from public.cash_movements r where r.reversal_of_id=cm.id)) then raise exception 'shipping_sale_has_existing_cash'; end if;
        total:=total+net;
      end loop;
      if total<>amount then raise exception 'shipping_deposit_allocation_mismatch'; end if;
      if (a->>'depositedOn')::date>(now() at time zone 'America/Bogota')::date or a->>'depositedOn' is null then raise exception 'shipping_invalid_deposit_date'; end if;
      v_deposit_id:=gen_random_uuid();
      insert into public.cash_movements(movement_number,session_id,movement_type,payment_method,amount_cop,description,metadata,created_by)
      values('MOV-'||lpad(nextval('public.cash_movement_number_seq')::text,6,'0'),public.erp_current_cash_session_id(),'manual_in','transferencia',amount,'Recaudo transportadora',jsonb_build_object('shippingDepositId',v_deposit_id,'kind','carrier_collection'),actor) returning id into movement;
      insert into public.erp_shipping_deposits(id,amount_cop,unallocated_cop,deposited_on,account,reference,evidence,cash_movement_id,created_by)
      values(v_deposit_id,amount,v_credit,(a->>'depositedOn')::date,btrim(a->>'account'),btrim(a->>'reference'),a->>'evidence',movement,actor);
      for entry in select value from jsonb_array_elements(a->'allocations') loop
        select * into s from public.erp_shipments where id=(entry->>'shipmentId')::uuid;
        v_balance:=s.expected_net_cop-s.received_cop;
        v_reported:=public.erp_shipping_money(entry->>'amountCop');
        if coalesce((entry->>'finalSettlement')::boolean,false) and v_reported<>v_balance then
          insert into public.erp_shipping_differences(shipment_id,deposit_id,expected_cop,actual_cop,difference_cop)
            values(s.id,v_deposit_id,v_balance,v_reported,v_reported-v_balance);
          update public.erp_shipments set transport_review_required=true where id=s.id;
        end if;
        net:=least(v_balance,v_reported);
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
      update public.erp_shipping_deposits set status='reversed',unallocated_cop=0,reversal_movement_id=movement,reversal_reason=a->>'reason' where erp_shipping_deposits.id=d.id;
      for entry in select to_jsonb(al) from public.erp_shipping_allocations al where al.deposit_id=d.id and al.reversed_at is null loop
        net:=(entry->>'amount_cop')::bigint;
        update public.erp_shipments set received_cop=received_cop-net,collection_status=case when received_cop-net=0 then 'pending' else 'partial' end,version=version+1,updated_at=now() where erp_shipments.id=(entry->>'shipment_id')::uuid returning * into s;
        update public.sales set payment_status=case when s.received_cop=0 then 'pendiente' else 'parcial' end where sales.id=s.sale_id;
        insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,metadata)
          values('web_admin',actor::text,'api','shipping.collection_reversed','shipment',s.id,jsonb_build_object('depositId',d.id,'amountCop',net::text,'reason',a->>'reason'));
      end loop;
      update public.erp_shipping_allocations set reversed_at=now() where deposit_id=d.id and reversed_at is null;
      update public.erp_shipping_differences set status='reversed',reason=a->>'reason',reviewed_by=actor,reviewed_at=now() where deposit_id=d.id;
      for s in select sh.* from public.erp_shipments sh join public.erp_shipping_allocations al on al.shipment_id=sh.id where al.deposit_id=d.id loop
        perform public.erp_shipping_transport_refresh(s.id,false);
      end loop;
      result:=jsonb_build_object('depositId',d.id,'reversalMovementId',movement);
    end if;
  end if;
  if result is null then result:=public.erp_shipping_json(s); end if;
  insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,request_id,before_snapshot,after_snapshot,metadata)
    values('web_admin',actor::text,'api','shipping.'||p_action,case when p_action in ('configure','reconcile','reverse_deposit') then 'shipping_operation' else 'shipment' end,
      s.id,p_request_id::text,before_state,jsonb_build_object('status',s.status,'version',s.version),jsonb_build_object('reason',a->>'reason','depositId',result->>'depositId'));
  insert into public.erp_shipping_requests(request_id,actor_id,action,arguments,result) values(p_request_id,actor,p_action,a,result);
  return result;
end $function$;
