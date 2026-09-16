-- P20.20A.1 · Cliente automático en ventas + backfill histórico + customers.list
--
-- ── DIAGNÓSTICO CONFIRMADO EN STAGING (antes de escribir esto) ────────────
-- `erp_internal_create_sale_with_units(...)` (fase 1C, SECURITY INVOKER,
-- llamada tanto por el panel web como por `sale.create_by_stu` de WhatsApp
-- — AMBOS pasan por el MISMO wrapper `erp_create_sale_with_units`, que
-- eleva privilegios con `erp_legacy_elevate()` antes de invocar la interna)
-- tiene esta rama:
--
--   if p_customer_id is not null then
--     -- valida que exista y ACTIVO, hereda su nombre/documento/teléfono/
--     -- email REALES (nunca los sobreescribe con el texto de la venta) ✓
--   end if;
--   ... valida que v_customer_name/document/phone NO sean null ...
--   insert into sales (customer_id, ...) values (p_customer_id, ...)  -- ← BUG
--
-- Cuando `p_customer_id` llega NULL (el caso normal: ni el panel ni
-- `sale.create_by_stu` resuelven un customer existente si el documento no
-- estaba ya registrado) la venta se crea con `customer_id = NULL` y el
-- nombre/documento/teléfono quedan SOLO como texto en `sales` — nunca se
-- crea el `customer`. Confirmado en STAGING: 5 ventas, 5 con
-- `customer_id IS NULL`, 1 solo customer real (no relacionado con ninguna
-- de esas 5). Auditoría de los 5 documentos: sin repetidos, sin datos
-- incompletos, sin colisión con el customer existente — CERO conflictos
-- reales que resolver a mano.
--
-- ── PUNTO ÚNICO DE IMPLEMENTACIÓN ─────────────────────────────────────────
-- La reparación se hace DENTRO de `erp_internal_create_sale_with_units` —
-- el ÚNICO lugar por el que pasan HOY el panel web, `sale.create_by_stu`
-- (WhatsApp) y cualquier futuro consumidor de `erp_create_sale_with_units`.
-- Cero lógica duplicada en TypeScript ni en el dispatcher de WhatsApp: el
-- caso `sale.create_by_stu` de `erp_agent_dispatch` (fase 3A) sigue
-- exactamente igual — su SELECT optimista de `customer_id` sigue siendo
-- válido (si encuentra uno, lo pasa; si no, pasa NULL) y la resolución
-- real/creación ahora ocurre de forma segura DENTRO de la función interna,
-- transparente para el dispatcher.
--
-- Nueva función `erp_internal_resolve_or_create_customer_by_document(...)`
-- — REUTILIZA `erp_internal_create_customer(...)` (fase 1B) tal cual para
-- el INSERT + su propio `audit_events` — no se duplica esa lógica.
--
-- ── CONCURRENCIA ──────────────────────────────────────────────────────────
-- El índice único YA EXISTE (`uq_customers_document_normalized`, sobre
-- `lower(btrim(document_number))`, parcial `WHERE document_number IS NOT
-- NULL`) — no se crea ninguno nuevo. Patrón estándar de Postgres para
-- "get-or-create" seguro ante condición de carrera: SELECT primero: si
-- existe, listo. Si no, INSERT (vía `erp_internal_create_customer`) dentro
-- de un bloque `begin...exception when unique_violation` — Postgres crea un
-- SAVEPOINT implícito al entrar a ese bloque; si dos transacciones
-- concurrentes intentan crear el MISMO documento, una gana el INSERT y la
-- otra recibe `unique_violation`, se revierte SOLO ese sub-bloque (nunca dos
-- customers duplicados, nunca la transacción completa aborta por esto) y
-- relee — la ganadora ya committeó (o está a punto) por el índice único.
--
-- ── AUTORIDAD DE DATOS (hardening pre-dry-run) ─────────────────────────────
-- Si el documento YA existe como customer ACTIVO, se reutiliza su id TAL
-- CUAL — nunca se llama `erp_internal_create_customer` en ese caso, así que
-- NINGÚN campo del customer existente se toca. Si el documento coincide con
-- un customer INACTIVO (bloquea el índice único), la re-lectura con
-- `active = true` no lo encuentra y la función falla explícitamente
-- (`customer_autoregistration_conflict`) — nunca reactiva silenciosamente
-- una identidad distinta que alguien desactivó a propósito.
--
-- Corrección importante: el `customer` MAESTRO es la autoridad para el
-- SNAPSHOT de la venta (`sales.customer_name/document/phone/email`) sea el
-- id EXPLÍCITO, RESUELTO por documento, o RECIÉN CREADO — no solo en el
-- caso explícito, como quedó en la primera versión de este parche. Tras
-- resolver `v_final_customer_id` por cualquiera de los tres caminos, se
-- relee el customer ACTIVO y sus datos reemplazan el texto de la venta
-- ANTES de validar los campos obligatorios — si el maestro tiene, p. ej.,
-- el teléfono vacío, la venta FALLA ahí (`customer_phone_required`), nunca
-- se completa informalmente con el texto de la venta.
--
-- ── BACKFILL ──────────────────────────────────────────────────────────────
-- Genérico, basado en datos — CERO UUIDs ni nombres de STAGING
-- hardcodeados. Documentos con datos INCOMPATIBLES entre ventas del MISMO
-- documento (nombre normalizado distinto, teléfono con dígitos distintos, o
-- más de un EMAIL real y distinto — NULL/vacío nunca cuenta como email
-- "distinto") se EXCLUYEN explícitamente (nunca se elige uno
-- arbitrariamente) y se reportan por `RAISE NOTICE`. Para cada documento
-- SIN conflicto se llama la MISMA función de resolución UNA vez (con el
-- snapshot de la venta más antigua como fuente si hay que crear) y se
-- enlazan TODAS las ventas de ese documento a la vez — los snapshots de
-- `sales` NUNCA se tocan, solo `customer_id`.
--
-- ── AFTER_SALES_CASES: NUNCA SE TOCA (hardening post-dry-run real) ────────
-- El dry-run real reveló que actualizar `after_sales_cases.customer_id`
-- viola `erp_guard_after_sales_case_identity()` (fase 1F): ese trigger
-- protege `customer_id` como parte de la identidad INMUTABLE del
-- expediente — a propósito, un caso de garantía nunca debe cambiar de
-- dueño después de abierto. Por eso este backfill NO escribe nada en
-- `after_sales_cases` — ni el trigger ni el guard se tocan, cero bypass.
-- En su lugar, `customers.history` (parche 3b, más abajo) aprende a
-- reconocer un caso legacy (`customer_id IS NULL`) por la relación
-- INMUTABLE que SÍ tiene: `sale_id` (NOT NULL) → `sales.id` →
-- `sales.customer_id` (ya enlazado arriba). Se prefiere `sale_id` sobre
-- comparar `customer_document_snapshot` como texto porque es NOT NULL, es
-- parte de la identidad inmutable, y tras este backfill `sales.customer_id`
-- ya está resuelto — sin comparar texto histórico ni arriesgar un falso
-- positivo por coincidencia de nombre/documento.
--
-- ── ACL DE LA FUNCIÓN NUEVA ─────────────────────────────────────────────
-- Auditado en STAGING (proacl real, solo lectura): `erp_internal_create_
-- customer`/`erp_internal_create_sale_with_units` NO son ejecutables por
-- PUBLIC/anon/authenticated — solo `postgres`/`service_role`. La función
-- nueva replica ese MISMO ACL con REVOKE/GRANT explícitos (ver más abajo)
-- — sin el REVOKE, el default de Postgres la dejaría ejecutable por
-- PUBLIC, saltándose `erp_assert_permission()` de los wrappers públicos.
--
-- ── TABLA TEMPORAL DEL BACKFILL ────────────────────────────────────────
-- `tmp_p20_20a1_conflictos` ya NO usa `on commit drop`: se limpia con un
-- `DROP TABLE` explícito al final del archivo (después de que `$verify$`
-- la use) — no depende implícitamente de que el runner haga COMMIT para
-- que desaparezca. Ningún COMMIT se agrega en este archivo.
--
-- Transaccional: toda la migración corre en UNA transacción (estándar de
-- Supabase); si algo falla, se revierte entera.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Resolución/creación de customer por documento — concurrency-safe
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.erp_internal_resolve_or_create_customer_by_document(
  p_full_name text,
  p_document_number text,
  p_phone text,
  p_email text,
  p_document_type text default null
) returns uuid
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_name text := nullif(btrim(coalesce(p_full_name, '')), '');
  v_document text := nullif(btrim(coalesce(p_document_number, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_customer_id uuid;
begin
  if v_document is null then
    raise exception 'customer_document_required_for_autoregistration';
  end if;
  if v_name is null or length(v_name) < 2 then
    raise exception 'customer_name_required_for_autoregistration';
  end if;

  -- 1. ¿Ya existe un customer ACTIVO con ese documento? Normalizado
  --    EXACTAMENTE igual que el índice único real (lower+btrim) — nunca
  --    duplicados por mayúsculas/espacios.
  select id into v_customer_id
  from public.customers
  where lower(btrim(document_number)) = lower(v_document)
    and active = true;

  if v_customer_id is not null then
    return v_customer_id;
  end if;

  -- 2. No existe: crear uno nuevo. `erp_internal_create_customer` hace el
  --    INSERT real (mismas columnas, mismo audit_events de esa función) —
  --    nunca se duplica esa lógica aquí. El bloque begin/exception es un
  --    SAVEPOINT implícito: si otra transacción concurrente ya insertó
  --    este MISMO documento normalizado (índice único real), Postgres
  --    lanza `unique_violation`, se revierte SOLO este sub-bloque (no la
  --    venta completa) y se relee abajo.
  begin
    v_customer_id := public.erp_internal_create_customer(
      v_name, p_document_type, v_document, v_phone, v_email, null, null,
      'Autoregistrado desde una venta'
    );
  exception when unique_violation then
    v_customer_id := null;
  end;

  if v_customer_id is null then
    select id into v_customer_id
    from public.customers
    where lower(btrim(document_number)) = lower(v_document)
      and active = true;

    -- Ningún customer ACTIVO con este documento tras el conflicto: o bien
    -- ganó otra transacción pero el registro sigue sin ser visible (no
    -- debería pasar dentro de la misma transacción serializada por el
    -- índice), o el documento choca con un customer INACTIVO — una
    -- contradicción de identidad real. Nunca se reactiva ni se inventa: se
    -- falla explícito, tal como pide el encargo.
    if v_customer_id is null then
      raise exception 'customer_autoregistration_conflict:%', v_document;
    end if;
    return v_customer_id;
  end if;

  -- Trazabilidad: además del `customer.create` que ya escribe
  -- `erp_internal_create_customer`, se deja constancia de que este
  -- customer nació de una autorregistración por venta (no del panel).
  insert into public.audit_events (
    actor_type, actor_ref, channel, operation, entity_type, entity_id, after_snapshot, metadata
  ) values (
    'system', null, 'system', 'customer.autoregistered_from_sale', 'customer', v_customer_id,
    jsonb_build_object('customerId', v_customer_id, 'documentNumber', v_document),
    jsonb_build_object('source', 'sale_autoregistration')
  );

  return v_customer_id;
end;
$function$;

-- ACL — CADA función nueva nace con EXECUTE a PUBLIC por defecto de
-- Postgres. Auditado en STAGING (proacl real, solo lectura, antes de
-- escribir esto):
--
--   erp_internal_create_customer          {postgres=X/postgres,service_role=X/postgres}
--   erp_internal_create_sale_with_units   {postgres=X/postgres,service_role=X/postgres}
--
-- Ninguna de las dos internas es ejecutable por PUBLIC/anon/authenticated
-- — SOLO por `postgres` (dueño) y `service_role` (el rol con el que
-- corren `erp_legacy_elevate`/las llamadas server-side). Los wrappers
-- públicos (`erp_create_customer`, `erp_create_sale_with_units`, ambos
-- SECURITY DEFINER) sí están abiertos a anon/authenticated — la
-- autorización real la hace `erp_assert_permission()` DENTRO del wrapper,
-- no el ACL de Postgres. Esta función nueva es una INTERNA más (nunca se
-- llama directo desde HTTP/RPC pública, solo desde
-- `erp_internal_create_sale_with_units`/el backfill de esta misma
-- migración) — replica el MISMO ACL exacto, sin ampliar privilegios.
-- Supabase tiene default privileges que conceden EXECUTE directamente a
-- anon/authenticated/service_role sobre funciones nuevas. Revocar PUBLIC
-- solamente NO elimina esos grants directos. Esta función interna debe
-- replicar exactamente el ACL de las demás erp_internal_*:
-- postgres + service_role únicamente.
revoke all on function public.erp_internal_resolve_or_create_customer_by_document(text, text, text, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.erp_internal_resolve_or_create_customer_by_document(text, text, text, text, text)
  to postgres, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Parchear erp_internal_create_sale_with_units — 4 anclas verificadas
--    por ocurrencia EXACTA contra la definición VIVA (mismo patrón de
--    P20.18/19/20A), leída justo antes de parchear.
-- ═══════════════════════════════════════════════════════════════════════

-- 2a. DECLARE — nueva variable para el customer_id EFECTIVO de la venta
--     (el explícito si vino, o el resuelto/creado si no).
do $patch_declare$
declare
  v_oid oid;
  v_def text;
  v_needle text := $$  v_from_status text;
  v_reservation_meta jsonb;
begin$$;
  v_replacement text := $$  v_from_status text;
  v_reservation_meta jsonb;
  v_final_customer_id uuid := p_customer_id;
begin$$;
  v_ocurrencias integer;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'erp_internal_create_sale_with_units'
    and oidvectortypes(p.proargtypes) = 'uuid, text, text, text, text, jsonb, bigint, text, text, integer, text, uuid'
  limit 1;

  if v_oid is null then raise exception 'P20_20A1_create_sale_not_found'; end if;
  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias := (length(v_def) - length(replace(v_def, v_needle, ''))) / greatest(length(v_needle), 1);
  if v_ocurrencias = 0 then raise exception 'P20_20A1_declare_anchor_not_found'; end if;
  if v_ocurrencias > 1 then raise exception 'P20_20A1_declare_anchor_not_unique:%', v_ocurrencias; end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_declare$;

-- 2b. RESOLUCIÓN + AUTORIDAD DEL CUSTOMER MAESTRO — reemplaza el bloque
--     original "if p_customer_id is not null...then hereda snapshot" +
--     las 3 validaciones de campo obligatorio, por una versión que aplica
--     la MISMA autoridad ("el customer maestro manda") sea el id
--     explícito, resuelto por documento, o recién creado:
--
--       1. resolver v_final_customer_id (explícito, o por documento si no
--          vino ninguno — con el snapshot CRUDO de la venta, única fuente
--          posible si hay que crear uno nuevo);
--       2. releer el customer ACTIVO real por v_final_customer_id;
--       3. el customer maestro reemplaza name/document/phone/email —
--          SIEMPRE, no solo cuando el id venía explícito (antes del
--          hardening, un id RESUELTO por documento dejaba el snapshot de
--          la venta con el texto crudo de la venta, no con los datos
--          reales del customer reutilizado);
--       4. RECIÉN AHORA se valida que name/document/phone finales no sean
--          null — si el customer maestro tiene, por ejemplo, el teléfono
--          vacío, la venta FALLA aquí (`customer_phone_required`) en vez
--          de completarlo informalmente con el texto de la venta.
do $patch_resolucion$
declare
  v_oid oid;
  v_def text;
  v_needle text := $$  if p_customer_id is not null then
    select * into v_customer
    from public.customers
    where id = p_customer_id and active = true;

    if not found then
      raise exception 'customer_not_found';
    end if;

    v_customer_name := v_customer.full_name;
    v_customer_document := v_customer.document_number;
    v_customer_phone := v_customer.phone;
    v_customer_email := v_customer.email;
  end if;

  if v_customer_name is null or length(v_customer_name) < 2 then
    raise exception 'customer_name_required';
  end if;
  if v_customer_document is null then
    raise exception 'customer_document_required';
  end if;
  if v_customer_phone is null then
    raise exception 'customer_phone_required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then$$;
  v_replacement text := $$  if p_customer_id is not null then
    v_final_customer_id := p_customer_id;
  elsif v_customer_document is not null then
    -- P20.20A.1 — sin id explícito: resolver/crear por documento, usando
    -- el snapshot CRUDO de la venta (única fuente disponible si hay que
    -- crear un customer nuevo). Concurrency-safe: índice único real +
    -- unique_violation + relectura (ver la función).
    v_final_customer_id := public.erp_internal_resolve_or_create_customer_by_document(
      v_customer_name, v_customer_document, v_customer_phone, v_customer_email
    );
  end if;

  -- P20.20A.1 — el customer MAESTRO siempre es la autoridad: sea
  -- explícito, resuelto por documento, o recién creado, se relee ACTIVO y
  -- sus datos reemplazan el snapshot de la venta ANTES de validar campos
  -- obligatorios. Si el maestro tiene un campo requerido vacío, la venta
  -- debe fallar aquí — nunca se completa informalmente desde el texto de
  -- la venta, y el customer existente NUNCA se sobreescribe.
  if v_final_customer_id is not null then
    select * into v_customer
    from public.customers
    where id = v_final_customer_id and active = true;

    if not found then
      raise exception 'customer_not_found';
    end if;

    v_customer_name := v_customer.full_name;
    v_customer_document := v_customer.document_number;
    v_customer_phone := v_customer.phone;
    v_customer_email := v_customer.email;
  end if;

  if v_customer_name is null or length(v_customer_name) < 2 then
    raise exception 'customer_name_required';
  end if;
  if v_customer_document is null then
    raise exception 'customer_document_required';
  end if;
  if v_customer_phone is null then
    raise exception 'customer_phone_required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then$$;
  v_ocurrencias integer;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'erp_internal_create_sale_with_units'
    and oidvectortypes(p.proargtypes) = 'uuid, text, text, text, text, jsonb, bigint, text, text, integer, text, uuid'
  limit 1;

  if v_oid is null then raise exception 'P20_20A1_create_sale_not_found'; end if;
  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias := (length(v_def) - length(replace(v_def, v_needle, ''))) / greatest(length(v_needle), 1);
  if v_ocurrencias = 0 then raise exception 'P20_20A1_resolucion_anchor_not_found'; end if;
  if v_ocurrencias > 1 then raise exception 'P20_20A1_resolucion_anchor_not_unique:%', v_ocurrencias; end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_resolucion$;

-- 2c. INSERT INTO sales — usa el customer_id EFECTIVO, no el crudo.
do $patch_insert_sales$
declare
  v_oid oid;
  v_def text;
  v_needle text := $$  insert into public.sales (
    customer_id, customer_name, customer_document, customer_phone, customer_email,
    subtotal_cop, discount_cop, total_cop, payment_method, payment_status,
    warranty_months, notes, idempotency_key, created_by
  ) values (
    p_customer_id, v_customer_name, v_customer_document, v_customer_phone, v_customer_email,
    v_subtotal, p_discount_cop, v_subtotal - p_discount_cop, p_payment_method, p_payment_status,
    p_warranty_months, nullif(btrim(coalesce(p_notes, '')), ''), p_idempotency_key, v_actor
  ) returning id into v_sale_id;$$;
  v_replacement text := $$  insert into public.sales (
    customer_id, customer_name, customer_document, customer_phone, customer_email,
    subtotal_cop, discount_cop, total_cop, payment_method, payment_status,
    warranty_months, notes, idempotency_key, created_by
  ) values (
    v_final_customer_id, v_customer_name, v_customer_document, v_customer_phone, v_customer_email,
    v_subtotal, p_discount_cop, v_subtotal - p_discount_cop, p_payment_method, p_payment_status,
    p_warranty_months, nullif(btrim(coalesce(p_notes, '')), ''), p_idempotency_key, v_actor
  ) returning id into v_sale_id;$$;
  v_ocurrencias integer;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'erp_internal_create_sale_with_units'
    and oidvectortypes(p.proargtypes) = 'uuid, text, text, text, text, jsonb, bigint, text, text, integer, text, uuid'
  limit 1;

  if v_oid is null then raise exception 'P20_20A1_create_sale_not_found'; end if;
  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias := (length(v_def) - length(replace(v_def, v_needle, ''))) / greatest(length(v_needle), 1);
  if v_ocurrencias = 0 then raise exception 'P20_20A1_insert_anchor_not_found'; end if;
  if v_ocurrencias > 1 then raise exception 'P20_20A1_insert_anchor_not_unique:%', v_ocurrencias; end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_insert_sales$;

-- 2d. audit_events de la venta — mismo customer_id EFECTIVO, para que la
--     auditoría refleje el enlace real, no NULL.
do $patch_audit$
declare
  v_oid oid;
  v_def text;
  v_needle text := $$    'saleId', v_sale_id, 'customerId', p_customer_id,
      'subtotalCop', v_subtotal, 'discountCop', p_discount_cop,$$;
  v_replacement text := $$    'saleId', v_sale_id, 'customerId', v_final_customer_id,
      'subtotalCop', v_subtotal, 'discountCop', p_discount_cop,$$;
  v_ocurrencias integer;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'erp_internal_create_sale_with_units'
    and oidvectortypes(p.proargtypes) = 'uuid, text, text, text, text, jsonb, bigint, text, text, integer, text, uuid'
  limit 1;

  if v_oid is null then raise exception 'P20_20A1_create_sale_not_found'; end if;
  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias := (length(v_def) - length(replace(v_def, v_needle, ''))) / greatest(length(v_needle), 1);
  if v_ocurrencias = 0 then raise exception 'P20_20A1_audit_anchor_not_found'; end if;
  if v_ocurrencias > 1 then raise exception 'P20_20A1_audit_anchor_not_unique:%', v_ocurrencias; end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_audit$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. customers.list — lectura nueva (mismo patrón additivo de siempre)
-- ═══════════════════════════════════════════════════════════════════════
do $patch_policy_customers_list$
declare
  v_oid oid;
  v_def text;
  v_needle text :=
    $$    when 'customers.history'                              then jsonb_build_object('permission','customers.manage','risk','read')$$;
  v_replacement text :=
    $$    when 'customers.history'                              then jsonb_build_object('permission','customers.manage','risk','read')
    when 'customers.list'                                 then jsonb_build_object('permission','customers.manage','risk','read')$$;
  v_ocurrencias integer;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'erp_agent_action_policy'
  limit 1;

  if v_oid is null then raise exception 'P20_20A1_action_policy_not_found'; end if;
  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias := (length(v_def) - length(replace(v_def, v_needle, ''))) / greatest(length(v_needle), 1);
  if v_ocurrencias = 0 then raise exception 'P20_20A1_policy_anchor_not_found'; end if;
  if v_ocurrencias > 1 then raise exception 'P20_20A1_policy_anchor_not_unique:%', v_ocurrencias; end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_policy_customers_list$;

do $patch_dispatch_customers_list$
declare
  v_oid oid;
  v_def text;
  v_needle text :=
$needle$    else
      raise exception 'erp_agent_unknown_action:%',v_action;$needle$;
  v_replacement text :=
$replacement$    when 'customers.list' then
      v_limit:=least(greatest(coalesce(nullif(v_args->>'limit','')::integer,10),1),50);
      v_q:=nullif(lower(btrim(coalesce(v_args->>'query',''))),'');
      select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) into v_result
      from (
        select id, full_name as "fullName", document_number as "documentNumber",
               phone, email, city, active, created_at as "createdAt"
        from public.customers
        where (case when v_args ? 'active' then active = (v_args->>'active')::boolean else true end)
          and (
            v_q is null
            or lower(full_name) like '%'||v_q||'%'
            or lower(coalesce(document_number,'')) like '%'||v_q||'%'
            or lower(coalesce(phone,'')) like '%'||v_q||'%'
            or lower(coalesce(email,'')) like '%'||v_q||'%'
          )
        order by created_at desc
        limit v_limit
      ) x;

    else
      raise exception 'erp_agent_unknown_action:%',v_action;$replacement$;
  v_ocurrencias integer;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'erp_agent_dispatch'
    and oidvectortypes(p.proargtypes) = 'uuid, text, jsonb, uuid'
  limit 1;

  if v_oid is null then raise exception 'P20_20A1_dispatch_not_found'; end if;
  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias := (length(v_def) - length(replace(v_def, v_needle, ''))) / greatest(length(v_needle), 1);
  if v_ocurrencias = 0 then raise exception 'P20_20A1_dispatch_anchor_not_found'; end if;
  if v_ocurrencias > 1 then raise exception 'P20_20A1_dispatch_anchor_not_unique:%', v_ocurrencias; end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_dispatch_customers_list$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3b. customers.history — soporte de posventa LEGACY sin violar la
--     inmutabilidad de after_sales_cases (hardening post-dry-run real).
-- ═══════════════════════════════════════════════════════════════════════
-- El dry-run real reveló que `UPDATE after_sales_cases SET customer_id=...`
-- viola `erp_guard_after_sales_case_identity()` — ese trigger considera
-- `customer_id` parte de la identidad INMUTABLE del expediente (a
-- propósito: un caso de garantía nunca debe cambiar de dueño después de
-- abierto). NO se toca el trigger, NO hay bypass — el backfill de
-- `after_sales_cases` se ELIMINA (ver sección 4) y los casos legacy con
-- `customer_id IS NULL` se QUEDAN inmutables, tal cual.
--
-- En su lugar, `customers.history` aprende a reconocer un caso legacy por
-- la relación INMUTABLE que SÍ tiene: `after_sales_cases.sale_id` (NOT
-- NULL) → `sales.id` → `sales.customer_id` (ya enlazado por el backfill de
-- ventas, sección 2). Se prefiere `sale_id` sobre comparar
-- `customer_document_snapshot` como texto porque `sale_id` es NOT NULL, es
-- parte de la identidad inmutable del caso, y tras el backfill de ventas
-- `sales.customer_id` ya queda enlazado — sin comparar texto histórico.
--
-- Un caso pertenece al historial del customer si:
--   1. ac.customer_id = customer.id                              (moderno)
--   2. sale_id referencia una sale cuyo sales.customer_id = customer.id  (legacy, recién reparado por el backfill de ventas)
-- Es una condición OR sobre una sola fila (no un UNION) — nunca duplica un
-- caso aunque ambas ramas sean verdaderas a la vez.
do $patch_history_after_sales_legacy$
declare
  v_oid oid;
  v_def text;
  v_needle text :=
$$            select case_number as "caseNumber", case_type as "caseType", status,
                   product_name_snapshot as "productName", unit_code_snapshot as "unitCode",
                   reported_issue as "reportedIssue", opened_at as "openedAt"
            from public.after_sales_cases where customer_id=c.id
            order by opened_at desc
            limit 20$$;
  v_replacement text :=
$$            select case_number as "caseNumber", case_type as "caseType", status,
                   product_name_snapshot as "productName", unit_code_snapshot as "unitCode",
                   reported_issue as "reportedIssue", opened_at as "openedAt"
            from public.after_sales_cases acx
            where acx.customer_id = c.id
               or exists (
                    select 1 from public.sales s
                    where s.id = acx.sale_id and s.customer_id = c.id
                  )
            order by opened_at desc
            limit 20$$;
  v_ocurrencias integer;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'erp_agent_dispatch'
    and oidvectortypes(p.proargtypes) = 'uuid, text, jsonb, uuid'
  limit 1;

  if v_oid is null then raise exception 'P20_20A1_dispatch_not_found'; end if;
  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias := (length(v_def) - length(replace(v_def, v_needle, ''))) / greatest(length(v_needle), 1);
  if v_ocurrencias = 0 then raise exception 'P20_20A1_history_anchor_not_found'; end if;
  if v_ocurrencias > 1 then raise exception 'P20_20A1_history_anchor_not_unique:%', v_ocurrencias; end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_history_after_sales_legacy$;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Backfill histórico — genérico, sin UUIDs ni nombres hardcodeados
-- ═══════════════════════════════════════════════════════════════════════
do $backfill_customers$
declare
  v_doc text;
  v_customer_id uuid;
  v_customer_name text;
  v_customer_document text;
  v_customer_phone text;
  v_customer_email text;
  v_conflictos int := 0;
  v_ventas_enlazadas int := 0;
  v_filas int;
begin
  -- Documentos con datos INCOMPATIBLES entre ventas distintas (mismo
  -- documento normalizado, pero nombre, teléfono o EMAIL distintos): se
  -- EXCLUYEN por completo del backfill automático — nunca se elige
  -- arbitrariamente cuál versión es la correcta. El email es OPCIONAL en
  -- `sales`/`customers`: `count(distinct ...)` ya ignora los NULL por sí
  -- solo, y `nullif(lower(btrim(email)),'')` convierte el vacío en NULL
  -- antes de contar — así "un email real + el resto NULL" NUNCA cuenta
  -- como conflicto, solo dos o más emails REALES y DISTINTOS para el
  -- mismo documento.
  create temporary table tmp_p20_20a1_conflictos as
  select lower(btrim(customer_document)) as doc_normalizado
  from public.sales
  where customer_id is null
    and nullif(btrim(customer_name), '') is not null
    and nullif(btrim(customer_document), '') is not null
    and nullif(btrim(customer_phone), '') is not null
  group by lower(btrim(customer_document))
  having count(distinct lower(btrim(customer_name))) > 1
      or count(distinct regexp_replace(customer_phone, '\D', '', 'g')) > 1
      or count(distinct nullif(lower(btrim(customer_email)), '')) > 1;

  select count(*) into v_conflictos from tmp_p20_20a1_conflictos;
  if v_conflictos > 0 then
    raise notice 'P20_20A1_backfill: % documento(s) con datos incompatibles EXCLUIDOS del backfill (revisar manualmente)', v_conflictos;
  end if;

  -- Para cada documento SIN conflicto: resolver/crear el customer UNA sola
  -- vez (misma función que usan las ventas nuevas) con el snapshot de la
  -- venta MÁS ANTIGUA como fuente si hay que crear — determinista — y
  -- enlazar TODAS las ventas de ese documento a la vez. Los snapshots de
  -- `sales` no se tocan: solo `customer_id`.
  for v_doc in
    select lower(btrim(s.customer_document))
    from public.sales s
    where s.customer_id is null
      and nullif(btrim(s.customer_name), '') is not null
      and nullif(btrim(s.customer_document), '') is not null
      and nullif(btrim(s.customer_phone), '') is not null
      and lower(btrim(s.customer_document)) not in (select doc_normalizado from tmp_p20_20a1_conflictos)
    group by lower(btrim(s.customer_document))
  loop
    select customer_name, customer_document, customer_phone, customer_email
      into v_customer_name, v_customer_document, v_customer_phone, v_customer_email
    from public.sales
    where customer_id is null and lower(btrim(customer_document)) = v_doc
    order by created_at asc
    limit 1;

    v_customer_id := public.erp_internal_resolve_or_create_customer_by_document(
      v_customer_name, v_customer_document, v_customer_phone, v_customer_email
    );

    update public.sales
    set customer_id = v_customer_id
    where customer_id is null and lower(btrim(customer_document)) = v_doc;

    get diagnostics v_filas = row_count;
    v_ventas_enlazadas := v_ventas_enlazadas + v_filas;
  end loop;

  raise notice 'P20_20A1_backfill: % venta(s) enlazadas a un customer', v_ventas_enlazadas;

  -- P20.20A.1 (hardening post-dry-run real) — `after_sales_cases` NUNCA se
  -- actualiza aquí. `erp_guard_after_sales_case_identity()` (fase 1F)
  -- protege `customer_id` como parte de la identidad INMUTABLE del
  -- expediente — un UPDATE contra esa columna dispara
  -- `after_sales_case_identity_is_immutable` (confirmado en el dry-run
  -- real). Eso es intencional: un caso de garantía no debe cambiar de
  -- dueño después de abierto. Ni se toca el trigger, ni se hace bypass.
  --
  -- Los casos legacy con `customer_id IS NULL` se QUEDAN así, inmutables
  -- para siempre — `customers.history` (parche 3b, arriba) los reconoce
  -- igual, por la relación INMUTABLE que sí tienen: `sale_id` (NOT NULL) →
  -- `sales.id` → `sales.customer_id` (ya enlazado por el bucle de arriba).
end;
$backfill_customers$;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Verificación final (mismo patrón de siempre)
-- ═══════════════════════════════════════════════════════════════════════
do $verify$
declare
  v_pol jsonb;
  v_dispatch_def text;
  v_sale_def text;
  v_huerfanas_sales int;
  v_casos_legacy_resolubles int;
begin
  select public.erp_agent_action_policy('customers.list') into v_pol;
  if (v_pol->>'permission') <> 'customers.manage' or (v_pol->>'risk') <> 'read' then
    raise exception 'P20_20A1_policy_customers_list_failed:%', v_pol;
  end if;

  select pg_get_functiondef(p.oid) into v_dispatch_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'erp_agent_dispatch'
    and oidvectortypes(p.proargtypes) = 'uuid, text, jsonb, uuid';
  if v_dispatch_def not ilike '%customers.list%' then
    raise exception 'P20_20A1_dispatch_verification_failed';
  end if;

  -- P20.20A.1 (hardening post-dry-run) — confirma que customers.history YA
  -- reconoce casos legacy vía sale_id (patch 3b), sin exigir que
  -- after_sales_cases.customer_id se haya tocado (nunca se toca).
  if v_dispatch_def not ilike '%acx.customer_id = c.id%'
     or v_dispatch_def not ilike '%s.customer_id = c.id%'
     or v_dispatch_def not ilike '%acx.sale_id%' then
    raise exception 'P20_20A1_history_legacy_verification_failed';
  end if;

  select pg_get_functiondef(p.oid) into v_sale_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'erp_internal_create_sale_with_units'
    and oidvectortypes(p.proargtypes) = 'uuid, text, text, text, text, jsonb, bigint, text, text, integer, text, uuid';
  if v_sale_def not ilike '%v_final_customer_id%'
     or v_sale_def not ilike '%erp_internal_resolve_or_create_customer_by_document%' then
    raise exception 'P20_20A1_create_sale_verification_failed';
  end if;

  -- El backfill no debe dejar ninguna venta "reparable" sin reparar (con
  -- snapshot completo, sin conflicto detectado, y aun así customer_id
  -- NULL) — si quedara alguna, algo en el bucle falló silenciosamente.
  select count(*) into v_huerfanas_sales
  from public.sales s
  where s.customer_id is null
    and nullif(btrim(s.customer_name), '') is not null
    and nullif(btrim(s.customer_document), '') is not null
    and nullif(btrim(s.customer_phone), '') is not null
    and lower(btrim(s.customer_document)) not in (select doc_normalizado from tmp_p20_20a1_conflictos);
  if v_huerfanas_sales > 0 then
    raise exception 'P20_20A1_backfill_incompleto:% ventas reparables sin reparar', v_huerfanas_sales;
  end if;

  -- Informativo, NUNCA falla: cuántos casos de posventa legacy
  -- (customer_id IS NULL, inmutable, nunca se toca) quedan resolubles por
  -- `customers.history` gracias al enlace de su venta. Un número en 0 es
  -- perfectamente válido (p. ej. si no hay casos legacy en el entorno).
  select count(*) into v_casos_legacy_resolubles
  from public.after_sales_cases ac
  join public.sales s on s.id = ac.sale_id
  where ac.customer_id is null and s.customer_id is not null;
  raise notice 'P20_20A1_backfill: % caso(s) de posventa legacy (customer_id NULL, inmutable) quedan resolubles vía sale_id', v_casos_legacy_resolubles;
end;
$verify$;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Limpieza explícita de la tabla temporal
-- ═══════════════════════════════════════════════════════════════════════
-- Antes: `on commit drop`, dependía implícitamente de que el runner
-- envuelva TODO el archivo en una transacción que termine en COMMIT (o
-- ROLLBACK) — cierto hoy, pero no algo que este archivo deba asumir por su
-- cuenta. Ahora: DROP explícito, DESPUÉS de que `$verify$` ya la usó —
-- nunca depende de que ocurra un COMMIT para desaparecer, y sigue
-- funcionando igual si todo esto corre dentro de un BEGIN/ROLLBACK externo
-- de prueba (el DROP surte efecto dentro de la misma transacción, sin
-- necesitar confirmarla). Ningún COMMIT se agrega en este archivo.
drop table if exists tmp_p20_20a1_conflictos;
