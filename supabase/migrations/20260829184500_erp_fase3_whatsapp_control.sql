-- SISTETECNI ERP — Fase 3A.2 + 3B control plane
-- Canal administrativo por WhatsApp sin acceso libre del modelo a Supabase.
--
-- Invariantes:
-- - el teléfono nunca se persiste: solo SHA-256 hexadecimal calculado server-side;
-- - cada número autorizado se enlaza a un profile ERP activo;
-- - los permisos siguen la matriz erp_role_has_permission() de Fase 2D;
-- - lecturas se ejecutan una vez por meta_message_id/request_id;
-- - escrituras requieren confirmación y se ejecutan bajo row lock en la misma transacción;
-- - el dispatcher es cerrado: no acepta SQL, nombres de tabla ni RPC arbitrarios;
-- - service_role puede invocar únicamente los entrypoints explícitos de esta migración.

create table if not exists public.whatsapp_erp_operators (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  wa_id_hash text not null unique,
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_erp_operators_hash_check check (wa_id_hash ~ '^[0-9a-f]{64}$')
);
create index if not exists idx_whatsapp_erp_operators_profile on public.whatsapp_erp_operators(profile_id);

drop trigger if exists whatsapp_erp_operators_set_updated_at on public.whatsapp_erp_operators;
create trigger whatsapp_erp_operators_set_updated_at
  before update on public.whatsapp_erp_operators
  for each row execute function public.erp_set_updated_at();

create table if not exists public.whatsapp_erp_requests (
  request_id uuid primary key,
  operator_id uuid not null references public.whatsapp_erp_operators(id) on delete restrict,
  meta_message_id text not null unique,
  action text not null,
  permission text not null,
  risk_level text not null,
  arguments jsonb not null default '{}'::jsonb,
  status text not null,
  confirmation_hash text,
  confirmation_expires_at timestamptz,
  confirmed_at timestamptz,
  executed_at timestamptz,
  result_safe jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_erp_requests_action_not_blank check (length(btrim(action)) > 0),
  constraint whatsapp_erp_requests_permission_not_blank check (length(btrim(permission)) > 0),
  constraint whatsapp_erp_requests_risk_check check (risk_level in ('read','write','sensitive')),
  constraint whatsapp_erp_requests_status_check check (status in ('received','pending_confirmation','executing','executed','failed','cancelled','expired')),
  constraint whatsapp_erp_requests_args_object check (jsonb_typeof(arguments) = 'object'),
  constraint whatsapp_erp_requests_result_object check (result_safe is null or jsonb_typeof(result_safe) = 'object'),
  constraint whatsapp_erp_requests_confirmation_hash_check check (confirmation_hash is null or confirmation_hash ~ '^[0-9a-f]{64}$')
);
create index if not exists idx_whatsapp_erp_requests_operator_created on public.whatsapp_erp_requests(operator_id,created_at desc);
create index if not exists idx_whatsapp_erp_requests_status on public.whatsapp_erp_requests(status,created_at desc);

drop trigger if exists whatsapp_erp_requests_set_updated_at on public.whatsapp_erp_requests;
create trigger whatsapp_erp_requests_set_updated_at
  before update on public.whatsapp_erp_requests
  for each row execute function public.erp_set_updated_at();

alter table public.whatsapp_erp_operators enable row level security;
alter table public.whatsapp_erp_requests enable row level security;
revoke all on table public.whatsapp_erp_operators from public,anon,authenticated;
revoke all on table public.whatsapp_erp_requests from public,anon,authenticated;
grant select,insert,update on table public.whatsapp_erp_operators to service_role;
grant select,insert,update on table public.whatsapp_erp_requests to service_role;

comment on table public.whatsapp_erp_operators is 'Fase 3: vincula un wa_id pseudonimizado con un perfil ERP. Nunca guarda el teléfono en claro.';
comment on table public.whatsapp_erp_requests is 'Fase 3: ledger idempotente de instrucciones administrativas WhatsApp y sus confirmaciones.';

-- Catálogo cerrado de acciones. Una acción no listada aquí no existe para el agente.
create or replace function public.erp_agent_action_policy(p_action text)
returns jsonb
language sql
immutable
set search_path=public,pg_temp
as $$
  select case lower(btrim(coalesce(p_action,'')))
    when 'inventory.summary'   then jsonb_build_object('permission','inventory.read','risk','read')
    when 'inventory.find'      then jsonb_build_object('permission','inventory.read','risk','read')
    when 'sales.today'         then jsonb_build_object('permission','sales.read','risk','read')
    when 'cash.status'         then jsonb_build_object('permission','cash.read','risk','read')
    when 'expenses.today'      then jsonb_build_object('permission','expenses.read','risk','read')
    when 'purchases.recent'    then jsonb_build_object('permission','purchases.read','risk','read')
    when 'warranties.open'     then jsonb_build_object('permission','warranties.open','risk','read')
    when 'customers.find'      then jsonb_build_object('permission','customers.manage','risk','read')
    when 'inventory.reserve'   then jsonb_build_object('permission','inventory.reserve','risk','write')
    when 'inventory.release'   then jsonb_build_object('permission','inventory.reserve','risk','write')
    when 'customer.create'     then jsonb_build_object('permission','customers.manage','risk','write')
    when 'expense.create'      then jsonb_build_object('permission','expenses.manage','risk','sensitive')
    when 'cash.open'           then jsonb_build_object('permission','cash.manage','risk','sensitive')
    when 'cash.close'          then jsonb_build_object('permission','cash.manage','risk','sensitive')
    when 'cash.movement'       then jsonb_build_object('permission','cash.manage','risk','sensitive')
    when 'sale.create_by_stu'  then jsonb_build_object('permission','sales.manage','risk','sensitive')
    else null
  end;
$$;
revoke all on function public.erp_agent_action_policy(text) from public,anon,authenticated;
grant execute on function public.erp_agent_action_policy(text) to service_role;

create or replace function public.erp_agent_upsert_operator(
  p_profile_id uuid,
  p_wa_id_hash text,
  p_label text default null,
  p_active boolean default true
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_id uuid; v_hash text:=lower(btrim(coalesce(p_wa_id_hash,'')));
begin
  if v_hash !~ '^[0-9a-f]{64}$' then raise exception 'erp_agent_invalid_wa_hash'; end if;
  if not exists(select 1 from public.profiles where id=p_profile_id) then raise exception 'erp_agent_profile_not_found'; end if;
  insert into public.whatsapp_erp_operators(profile_id,wa_id_hash,label,active)
  values(p_profile_id,v_hash,nullif(btrim(coalesce(p_label,'')),''),coalesce(p_active,true))
  on conflict(wa_id_hash) do update set
    profile_id=excluded.profile_id,label=excluded.label,active=excluded.active,updated_at=now()
  returning id into v_id;
  return v_id;
end;$$;
revoke all on function public.erp_agent_upsert_operator(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.erp_agent_upsert_operator(uuid,text,text,boolean) to service_role;

create or replace function public.erp_agent_operator_context(p_wa_id_hash text)
returns table(operator_id uuid,profile_id uuid,erp_role text,display_name text)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select o.id,p.id,p.erp_role,coalesce(p.display_name,p.email)
  from public.whatsapp_erp_operators o
  join public.profiles p on p.id=o.profile_id
  where o.wa_id_hash=lower(btrim(coalesce(p_wa_id_hash,'')))
    and o.active=true and p.active=true
  limit 1;
$$;
revoke all on function public.erp_agent_operator_context(text) from public,anon,authenticated;
grant execute on function public.erp_agent_operator_context(text) to service_role;

-- Dispatcher interno. Se llama únicamente después de validar operador+permiso.
create or replace function public.erp_agent_dispatch(
  p_profile_id uuid,
  p_action text,
  p_arguments jsonb,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_action text:=lower(btrim(coalesce(p_action,'')));
  v_args jsonb:=coalesce(p_arguments,'{}'::jsonb);
  v_result jsonb;
  v_q text;
  v_unit public.product_units%rowtype;
  v_product public.products%rowtype;
  v_session public.cash_sessions%rowtype;
  v_expected bigint;
  v_id uuid;
  v_customer_id uuid;
  v_purchase_id uuid;
  v_price bigint;
  v_hours integer;
  v_items jsonb;
begin
  -- Las RPC ERP existentes derivan actor/permiso de auth.uid(). Para reutilizar
  -- exactamente esas invariantes, se fija el claim SOLO en esta transacción.
  perform set_config('request.jwt.claim.sub',p_profile_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_profile_id::text,'role','authenticated')::text,true);

  case v_action
    when 'inventory.summary' then
      select jsonb_build_object(
        'total',count(*),
        'received',count(*) filter(where status='received'),
        'inspection',count(*) filter(where status='inspection'),
        'available',count(*) filter(where status='available'),
        'reserved',count(*) filter(where status='reserved'),
        'sold',count(*) filter(where status='sold'),
        'warranty',count(*) filter(where status='warranty'),
        'repair',count(*) filter(where status='repair'),
        'returned',count(*) filter(where status='returned'),
        'retired',count(*) filter(where status='retired')
      ) into v_result from public.product_units;

    when 'inventory.find' then
      v_q:=lower(btrim(coalesce(v_args->>'query','')));
      if length(v_q)<2 then raise exception 'erp_agent_query_too_short'; end if;
      select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) into v_result
      from (
        select u.id,u.unit_code as "unitCode",u.serial_number as "serialNumber",u.status,
               p.title as "productTitle",p.brand,p.model,p.price
        from public.product_units u join public.products p on p.id=u.product_id
        where lower(u.unit_code) like '%'||v_q||'%'
           or lower(coalesce(u.serial_number,'')) like '%'||v_q||'%'
           or lower(coalesce(p.title,'')) like '%'||v_q||'%'
           or lower(coalesce(p.brand,'')) like '%'||v_q||'%'
           or lower(coalesce(p.model,'')) like '%'||v_q||'%'
        order by u.created_at desc limit 12
      ) x;

    when 'sales.today' then
      select jsonb_build_object(
        'count',count(*),'totalCop',coalesce(sum(total_cop),0),
        'paidCop',coalesce(sum(total_cop) filter(where payment_status='pagado'),0),
        'pendingCount',count(*) filter(where payment_status<>'pagado')
      ) into v_result
      from public.sales
      where (created_at at time zone 'America/Bogota')::date=(now() at time zone 'America/Bogota')::date;
      v_result:=v_result||jsonb_build_object('recent',(
        select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from (
          select sale_number as "saleNumber",customer_name as "customerName",total_cop as "totalCop",payment_method as "paymentMethod",payment_status as "paymentStatus",created_at as "createdAt"
          from public.sales
          where (created_at at time zone 'America/Bogota')::date=(now() at time zone 'America/Bogota')::date
          order by created_at desc limit 8
        ) s));

    when 'cash.status' then
      select * into v_session from public.cash_sessions where status='open' order by opened_at desc limit 1;
      if not found then
        v_result:=jsonb_build_object('open',false);
      else
        select v_session.opening_cash_cop+coalesce(sum(amount_cop),0) into v_expected
        from public.cash_movements where session_id=v_session.id and payment_method='efectivo';
        v_result:=jsonb_build_object('open',true,'sessionId',v_session.id,'sessionNumber',v_session.session_number,
          'openingCashCop',v_session.opening_cash_cop,'expectedCashCop',v_expected,'openedAt',v_session.opened_at);
      end if;

    when 'expenses.today' then
      select jsonb_build_object('count',count(*),'totalCop',coalesce(sum(amount_cop),0)) into v_result
      from public.operating_expenses
      where status='active' and occurred_on=(now() at time zone 'America/Bogota')::date;
      v_result:=v_result||jsonb_build_object('recent',(
        select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) from (
          select expense_number as "expenseNumber",category,description,amount_cop as "amountCop",payment_method as "paymentMethod",payee
          from public.operating_expenses
          where status='active' and occurred_on=(now() at time zone 'America/Bogota')::date
          order by created_at desc limit 8
        ) e));

    when 'purchases.recent' then
      select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb)) into v_result
      from (
        select purchase_number as "purchaseNumber",supplier_name_snapshot as "supplier",purchase_date as "purchaseDate",
               item_count as "itemCount",total_cost_cop as "totalCostCop",created_at as "createdAt"
        from public.purchases order by created_at desc limit 10
      ) p;

    when 'warranties.open' then
      select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb)) into v_result
      from (
        select case_number as "caseNumber",case_type as "caseType",status,customer_name_snapshot as "customerName",
               product_name_snapshot as "productName",unit_code_snapshot as "unitCode",reported_issue as "reportedIssue",
               coverage_status as "coverageStatus",opened_at as "openedAt"
        from public.after_sales_cases
        where status not in ('closed','cancelled') order by opened_at desc limit 12
      ) c;

    when 'customers.find' then
      v_q:=lower(btrim(coalesce(v_args->>'query','')));
      if length(v_q)<2 then raise exception 'erp_agent_query_too_short'; end if;
      select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb)) into v_result
      from (
        select id,full_name as "fullName",document_type as "documentType",document_number as "documentNumber",phone,email,city,active
        from public.customers
        where lower(full_name) like '%'||v_q||'%'
           or lower(coalesce(document_number,'')) like '%'||v_q||'%'
           or lower(coalesce(phone,'')) like '%'||v_q||'%'
        order by updated_at desc limit 10
      ) c;

    when 'inventory.reserve' then
      select * into v_unit from public.product_units where upper(unit_code)=upper(btrim(coalesce(v_args->>'unitCode',''))) limit 1;
      if not found then raise exception 'unit_not_found'; end if;
      v_hours:=coalesce((nullif(v_args->>'expiresHours',''))::integer,24);
      if v_hours<1 or v_hours>720 then raise exception 'reservation_hours_invalid'; end if;
      v_id:=public.erp_transition_product_unit(v_unit.id,'reserved',nullif(v_args->>'reason',''),
        nullif(btrim(coalesce(v_args->>'customerName','')),''),nullif(btrim(coalesce(v_args->>'customerPhone','')),''),now()+make_interval(hours=>v_hours));
      v_result:=jsonb_build_object('unitId',v_id,'unitCode',v_unit.unit_code,'status','reserved');

    when 'inventory.release' then
      select * into v_unit from public.product_units where upper(unit_code)=upper(btrim(coalesce(v_args->>'unitCode',''))) limit 1;
      if not found then raise exception 'unit_not_found'; end if;
      v_id:=public.erp_transition_product_unit(v_unit.id,'available',coalesce(nullif(v_args->>'reason',''),'Liberada por instrucción WhatsApp'),null,null,null);
      v_result:=jsonb_build_object('unitId',v_id,'unitCode',v_unit.unit_code,'status','available');

    when 'customer.create' then
      v_id:=public.erp_create_customer(
        v_args->>'fullName',v_args->>'documentType',v_args->>'documentNumber',v_args->>'phone',v_args->>'email',v_args->>'address',v_args->>'city',v_args->>'notes');
      v_result:=jsonb_build_object('customerId',v_id,'fullName',v_args->>'fullName');

    when 'expense.create' then
      v_id:=public.erp_create_operating_expense(
        v_args->>'category',v_args->>'description',(v_args->>'amountCop')::bigint,v_args->>'paymentMethod',
        v_args->>'payee',v_args->>'receiptUrl',coalesce((nullif(v_args->>'occurredOn',''))::date,(now() at time zone 'America/Bogota')::date));
      v_result:=jsonb_build_object('expenseId',v_id);

    when 'cash.open' then
      v_id:=public.erp_open_cash_session(coalesce((v_args->>'openingCashCop')::bigint,0),v_args->>'notes');
      select * into v_session from public.cash_sessions where id=v_id;
      v_result:=jsonb_build_object('sessionId',v_id,'sessionNumber',v_session.session_number,'status','open');

    when 'cash.close' then
      select * into v_session from public.cash_sessions where status='open' order by opened_at desc limit 1;
      if not found then raise exception 'cash_session_not_open'; end if;
      v_id:=public.erp_close_cash_session(v_session.id,(v_args->>'countedCashCop')::bigint,v_args->>'notes');
      select * into v_session from public.cash_sessions where id=v_id;
      v_result:=jsonb_build_object('sessionId',v_id,'sessionNumber',v_session.session_number,'status','closed',
        'expectedCashCop',v_session.expected_cash_cop,'countedCashCop',v_session.counted_cash_cop,'differenceCop',v_session.difference_cop);

    when 'cash.movement' then
      if nullif(btrim(coalesce(v_args->>'purchaseNumber','')),'') is not null then
        select id into v_purchase_id from public.purchases where upper(purchase_number)=upper(btrim(v_args->>'purchaseNumber')) limit 1;
        if v_purchase_id is null then raise exception 'purchase_not_found'; end if;
      end if;
      v_id:=public.erp_add_cash_movement(v_args->>'movementType',v_args->>'paymentMethod',(v_args->>'amountCop')::bigint,v_args->>'description',v_purchase_id);
      v_result:=jsonb_build_object('movementId',v_id);

    when 'sale.create_by_stu' then
      select u.* into v_unit from public.product_units u where upper(u.unit_code)=upper(btrim(coalesce(v_args->>'unitCode',''))) limit 1;
      if not found then raise exception 'unit_not_found'; end if;
      select * into v_product from public.products where id=v_unit.product_id;
      if not found then raise exception 'product_not_found'; end if;
      select id into v_customer_id from public.customers
        where document_number is not null and lower(btrim(document_number))=lower(btrim(coalesce(v_args->>'customerDocument',''))) limit 1;
      v_price:=coalesce((nullif(v_args->>'unitPriceCop',''))::bigint,round(v_product.price)::bigint);
      if v_price is null or v_price<0 then raise exception 'sale_price_required'; end if;
      v_items:=jsonb_build_array(jsonb_build_object(
        'itemType','catalog','productId',v_product.id,'productUnitId',v_unit.id,
        'description',coalesce(nullif(v_args->>'description',''),v_product.title),'unitPriceCop',v_price,'quantity',1));
      v_id:=public.erp_create_sale_with_units(
        v_customer_id,v_args->>'customerName',v_args->>'customerDocument',v_args->>'customerPhone',v_args->>'customerEmail',
        v_items,coalesce((nullif(v_args->>'discountCop',''))::bigint,0),coalesce(nullif(v_args->>'paymentMethod',''),'efectivo'),
        coalesce(nullif(v_args->>'paymentStatus',''),'pagado'),coalesce((nullif(v_args->>'warrantyMonths',''))::integer,6),v_args->>'notes',p_request_id);
      v_result:=jsonb_build_object('saleId',v_id,'saleNumber',(select sale_number from public.sales where id=v_id),'unitCode',v_unit.unit_code,'totalCop',(select total_cop from public.sales where id=v_id));

    else
      raise exception 'erp_agent_unknown_action:%',v_action;
  end case;

  return coalesce(v_result,'{}'::jsonb);
end;$$;
revoke all on function public.erp_agent_dispatch(uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;

-- Ingreso idempotente. Las lecturas se ejecutan aquí; las escrituras quedan pendientes.
create or replace function public.erp_agent_submit_request(
  p_wa_id_hash text,
  p_meta_message_id text,
  p_request_id uuid,
  p_action text,
  p_arguments jsonb,
  p_confirmation_hash text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_operator uuid; v_profile uuid; v_role text; v_name text;
  v_policy jsonb; v_permission text; v_risk text; v_action text:=lower(btrim(coalesce(p_action,'')));
  v_req public.whatsapp_erp_requests%rowtype; v_result jsonb; v_err text;
begin
  select operator_id,profile_id,erp_role,display_name into v_operator,v_profile,v_role,v_name
    from public.erp_agent_operator_context(p_wa_id_hash);
  if v_operator is null then raise exception 'erp_agent_operator_not_authorized' using errcode='42501'; end if;

  v_policy:=public.erp_agent_action_policy(v_action);
  if v_policy is null then raise exception 'erp_agent_unknown_action'; end if;
  v_permission:=v_policy->>'permission'; v_risk:=v_policy->>'risk';
  if not public.erp_role_has_permission(v_role,v_permission) then raise exception 'erp_agent_permission_denied:%',v_permission using errcode='42501'; end if;
  if p_request_id is null or nullif(btrim(coalesce(p_meta_message_id,'')),'') is null then raise exception 'erp_agent_request_identity_required'; end if;
  if jsonb_typeof(coalesce(p_arguments,'{}'::jsonb))<>'object' then raise exception 'erp_agent_arguments_must_be_object'; end if;
  if v_risk<>'read' and lower(btrim(coalesce(p_confirmation_hash,''))) !~ '^[0-9a-f]{64}$' then raise exception 'erp_agent_confirmation_hash_required'; end if;

  insert into public.whatsapp_erp_requests(request_id,operator_id,meta_message_id,action,permission,risk_level,arguments,status,confirmation_hash,confirmation_expires_at)
  values(p_request_id,v_operator,btrim(p_meta_message_id),v_action,v_permission,v_risk,coalesce(p_arguments,'{}'::jsonb),
    case when v_risk='read' then 'received' else 'pending_confirmation' end,
    case when v_risk='read' then null else lower(btrim(p_confirmation_hash)) end,
    case when v_risk='read' then null else now()+interval '10 minutes' end)
  on conflict(meta_message_id) do nothing;

  select * into v_req from public.whatsapp_erp_requests where meta_message_id=btrim(p_meta_message_id) for update;
  if not found then raise exception 'erp_agent_request_not_found'; end if;
  if v_req.operator_id<>v_operator then raise exception 'erp_agent_request_operator_mismatch' using errcode='42501'; end if;

  if v_req.status='executed' then
    return jsonb_build_object('status','executed','requestId',v_req.request_id,'riskLevel',v_req.risk_level,'result',coalesce(v_req.result_safe,'{}'::jsonb),'duplicate',true,'operator',v_name,'role',v_role);
  end if;
  if v_req.risk_level<>'read' then
    return jsonb_build_object('status',v_req.status,'requestId',v_req.request_id,'riskLevel',v_req.risk_level,'expiresAt',v_req.confirmation_expires_at,'duplicate',v_req.request_id<>p_request_id,'operator',v_name,'role',v_role);
  end if;

  begin
    update public.whatsapp_erp_requests set status='executing',error_code=null where request_id=v_req.request_id;
    v_result:=public.erp_agent_dispatch(v_profile,v_req.action,v_req.arguments,v_req.request_id);
    update public.whatsapp_erp_requests set status='executed',result_safe=v_result,executed_at=now(),error_code=null where request_id=v_req.request_id;
    return jsonb_build_object('status','executed','requestId',v_req.request_id,'riskLevel','read','result',v_result,'operator',v_name,'role',v_role);
  exception when others then
    v_err:=left(sqlstate||':'||sqlerrm,180);
    update public.whatsapp_erp_requests set status='failed',error_code=v_err where request_id=v_req.request_id;
    return jsonb_build_object('status','failed','requestId',v_req.request_id,'riskLevel','read','errorCode',v_err,'operator',v_name,'role',v_role);
  end;
end;$$;
revoke all on function public.erp_agent_submit_request(text,text,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.erp_agent_submit_request(text,text,uuid,text,jsonb,text) to service_role;

-- Confirmación + ejecución en UNA transacción. El row lock evita doble efecto.
create or replace function public.erp_agent_confirm_request(
  p_wa_id_hash text,
  p_request_id uuid,
  p_confirmation_hash text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_operator uuid; v_profile uuid; v_role text; v_name text;
  v_req public.whatsapp_erp_requests%rowtype; v_result jsonb; v_err text;
begin
  select operator_id,profile_id,erp_role,display_name into v_operator,v_profile,v_role,v_name
    from public.erp_agent_operator_context(p_wa_id_hash);
  if v_operator is null then raise exception 'erp_agent_operator_not_authorized' using errcode='42501'; end if;

  select * into v_req from public.whatsapp_erp_requests where request_id=p_request_id for update;
  if not found or v_req.operator_id<>v_operator then raise exception 'erp_agent_request_not_found' using errcode='42501'; end if;
  if v_req.status='executed' then
    return jsonb_build_object('status','executed','requestId',v_req.request_id,'riskLevel',v_req.risk_level,'result',coalesce(v_req.result_safe,'{}'::jsonb),'duplicate',true,'operator',v_name,'role',v_role);
  end if;
  if v_req.status<>'pending_confirmation' then raise exception 'erp_agent_request_not_pending:%',v_req.status; end if;
  if v_req.confirmation_expires_at is null or v_req.confirmation_expires_at<now() then
    update public.whatsapp_erp_requests set status='expired' where request_id=v_req.request_id;
    return jsonb_build_object('status','expired','requestId',v_req.request_id);
  end if;
  if v_req.confirmation_hash<>lower(btrim(coalesce(p_confirmation_hash,''))) then raise exception 'erp_agent_confirmation_invalid' using errcode='42501'; end if;
  if not public.erp_role_has_permission(v_role,v_req.permission) then raise exception 'erp_agent_permission_denied:%',v_req.permission using errcode='42501'; end if;

  begin
    update public.whatsapp_erp_requests set status='executing',confirmed_at=now(),error_code=null where request_id=v_req.request_id;
    v_result:=public.erp_agent_dispatch(v_profile,v_req.action,v_req.arguments,v_req.request_id);
    update public.whatsapp_erp_requests set status='executed',result_safe=v_result,executed_at=now(),error_code=null where request_id=v_req.request_id;
    insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,request_id,confirmation_id,after_snapshot,metadata)
    values('whatsapp_admin','waop:'||v_operator::text,'whatsapp','whatsapp.'||v_req.action,'erp_agent_request',v_req.request_id,
      v_req.request_id::text,v_req.request_id::text,jsonb_build_object('result',v_result),jsonb_build_object('role',v_role,'permission',v_req.permission,'riskLevel',v_req.risk_level));
    return jsonb_build_object('status','executed','requestId',v_req.request_id,'riskLevel',v_req.risk_level,'result',v_result,'operator',v_name,'role',v_role);
  exception when others then
    v_err:=left(sqlstate||':'||sqlerrm,180);
    update public.whatsapp_erp_requests set status='failed',error_code=v_err where request_id=v_req.request_id;
    return jsonb_build_object('status','failed','requestId',v_req.request_id,'riskLevel',v_req.risk_level,'errorCode',v_err,'operator',v_name,'role',v_role);
  end;
end;$$;
revoke all on function public.erp_agent_confirm_request(text,uuid,text) from public,anon,authenticated;
grant execute on function public.erp_agent_confirm_request(text,uuid,text) to service_role;

create or replace function public.erp_agent_cancel_request(p_wa_id_hash text,p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_operator uuid; v_status text;
begin
  select operator_id into v_operator from public.erp_agent_operator_context(p_wa_id_hash);
  if v_operator is null then raise exception 'erp_agent_operator_not_authorized' using errcode='42501'; end if;
  update public.whatsapp_erp_requests set status='cancelled'
  where request_id=p_request_id and operator_id=v_operator and status='pending_confirmation'
  returning status into v_status;
  if v_status is null then raise exception 'erp_agent_request_not_cancellable'; end if;
  return jsonb_build_object('status','cancelled','requestId',p_request_id);
end;$$;
revoke all on function public.erp_agent_cancel_request(text,uuid) from public,anon,authenticated;
grant execute on function public.erp_agent_cancel_request(text,uuid) to service_role;

-- Verificación esperada en STAGING:
-- 1) tablas con RLS y cero policies para authenticated/anon;
-- 2) service_role puede upsert operador + submit/confirm;
-- 3) número no autorizado => 42501;
-- 4) role sin permiso => 42501;
-- 5) mismo meta_message_id => mismo request/result, sin doble mutación;
-- 6) confirmación incorrecta/expirada no ejecuta;
-- 7) dos confirmaciones concurrentes ejecutan una sola vez;
-- 8) audit_events adicional actor_type='whatsapp_admin' tras cada mutación confirmada.
