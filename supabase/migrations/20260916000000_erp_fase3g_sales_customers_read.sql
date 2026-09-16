-- P20.20A · Administración natural de VENTAS, COMPROBANTES y CLIENTES desde
-- WhatsApp — SOLO LECTURA (§ el encargo: "En P20.20A casi todo será
-- lectura").
--
-- ── AUDITORÍA PREVIA (contra la definición VIVA, no solo migraciones) ────
-- Mismo mandato de P20.18/P20.19: se lee `pg_get_functiondef` justo antes de
-- parchear y se verifica la ocurrencia EXACTA del ancla — nunca se asume el
-- contenido de una migración histórica.
--
--   - `erp_agent_action_policy(text)` — enum cerrado de acciones; el permiso
--     `customers.manage` (NO existe `customers.read` en la matriz de roles —
--     ver `erp_role_has_permission()`, fase 2D — `customers.find` ya usa
--     `customers.manage` con `risk:'read'`, mismo patrón que se reutiliza
--     aquí para `customers.detail`/`customers.history`). `sales.read` sí
--     existe (`sales.today` ya lo usa) y se reutiliza tal cual para las 4
--     acciones nuevas de venta.
--   - `erp_agent_dispatch(uuid,text,jsonb,uuid)` — el bloque `case v_action`
--     que se extiende aquí. NINGUNA variable nueva en el DECLARE: los
--     filtros de fecha se castean inline (`(v_args->>'dateFrom')::date`) en
--     vez de declarar `v_date_from`/`v_date_to` — un DO block menos, mismo
--     resultado, menor riesgo de ancla.
--   - `sales`/`sale_items`/`customers`/`after_sales_cases` YA EXISTEN
--     (fases 1C/1F/2) — ninguna tabla ni columna nueva en esta migración.
--
-- ── DISEÑO: SQL NUNCA CONSTRUYE EL PDF ────────────────────────────────────
-- `sales.receipt` en este dispatcher SOLO resuelve la referencia humana
-- (saleNumber/unitCode/…) a un `saleId`/`saleNumber` reales — exactamente
-- igual que cualquier otra lectura. La construcción del binario PDF
-- (`buildSalePdfBytes`, ya probado) y su envío por WhatsApp viven en la capa
-- web/agente (`/api/internal/erp-agent/sales-receipt` + `ErpCliente` +
-- `MetaWhatsAppClient`), nunca en PL/pgSQL.
--
-- ── SNAPSHOTS HISTÓRICOS, NUNCA DATOS ACTUALES ────────────────────────────
-- `sales.detail`/`sales.receipt` leen `sale_items.product_name`,
-- `unit_code_snapshot`, `serial_number_snapshot`, `product_specs` — los
-- valores CONGELADOS al momento de la venta — nunca hacen JOIN a
-- `products`/`product_units` para "actualizar" esos campos (§14 del
-- encargo).
--
-- ── IDENTIDAD DE CLIENTE, NUNCA POR NOMBRE ────────────────────────────────
-- `customers.history` resuelve el cliente por, en este orden: `customerId`
-- exacto → `documentNumber` exacto (ambiguo si hay más de un cliente con
-- ese documento — no se asume) → `phone` exacto (mismo criterio). NO acepta
-- una búsqueda por nombre libre: para "historial de Rafael", el agente
-- primero resuelve el cliente con `customers.detail` (que si hay varios
-- Rafael, desambigua) y RECIÉN entonces llama `customers.history` con el
-- `customerId` ya cierto — nunca se asocian ventas a un cliente por
-- coincidencia de nombre.

do $patch_policy_sales_customers$
declare
  v_oid oid;
  v_def text;
  v_needle text :=
    $$    when 'inventory.unit_media.list'                      then jsonb_build_object('permission','inventory.read','risk','read')$$;
  v_replacement text :=
    $$    when 'inventory.unit_media.list'                      then jsonb_build_object('permission','inventory.read','risk','read')
    when 'sales.list'                                     then jsonb_build_object('permission','sales.read','risk','read')
    when 'sales.find'                                     then jsonb_build_object('permission','sales.read','risk','read')
    when 'sales.detail'                                   then jsonb_build_object('permission','sales.read','risk','read')
    when 'sales.receipt'                                  then jsonb_build_object('permission','sales.read','risk','read')
    when 'customers.detail'                               then jsonb_build_object('permission','customers.manage','risk','read')
    when 'customers.history'                              then jsonb_build_object('permission','customers.manage','risk','read')$$;
  v_ocurrencias integer;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_agent_action_policy'
  limit 1;

  if v_oid is null then
    raise exception 'P20_20A_action_policy_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias := (length(v_def) - length(replace(v_def, v_needle, ''))) / greatest(length(v_needle), 1);
  if v_ocurrencias = 0 then
    raise exception 'P20_20A_action_policy_patch_anchor_not_found';
  end if;
  if v_ocurrencias > 1 then
    raise exception 'P20_20A_action_policy_patch_anchor_not_unique:%', v_ocurrencias;
  end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_policy_sales_customers$;

do $patch_dispatch_sales_customers$
declare
  v_oid oid;
  v_def text;

  v_needle text :=
$needle$    else
      raise exception 'erp_agent_unknown_action:%',v_action;$needle$;

  v_replacement text :=
$replacement$    when 'sales.list' then
      v_limit:=least(greatest(coalesce(nullif(v_args->>'limit','')::integer,10),1),50);
      v_status:=nullif(lower(btrim(coalesce(v_args->>'paymentStatus',''))),'');
      if v_status is not null and v_status not in ('pagado','pendiente','parcial') then
        raise exception 'invalid_payment_status_filter:%',v_status;
      end if;
      select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) into v_result
      from (
        select s.sale_number as "saleNumber", s.created_at as "createdAt", s.customer_name as "customerName",
               s.total_cop as "totalCop", s.payment_method as "paymentMethod", s.payment_status as "paymentStatus",
               (select count(*) from public.sale_items si where si.sale_id=s.id) as "itemCount"
        from public.sales s
        where (nullif(v_args->>'dateFrom','') is null or (s.created_at at time zone 'America/Bogota')::date >= (v_args->>'dateFrom')::date)
          and (nullif(v_args->>'dateTo','') is null or (s.created_at at time zone 'America/Bogota')::date <= (v_args->>'dateTo')::date)
          and (v_status is null or s.payment_status = v_status)
        order by s.created_at desc
        limit v_limit
      ) x;

    when 'sales.find' then
      if nullif(btrim(coalesce(v_args->>'saleNumber','')),'') is not null then
        select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) into v_result
        from (
          select s.id as "saleId", s.sale_number as "saleNumber", s.created_at as "createdAt",
                 s.customer_name as "customerName", s.total_cop as "totalCop",
                 s.payment_method as "paymentMethod", s.payment_status as "paymentStatus"
          from public.sales s
          where upper(s.sale_number)=upper(btrim(v_args->>'saleNumber'))
          limit 5
        ) x;
      elsif nullif(btrim(coalesce(v_args->>'unitCode','')),'') is not null then
        select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) into v_result
        from (
          select distinct s.id as "saleId", s.sale_number as "saleNumber", s.created_at as "createdAt",
                 s.customer_name as "customerName", s.total_cop as "totalCop",
                 s.payment_method as "paymentMethod", s.payment_status as "paymentStatus"
          from public.sales s
          join public.sale_items si on si.sale_id=s.id
          where upper(coalesce(si.unit_code_snapshot,''))=upper(btrim(v_args->>'unitCode'))
          order by s.created_at desc
          limit 5
        ) x;
      elsif nullif(btrim(coalesce(v_args->>'serialNumber','')),'') is not null then
        select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) into v_result
        from (
          select distinct s.id as "saleId", s.sale_number as "saleNumber", s.created_at as "createdAt",
                 s.customer_name as "customerName", s.total_cop as "totalCop",
                 s.payment_method as "paymentMethod", s.payment_status as "paymentStatus"
          from public.sales s
          join public.sale_items si on si.sale_id=s.id
          where lower(coalesce(si.serial_number_snapshot,''))=lower(btrim(v_args->>'serialNumber'))
          order by s.created_at desc
          limit 5
        ) x;
      elsif nullif(btrim(coalesce(v_args->>'documentNumber','')),'') is not null then
        select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) into v_result
        from (
          select s.id as "saleId", s.sale_number as "saleNumber", s.created_at as "createdAt",
                 s.customer_name as "customerName", s.total_cop as "totalCop",
                 s.payment_method as "paymentMethod", s.payment_status as "paymentStatus"
          from public.sales s
          where lower(btrim(coalesce(s.customer_document,'')))=lower(btrim(v_args->>'documentNumber'))
          order by s.created_at desc
          limit 8
        ) x;
      elsif nullif(btrim(coalesce(v_args->>'phone','')),'') is not null then
        select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) into v_result
        from (
          select s.id as "saleId", s.sale_number as "saleNumber", s.created_at as "createdAt",
                 s.customer_name as "customerName", s.total_cop as "totalCop",
                 s.payment_method as "paymentMethod", s.payment_status as "paymentStatus"
          from public.sales s
          where lower(btrim(coalesce(s.customer_phone,'')))=lower(btrim(v_args->>'phone'))
          order by s.created_at desc
          limit 8
        ) x;
      elsif nullif(btrim(coalesce(v_args->>'customerQuery','')),'') is not null then
        v_q:=lower(btrim(v_args->>'customerQuery'));
        select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) into v_result
        from (
          select s.id as "saleId", s.sale_number as "saleNumber", s.created_at as "createdAt",
                 s.customer_name as "customerName", s.total_cop as "totalCop",
                 s.payment_method as "paymentMethod", s.payment_status as "paymentStatus"
          from public.sales s
          where lower(s.customer_name) like '%'||v_q||'%'
          order by s.created_at desc
          limit 8
        ) x;
      else
        raise exception 'sales_find_reference_required';
      end if;

    when 'sales.detail' then
      v_id:=null;
      if nullif(v_args->>'saleId','') is not null then
        v_id:=(v_args->>'saleId')::uuid;
      elsif nullif(btrim(coalesce(v_args->>'saleNumber','')),'') is not null then
        select id into v_id from public.sales where upper(sale_number)=upper(btrim(v_args->>'saleNumber')) limit 1;
      elsif nullif(btrim(coalesce(v_args->>'unitCode','')),'') is not null then
        select s.id into v_id from public.sales s join public.sale_items si on si.sale_id=s.id
          where upper(coalesce(si.unit_code_snapshot,''))=upper(btrim(v_args->>'unitCode'))
          order by s.created_at desc limit 1;
      else
        raise exception 'sales_detail_reference_required';
      end if;
      if v_id is null then raise exception 'sale_not_found'; end if;

      select jsonb_build_object(
        'saleId', s.id, 'saleNumber', s.sale_number, 'createdAt', s.created_at,
        'customerName', s.customer_name, 'customerDocument', s.customer_document,
        'customerPhone', s.customer_phone, 'customerEmail', s.customer_email,
        'subtotalCop', s.subtotal_cop, 'discountCop', s.discount_cop, 'totalCop', s.total_cop,
        'paymentMethod', s.payment_method, 'paymentStatus', s.payment_status,
        'warrantyMonths', s.warranty_months, 'notes', s.notes, 'dianStatus', s.dian_status,
        'items', (
          select coalesce(jsonb_agg(to_jsonb(it) order by it."sortOrder"),'[]'::jsonb)
          from (
            select si.product_name as "productName", si.unit_code_snapshot as "unitCode",
                   si.serial_number_snapshot as "serialNumber", si.unit_price_cop as "unitPriceCop",
                   si.quantity, si.subtotal_cop as "subtotalCop", si.product_specs as "productSpecs",
                   si.sort_order as "sortOrder"
            from public.sale_items si where si.sale_id=s.id
          ) it
        )
      ) into v_result
      from public.sales s where s.id=v_id;

    when 'sales.receipt' then
      v_id:=null;
      if nullif(v_args->>'saleId','') is not null then
        v_id:=(v_args->>'saleId')::uuid;
      elsif nullif(btrim(coalesce(v_args->>'saleNumber','')),'') is not null then
        select id into v_id from public.sales where upper(sale_number)=upper(btrim(v_args->>'saleNumber')) limit 1;
      elsif nullif(btrim(coalesce(v_args->>'unitCode','')),'') is not null then
        select s.id into v_id from public.sales s join public.sale_items si on si.sale_id=s.id
          where upper(coalesce(si.unit_code_snapshot,''))=upper(btrim(v_args->>'unitCode'))
          order by s.created_at desc limit 1;
      else
        raise exception 'sales_receipt_reference_required';
      end if;
      if v_id is null then raise exception 'sale_not_found'; end if;
      select jsonb_build_object('saleId', s.id, 'saleNumber', s.sale_number) into v_result
      from public.sales s where s.id=v_id;

    when 'customers.detail' then
      if nullif(v_args->>'customerId','') is not null then
        select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb)) into v_result
        from (
          select id, full_name as "fullName", document_type as "documentType", document_number as "documentNumber",
                 phone, email, address, city, notes, active, created_at as "createdAt"
          from public.customers where id=(v_args->>'customerId')::uuid
        ) c;
      elsif nullif(btrim(coalesce(v_args->>'documentNumber','')),'') is not null then
        select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb)) into v_result
        from (
          select id, full_name as "fullName", document_type as "documentType", document_number as "documentNumber",
                 phone, email, address, city, notes, active, created_at as "createdAt"
          from public.customers
          where lower(btrim(coalesce(document_number,'')))=lower(btrim(v_args->>'documentNumber'))
          limit 5
        ) c;
      elsif nullif(btrim(coalesce(v_args->>'phone','')),'') is not null then
        select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb)) into v_result
        from (
          select id, full_name as "fullName", document_type as "documentType", document_number as "documentNumber",
                 phone, email, address, city, notes, active, created_at as "createdAt"
          from public.customers
          where lower(btrim(coalesce(phone,'')))=lower(btrim(v_args->>'phone'))
          limit 5
        ) c;
      elsif nullif(btrim(coalesce(v_args->>'query','')),'') is not null then
        v_q:=lower(btrim(v_args->>'query'));
        select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb)) into v_result
        from (
          select id, full_name as "fullName", document_type as "documentType", document_number as "documentNumber",
                 phone, email, address, city, notes, active, created_at as "createdAt"
          from public.customers
          where lower(full_name) like '%'||v_q||'%'
             or lower(coalesce(document_number,'')) like '%'||v_q||'%'
             or lower(coalesce(phone,'')) like '%'||v_q||'%'
          order by updated_at desc
          limit 10
        ) c;
      else
        raise exception 'customers_detail_reference_required';
      end if;

    when 'customers.history' then
      v_customer_id:=null;
      if nullif(v_args->>'customerId','') is not null then
        v_customer_id:=(v_args->>'customerId')::uuid;
      elsif nullif(btrim(coalesce(v_args->>'documentNumber','')),'') is not null then
        if (select count(*) from public.customers
              where lower(btrim(coalesce(document_number,'')))=lower(btrim(v_args->>'documentNumber'))) > 1 then
          raise exception 'customer_document_ambiguous';
        end if;
        select id into v_customer_id from public.customers
          where lower(btrim(coalesce(document_number,'')))=lower(btrim(v_args->>'documentNumber')) limit 1;
      elsif nullif(btrim(coalesce(v_args->>'phone','')),'') is not null then
        if (select count(*) from public.customers
              where lower(btrim(coalesce(phone,'')))=lower(btrim(v_args->>'phone'))) > 1 then
          raise exception 'customer_phone_ambiguous';
        end if;
        select id into v_customer_id from public.customers
          where lower(btrim(coalesce(phone,'')))=lower(btrim(v_args->>'phone')) limit 1;
      else
        raise exception 'customers_history_reference_required';
      end if;
      if v_customer_id is null then raise exception 'customer_not_found'; end if;

      select jsonb_build_object(
        'customerId', c.id, 'customerName', c.full_name,
        'sales', (
          select coalesce(jsonb_agg(to_jsonb(sv) order by sv."createdAt" desc),'[]'::jsonb)
          from (
            select s.sale_number as "saleNumber", s.created_at as "createdAt", s.total_cop as "totalCop",
                   s.payment_status as "paymentStatus"
            from public.sales s
            where s.customer_id=c.id
               or (
                 s.customer_id is null
                 and c.document_number is not null
                 and lower(btrim(coalesce(s.customer_document,'')))=lower(btrim(c.document_number))
               )
            order by s.created_at desc
            limit 20
          ) sv
        ),
        'afterSalesCases', (
          select coalesce(jsonb_agg(to_jsonb(ac) order by ac."openedAt" desc),'[]'::jsonb)
          from (
            select case_number as "caseNumber", case_type as "caseType", status,
                   product_name_snapshot as "productName", unit_code_snapshot as "unitCode",
                   reported_issue as "reportedIssue", opened_at as "openedAt"
            from public.after_sales_cases where customer_id=c.id
            order by opened_at desc
            limit 20
          ) ac
        )
      ) into v_result
      from public.customers c where c.id=v_customer_id;
      if v_result is null then raise exception 'customer_not_found'; end if;

    else
      raise exception 'erp_agent_unknown_action:%',v_action;$replacement$;
  v_ocurrencias integer;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_agent_dispatch'
    and oidvectortypes(p.proargtypes) = 'uuid, text, jsonb, uuid'
  limit 1;

  if v_oid is null then
    raise exception 'P20_20A_dispatch_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias := (length(v_def) - length(replace(v_def, v_needle, ''))) / greatest(length(v_needle), 1);
  if v_ocurrencias = 0 then
    raise exception 'P20_20A_dispatch_patch_anchor_not_found';
  end if;
  if v_ocurrencias > 1 then
    raise exception 'P20_20A_dispatch_patch_anchor_not_unique:%', v_ocurrencias;
  end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_dispatch_sales_customers$;

do $verify$
declare
  v_pols jsonb;
  v_dispatch_def text;
begin
  select jsonb_object_agg(a, public.erp_agent_action_policy(a))
    into v_pols
  from unnest(array[
    'sales.list','sales.find','sales.detail','sales.receipt',
    'customers.detail','customers.history'
  ]) as a;

  if (v_pols->'sales.list'->>'permission') <> 'sales.read' or (v_pols->'sales.list'->>'risk') <> 'read' then
    raise exception 'P20_20A_policy_sales_list_failed:%', v_pols->'sales.list';
  end if;
  if (v_pols->'sales.receipt'->>'permission') <> 'sales.read' then
    raise exception 'P20_20A_policy_sales_receipt_failed:%', v_pols->'sales.receipt';
  end if;
  if (v_pols->'customers.detail'->>'permission') <> 'customers.manage' or (v_pols->'customers.detail'->>'risk') <> 'read' then
    raise exception 'P20_20A_policy_customers_detail_failed:%', v_pols->'customers.detail';
  end if;
  if (v_pols->'customers.history'->>'permission') <> 'customers.manage' then
    raise exception 'P20_20A_policy_customers_history_failed:%', v_pols->'customers.history';
  end if;

  select pg_get_functiondef(p.oid)
    into v_dispatch_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_agent_dispatch'
    and oidvectortypes(p.proargtypes) = 'uuid, text, jsonb, uuid'
  limit 1;

  if v_dispatch_def not ilike '%sales.list%'
     or v_dispatch_def not ilike '%sales.find%'
     or v_dispatch_def not ilike '%sales.detail%'
     or v_dispatch_def not ilike '%sales.receipt%'
     or v_dispatch_def not ilike '%customers.detail%'
     or v_dispatch_def not ilike '%customers.history%'
     or v_dispatch_def not ilike '%sale_not_found%'
     or v_dispatch_def not ilike '%customer_not_found%' then
    raise exception 'P20_20A_dispatch_verification_failed';
  end if;
end;
$verify$;
