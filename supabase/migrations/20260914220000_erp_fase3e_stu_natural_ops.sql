-- P20.18 (corrección tras auditoría contra STAGING real) · Lenguaje natural
-- completo sobre inventario físico (STU) y catálogo por WhatsApp: detalle
-- real de unidad, transición individual/lista/rango de forma ATÓMICA, y
-- listado de productos como lectura directa del administrador.
--
-- ── CORRECCIÓN CRÍTICA SOBRE LA VERSIÓN ANTERIOR ───────────────────────────
-- La matriz de transición NO vive en `erp_transition_product_unit()` (ese es
-- solo un WRAPPER que decide el permiso — `inventory.reserve` o `inventory.
-- manage` según la transición — y delega). La matriz real vive en
-- `erp_internal_transition_product_unit(uuid,text,text,text,text,timestamptz)`.
-- Esta versión parchea la función INTERNA, nunca el wrapper, y verifica
-- explícitamente que el wrapper sigue delegando en ella.
--
-- ── QUÉ SE REUTILIZA (auditado contra STAGING real) ────────────────────────
--   - `erp_transition_product_unit()` (wrapper) decide el permiso correcto
--     (`inventory.reserve` para `->reserved` o `reserved->available`;
--     `inventory.manage` en cualquier otro caso) y llama a la función
--     interna. El lote SIEMPRE pasa por este wrapper — nunca se llama a
--     `erp_internal_transition_product_unit()` directamente desde el batch,
--     así ese chequeo de permiso específico NUNCA se pierde (§8 auditoría).
--   - `erp_internal_transition_product_unit()` tiene la matriz, `is_admin`,
--     `SELECT ... FOR UPDATE`, el no-op `v_from = v_to`, la regla
--     `sold_transition_requires_prior_sale`, los requisitos de reserva,
--     `reason_required_for_status`, `inventory_movements`, `audit_events` y
--     la limpieza de campos de reservación — NADA de eso se toca; solo se
--     reemplaza la tabla `v_allowed := (...)` por una llamada a la función
--     pura extraída.
--   - El patrón de permiso/elevación (`erp_assert_permission` +
--     `erp_legacy_elevate/restore`) es el mismo de Fase 2D/3C.
--   - El patrón de extensión aditiva de `erp_agent_action_policy`/
--     `erp_agent_dispatch` (leer con `pg_get_functiondef`, reemplazar un
--     ancla exacta) es el mismo que P20.17C/P20.17-bis.
--
-- ── GUARDA FUERTE DEL PARCHE ────────────────────────────────────────────
-- Antes de cualquier `execute replace(...)`: la función debe existir con la
-- firma EXACTA esperada, sin overloads inesperados, y el ancla debe
-- aparecer EXACTAMENTE una vez en su definición — si algo de esto falla, la
-- migración ABORTA (ninguna DDL parcial) en vez de intentar un replace
-- dudoso.
--
-- ── ATOMICIDAD DEL LOTE (sin nada nuevo que inventar) ──────────────────────
-- `erp_agent_confirm_request()` envuelve `erp_agent_dispatch()` en un
-- `begin...exception when others...end` — cualquier excepción sin capturar
-- deshace TODO lo hecho en esa transacción. `erp_transition_product_units_
-- batch()` se apoya en esto para el caso de fallo INESPERADO (una unidad
-- cambió de estado entre el preview y el CONFIRMAR), pero valida todo lo
-- detectable de antemano ANTES de mutar nada (normalización, duplicados,
-- códigos vacíos, existencia) para no depender del rollback más de lo
-- necesario — el rollback sigue siendo la red de seguridad final, no la
-- única defensa.
--
-- ── PREVIEW VS EJECUCIÓN ────────────────────────────────────────────────
-- El preview (`erp_resolve_product_units_batch` con `toStatus`) es
-- INFORMATIVO — entre el preview y el CONFIRMAR el estado real puede
-- cambiar (otro operador, otra sesión). La ejecución SIEMPRE vuelve a pasar
-- por `erp_transition_product_unit()` → `erp_internal_transition_product_
-- unit()`, que revalida con `SELECT ... FOR UPDATE` — nunca se asume que el
-- preview garantiza el estado futuro.
--
-- ── ACCIONES NUEVAS (sin cambios de contrato respecto a la versión previa) ─
--   inventory.resolve_units (read)   — detalle real de 1..100 STU; con
--                                       `toStatus`, evalúa `canTransition` +
--                                       `alreadyInTargetStatus` SIN mutar.
--   inventory.transition_units (write) — transición atómica de 1..100 STU.
--   inventory.list_products (read)   — productos con filtros opcionales.

-- --------------------------------------------------------------------------
-- 1. Matriz de transición como función propia (extraída, no reinventada)
-- --------------------------------------------------------------------------

create or replace function public.erp_unit_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select
       (p_from = 'received'   and p_to in ('inspection','available','retired'))
    or (p_from = 'inspection' and p_to in ('available','repair','retired'))
    or (p_from = 'available'  and p_to in ('reserved','repair','retired'))
    or (p_from = 'reserved'   and p_to in ('available','repair','retired'))
    or (p_from = 'sold'       and p_to in ('warranty','returned'))
    or (p_from = 'warranty'   and p_to in ('repair','sold','retired'))
    or (p_from = 'repair'     and p_to in ('available','sold','retired'))
    or (p_from = 'returned'   and p_to in ('repair','retired'));
$$;
comment on function public.erp_unit_transition_allowed(text, text) is
  'P20.18: matriz PURA de transición de product_units.status, extraída de erp_internal_transition_product_unit() para que el preview de lotes (erp_resolve_product_units_batch) pueda evaluarla SIN mutar nada. Única fuente de verdad — erp_internal_transition_product_unit() la usa en vez de repetirla. Deliberadamente NO incluye pares same-state (from=to): eso es un no-op, se trata aparte en el preview y en la propia erp_internal_transition_product_unit().';
-- §9 de la auditoría: privilegios EXPLÍCITOS — una función nueva puede
-- conservar EXECUTE para PUBLIC por defecto; se revoca primero y se otorga
-- solo a `authenticated`, aunque el riesgo ya sea bajo (pura, immutable).
revoke all on function public.erp_unit_transition_allowed(text, text) from public, anon, authenticated;
grant execute on function public.erp_unit_transition_allowed(text, text) to authenticated;

-- --------------------------------------------------------------------------
-- 1.1 Normalización + validación de un lote de códigos STU — ÚNICA fuente de
--     verdad para "vacíos/duplicados/límite", compartida por el preview
--     (erp_resolve_product_units_batch) y la ejecución (erp_transition_
--     product_units_batch) para que ambos compartan EXACTAMENTE la misma
--     semántica (§5 de la auditoría).
-- --------------------------------------------------------------------------

create or replace function public.erp_normalize_unit_codes_batch(p_unit_codes text[])
returns text[]
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_codes text[];
begin
  if p_unit_codes is null or array_length(p_unit_codes, 1) is null then
    raise exception 'unit_codes_required';
  end if;
  if array_length(p_unit_codes, 1) > 100 then
    raise exception 'too_many_units:%', array_length(p_unit_codes, 1);
  end if;

  select array_agg(upper(btrim(c))) into v_codes from unnest(p_unit_codes) as c;

  if exists (select 1 from unnest(v_codes) as c where c is null or c = '') then
    raise exception 'invalid_unit_code';
  end if;

  if (select count(*) from unnest(v_codes) as c) <> (select count(distinct c) from unnest(v_codes) as c) then
    raise exception 'duplicate_unit_codes';
  end if;

  return v_codes;
end;
$$;
revoke all on function public.erp_normalize_unit_codes_batch(text[]) from public, anon, authenticated;
grant execute on function public.erp_normalize_unit_codes_batch(text[]) to authenticated;

comment on function public.erp_normalize_unit_codes_batch(text[]) is
  'P20.18: normaliza (upper+btrim) y valida un lote de códigos STU — rechaza vacío/nulo, >100, elementos en blanco y duplicados. Única fuente de verdad, compartida por preview y ejecución.';

-- --------------------------------------------------------------------------
-- 2. Parche a la función INTERNA — NUNCA al wrapper `erp_transition_
--    product_unit()`. Guarda fuerte: firma exacta, un solo overload, ancla
--    presente EXACTAMENTE una vez, o la migración ABORTA sin tocar nada.
-- --------------------------------------------------------------------------

do $patch_matrix$
declare
  v_oid oid;
  v_count integer;
  v_def text;
  v_needle text :=
$needle$  v_allowed :=
       (v_from = 'received'   and v_to in ('inspection','available','retired'))
    or (v_from = 'inspection' and v_to in ('available','repair','retired'))
    or (v_from = 'available'  and v_to in ('reserved','repair','retired'))
    or (v_from = 'reserved'   and v_to in ('available','repair','retired'))
    or (v_from = 'sold'       and v_to in ('warranty','returned'))
    or (v_from = 'warranty'   and v_to in ('repair','sold','retired'))
    or (v_from = 'repair'     and v_to in ('available','sold','retired'))
    or (v_from = 'returned'   and v_to in ('repair','retired'));$needle$;
  v_replacement text :=
    $$  v_allowed := public.erp_unit_transition_allowed(v_from, v_to);$$;
  v_ocurrencias integer;
begin
  -- Cuenta CUÁNTAS funciones 'erp_internal_transition_product_unit' existen
  -- en public, sin filtrar todavía por firma — si hay más de una (overload
  -- inesperado), abortar en vez de adivinar cuál parchear.
  select count(*)
    into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_internal_transition_product_unit';

  if v_count = 0 then
    raise exception 'P20_18_internal_transition_not_found';
  end if;

  -- Guarda fuerte: no aceptar overloads inesperados. Esta migración fue
  -- auditada contra una única firma instalada en STAGING.
  if v_count <> 1 then
    raise exception 'P20_18_internal_transition_unexpected_overloads:%', v_count;
  end if;

  -- No comparar oidvectortypes() con alias textuales como `timestamptz`:
  -- PostgreSQL lo representa canónicamente como `timestamp with time zone`.
  -- regprocedure resuelve la firma por tipos reales, no por ese string.
  v_oid := to_regprocedure(
    'public.erp_internal_transition_product_unit(uuid,text,text,text,text,timestamptz)'
  );

  if v_oid is null then
    raise exception 'P20_18_internal_transition_signature_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  -- El ancla debe aparecer EXACTAMENTE una vez — nunca cero, nunca dos o más.
  v_ocurrencias := (length(v_def) - length(replace(v_def, v_needle, ''))) / greatest(length(v_needle), 1);
  if v_ocurrencias = 0 then
    raise exception 'P20_18_internal_transition_patch_anchor_not_found';
  end if;
  if v_ocurrencias > 1 then
    raise exception 'P20_18_internal_transition_patch_anchor_not_unique:%', v_ocurrencias;
  end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_matrix$;

-- --------------------------------------------------------------------------
-- 2.1 Guardas INMEDIATAS post-parche (antes de seguir con el resto de la
--     migración) — si algo no cuadra, abortar aquí y ahora.
-- --------------------------------------------------------------------------

do $verify_patch_matrix$
declare
  v_def_internal text;
  v_def_wrapper text;
  v_needle_original text :=
$needle$  v_allowed :=
       (v_from = 'received'   and v_to in ('inspection','available','retired'))
    or (v_from = 'inspection' and v_to in ('available','repair','retired'))
    or (v_from = 'available'  and v_to in ('reserved','repair','retired'))
    or (v_from = 'reserved'   and v_to in ('available','repair','retired'))
    or (v_from = 'sold'       and v_to in ('warranty','returned'))
    or (v_from = 'warranty'   and v_to in ('repair','sold','retired'))
    or (v_from = 'repair'     and v_to in ('available','sold','retired'))
    or (v_from = 'returned'   and v_to in ('repair','retired'));$needle$;
begin
  select pg_get_functiondef(p.oid)
    into v_def_internal
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_internal_transition_product_unit'
    and p.oid = to_regprocedure(
      'public.erp_internal_transition_product_unit(uuid,text,text,text,text,timestamptz)'
    )
  limit 1;

  if v_def_internal is null or v_def_internal not ilike '%erp_unit_transition_allowed%' then
    raise exception 'P20_18_internal_transition_patch_verification_failed_missing_call';
  end if;
  if position(v_needle_original in v_def_internal) <> 0 then
    raise exception 'P20_18_internal_transition_patch_verification_failed_matrix_still_present';
  end if;

  -- El wrapper NO se tocó — sigue delegando en la función interna.
  select pg_get_functiondef(p.oid)
    into v_def_wrapper
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_transition_product_unit'
  limit 1;

  if v_def_wrapper is null or v_def_wrapper not ilike '%erp_internal_transition_product_unit%' then
    raise exception 'P20_18_wrapper_no_longer_delegates';
  end if;
end;
$verify_patch_matrix$;

-- --------------------------------------------------------------------------
-- 3. Lote de TRANSICIÓN — SIEMPRE pasa por el WRAPPER `erp_transition_
--    product_unit()` (nunca por la función interna directamente), para que
--    su chequeo de permiso específico (inventory.reserve vs inventory.
--    manage, según la transición) NUNCA se pierda (§8 de la auditoría).
--
--    Fases (§11): 1) normalizar/validar el lote completo; 2) resolver TODOS
--    los códigos contra product_units; 3) si alguno no existe, excepción
--    ANTES de mutar nada; 4) recién ahí, transicionar uno a uno. Ninguna
--    fase reimplementa la matriz — solo usa existencia simple; la
--    autoridad final sigue siendo erp_transition_product_unit(), que
--    revalida con SELECT...FOR UPDATE (el preview pudo quedar desactualizado).
-- --------------------------------------------------------------------------

create or replace function public.erp_transition_product_units_batch(
  p_unit_codes text[],
  p_to_status text,
  p_reason text default null,
  p_reservation_customer_name text default null,
  p_reservation_customer_phone text default null,
  p_reservation_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prev boolean;
  v_codes text[];
  v_missing text[] := '{}';
  v_items jsonb := '[]'::jsonb;
  v_count integer := 0;
  rec record;
begin
  perform public.erp_assert_permission('inventory.manage');
  v_prev := public.erp_legacy_elevate();

  -- FASE 1 — normaliza y valida el lote COMPLETO (vacío/blanco/duplicado/
  -- límite) antes de tocar `product_units`. Restaura is_admin si falla aquí:
  -- es un rechazo esperado, no un fallo a medio mutar.
  begin
    v_codes := public.erp_normalize_unit_codes_batch(p_unit_codes);
  exception when others then
    perform public.erp_legacy_restore(v_prev);
    raise;
  end;

  -- FASE 2 — resuelve TODOS los códigos de una sola vez (sin mutar).
  for rec in
    select upper(btrim(w.code)) as code, u.id, u.status
    from unnest(v_codes) with ordinality as w(code, ord)
    left join public.product_units u on upper(u.unit_code) = upper(btrim(w.code))
    order by w.ord
  loop
    if rec.id is null then
      v_missing := v_missing || rec.code;
    end if;
  end loop;

  -- FASE 3 — si CUALQUIERA no existe, excepción ANTES de mutar ninguna.
  if array_length(v_missing, 1) > 0 then
    perform public.erp_legacy_restore(v_prev);
    raise exception 'unit_not_found:%', array_to_string(v_missing, ',');
  end if;

  -- FASE 4 — transiciona una por una a través del WRAPPER (nunca de la
  -- función interna directamente): SIN capturar excepciones — si el estado
  -- cambió desde el preview (concurrencia real) o cualquier otra regla de
  -- negocio falla aquí, la excepción se propaga sin capturar y el
  -- `begin...exception` de `erp_agent_confirm_request()` deshace TODO el
  -- lote (mismo mecanismo que ya usa `erp_receive_units_batch()`).
  for rec in
    select upper(btrim(w.code)) as code, u.id, u.status
    from unnest(v_codes) with ordinality as w(code, ord)
    join public.product_units u on upper(u.unit_code) = upper(btrim(w.code))
    order by w.ord
  loop
    perform public.erp_transition_product_unit(
      rec.id, p_to_status, p_reason,
      p_reservation_customer_name, p_reservation_customer_phone, p_reservation_expires_at
    );

    v_items := v_items || jsonb_build_object(
      'unitCode', rec.code, 'fromStatus', rec.status, 'toStatus', lower(btrim(p_to_status))
    );
    v_count := v_count + 1;
  end loop;

  perform public.erp_legacy_restore(v_prev);
  return jsonb_build_object('items', v_items, 'count', v_count);
end;
$$;
revoke all on function public.erp_transition_product_units_batch(text[], text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.erp_transition_product_units_batch(text[], text, text, text, text, timestamptz) to authenticated;

comment on function public.erp_transition_product_units_batch(text[], text, text, text, text, timestamptz) is
  'P20.18 (corregido): transiciona 1..100 STU en una transacción atómica, SIEMPRE a través de erp_transition_product_unit() (nunca la función interna directa) para conservar su chequeo de permiso específico (inventory.reserve vs inventory.manage). Valida duplicados/vacíos/existencia ANTES de mutar; revalida con SELECT...FOR UPDATE en la ejecución real.';

-- --------------------------------------------------------------------------
-- 4. Lote de RESOLUCIÓN — detalle real de 1..100 STU; con `toStatus`,
--    evalúa `canTransition` + `alreadyInTargetStatus` SIN mutar nada.
--
--    Semántica alineada con la ejecución REAL de erp_internal_transition_
--    product_unit():
--      - u.status = toStatus            → canTransition=true,  alreadyInTargetStatus=true  (no-op real)
--      - toStatus = 'sold'               → canTransition = matriz Y sold_at IS NOT NULL
--      - cualquier otro caso             → canTransition = matriz pura
-- --------------------------------------------------------------------------

create or replace function public.erp_resolve_product_units_batch(
  p_unit_codes text[],
  p_to_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prev boolean;
  v_codes text[];
  v_result jsonb;
  v_to text := nullif(lower(btrim(coalesce(p_to_status, ''))), '');
begin
  perform public.erp_assert_permission('inventory.read');
  v_prev := public.erp_legacy_elevate();

  -- Misma validación EXACTA que la ejecución (§5 de la auditoría): preview
  -- y ejecución comparten semántica de vacío/duplicado/límite.
  begin
    v_codes := public.erp_normalize_unit_codes_batch(p_unit_codes);
  exception when others then
    perform public.erp_legacy_restore(v_prev);
    raise;
  end;

  if v_to is not null and v_to not in ('received','inspection','available','reserved','sold','warranty','repair','returned','retired') then
    perform public.erp_legacy_restore(v_prev);
    raise exception 'invalid_status_filter:%', v_to;
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.ord), '[]'::jsonb) into v_result
  from (
    select
      w.ord,
      upper(btrim(w.code)) as "unitCode",
      (u.id is not null) as "found",
      u.status,
      u.product_id as "productId",
      p.title as "productTitle", p.brand, p.model,
      p.ram, p.storage, p.storage_gb as "storageGb", p.price,
      u.serial_number as "serialNumber",
      u.spec_overrides as "specOverrides",
      u.battery_health_percent as "batteryHealthPercent",
      u.storage_health_percent as "storageHealthPercent",
      u.notes,
      u.received_at as "receivedAt",
      u.reserved_at as "reservedAt",
      u.reservation_expires_at as "reservationExpiresAt",
      u.reservation_customer_name as "reservationCustomerName",
      case
        when v_to is null or u.id is null then null
        -- Mismo estado que el destino: la ejecución real es un no-op válido
        -- (`if v_from = v_to then return`) — NUNCA se marca como inválido
        -- solo porque la matriz pura no lo contempla (la matriz no incluye
        -- pares same-state a propósito).
        when u.status = v_to then true
        -- `sold` exige ADEMÁS que la unidad ya haya sido vendida alguna vez
        -- (`sold_transition_requires_prior_sale`) — nunca basta la matriz
        -- sola, para no permitir que una reparación pre-venta se convierta
        -- artificialmente en venta.
        when v_to = 'sold' then public.erp_unit_transition_allowed(u.status, v_to) and u.sold_at is not null
        else public.erp_unit_transition_allowed(u.status, v_to)
      end as "canTransition",
      case
        when v_to is null or u.id is null then null
        else (u.status = v_to)
      end as "alreadyInTargetStatus"
    from unnest(v_codes) with ordinality as w(code, ord)
    left join public.product_units u on upper(u.unit_code) = upper(btrim(w.code))
    left join public.products p on p.id = u.product_id
  ) x;

  perform public.erp_legacy_restore(v_prev);
  return jsonb_build_object('items', v_result);
end;
$$;
revoke all on function public.erp_resolve_product_units_batch(text[], text) from public, anon, authenticated;
grant execute on function public.erp_resolve_product_units_batch(text[], text) to authenticated;

comment on function public.erp_resolve_product_units_batch(text[], text) is
  'P20.18 (corregido): detalle real de 1..100 STU. canTransition/alreadyInTargetStatus alineados con la semántica REAL de erp_internal_transition_product_unit() (mismo estado = no-op válido; sold exige sold_at). Solo informativo — la ejecución revalida siempre con SELECT...FOR UPDATE.';

-- --------------------------------------------------------------------------
-- 5. Extender política y dispatcher (aditivo, mismo patrón de P20.17C/-bis)
-- --------------------------------------------------------------------------

do $patch_policy$
declare
  v_oid oid;
  v_def text;
  v_needle text :=
    $$    when 'inventory.find_products'                        then jsonb_build_object('permission','inventory.read','risk','read')$$;
  v_replacement text :=
    $$    when 'inventory.find_products'                        then jsonb_build_object('permission','inventory.read','risk','read')
    when 'inventory.resolve_units'                        then jsonb_build_object('permission','inventory.read','risk','read')
    when 'inventory.list_products'                        then jsonb_build_object('permission','inventory.read','risk','read')
    when 'inventory.transition_units'                     then jsonb_build_object('permission','inventory.manage','risk','write')$$;
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
    raise exception 'P20_18_action_policy_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias := (length(v_def) - length(replace(v_def, v_needle, ''))) / greatest(length(v_needle), 1);
  if v_ocurrencias = 0 then
    raise exception 'P20_18_action_policy_patch_anchor_not_found';
  end if;
  if v_ocurrencias > 1 then
    raise exception 'P20_18_action_policy_patch_anchor_not_unique:%', v_ocurrencias;
  end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_policy$;

do $patch_dispatch_declare$
declare
  v_oid oid;
  v_def text;
  v_needle text := $$  v_serials text[];
  v_units jsonb;
begin$$;
  v_replacement text := $$  v_serials text[];
  v_units jsonb;
  v_codes text[];
  v_limit integer;
  v_brand text;
  v_status text;
begin$$;
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
    raise exception 'P20_18_dispatch_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias := (length(v_def) - length(replace(v_def, v_needle, ''))) / greatest(length(v_needle), 1);
  if v_ocurrencias = 0 then
    raise exception 'P20_18_dispatch_declare_patch_anchor_not_found';
  end if;
  if v_ocurrencias > 1 then
    raise exception 'P20_18_dispatch_declare_patch_anchor_not_unique:%', v_ocurrencias;
  end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_dispatch_declare$;

do $patch_dispatch_case$
declare
  v_oid oid;
  v_def text;

  v_needle text :=
$needle$    else
      raise exception 'erp_agent_unknown_action:%',v_action;$needle$;

  v_replacement text :=
$replacement$    when 'inventory.resolve_units' then
      select array_agg(value) into v_codes from jsonb_array_elements_text(coalesce(v_args->'unitCodes','[]'::jsonb));
      v_result := public.erp_resolve_product_units_batch(v_codes, v_args->>'toStatus');

    when 'inventory.transition_units' then
      select array_agg(value) into v_codes from jsonb_array_elements_text(coalesce(v_args->'unitCodes','[]'::jsonb));
      v_result := public.erp_transition_product_units_batch(
        v_codes,
        v_args->>'toStatus',
        v_args->>'reason',
        v_args->>'reservationCustomerName',
        v_args->>'reservationCustomerPhone',
        case when nullif(v_args->>'reservationExpiresAt','') is null then null
             else (v_args->>'reservationExpiresAt')::timestamptz end
      );

    when 'inventory.list_products' then
      v_q:=nullif(lower(btrim(coalesce(v_args->>'query',''))),'');
      v_brand:=nullif(lower(btrim(coalesce(v_args->>'brand',''))),'');
      v_status:=nullif(lower(btrim(coalesce(v_args->>'status',''))),'');
      v_limit:=least(greatest(coalesce(nullif(v_args->>'limit','')::integer,20),1),50);
      if v_status is not null and v_status not in ('received','inspection','available','reserved','sold','warranty','repair','returned','retired') then
        raise exception 'invalid_status_filter:%',v_status;
      end if;
      select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)) into v_result
      from (
        select p.id as "productId", p.title, p.brand, p.model, p.cpu, p.ram,
               p.storage, p.storage_gb as "storageGb", p.gpu_model as "gpu",
               p.screen, p.price,
               coalesce(p.visible_web,false) as "visibleWeb",
               coalesce(p.erp_stock_enabled,false) as "erpStockEnabled"
        from public.products p
        where (
          v_q is null or (
            select bool_and(
              lower(coalesce(p.title,'')||' '||coalesce(p.brand,'')||' '||coalesce(p.model,''))
              like '%'||w||'%'
            )
            from unnest(string_to_array(v_q,' ')) as w
            where length(w)>0
          )
        )
        and (v_brand is null or lower(coalesce(p.brand,'')) like '%'||v_brand||'%')
        and (case when nullif(v_args->>'ramGb','') is null then true else p.ram=(v_args->>'ramGb')::integer end)
        and (case when nullif(v_args->>'storageGb','') is null then true else p.storage_gb=(v_args->>'storageGb')::integer end)
        and (v_status is null or exists(select 1 from public.product_units u3 where u3.product_id=p.id and u3.status=v_status))
        order by p.created_at desc
        limit v_limit
      ) x;

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
    and oidvectortypes(p.proargtypes) =
      'uuid, text, jsonb, uuid'
  limit 1;

  if v_oid is null then
    raise exception 'P20_18_dispatch_not_found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  v_ocurrencias := (length(v_def) - length(replace(v_def, v_needle, ''))) / greatest(length(v_needle), 1);
  if v_ocurrencias = 0 then
    raise exception 'P20_18_dispatch_case_patch_anchor_not_found';
  end if;
  if v_ocurrencias > 1 then
    raise exception 'P20_18_dispatch_case_patch_anchor_not_unique:%', v_ocurrencias;
  end if;

  execute replace(v_def, v_needle, v_replacement);
end;
$patch_dispatch_case$;

-- --------------------------------------------------------------------------
-- 6. Guardas de instalación (ampliadas — §14 de la auditoría)
-- --------------------------------------------------------------------------

do $verify$
declare
  v_pol_resolve jsonb;
  v_pol_transition jsonb;
  v_pol_list jsonb;
  v_dispatch_def text;
  v_def_internal text;
  v_def_wrapper text;
  v_pos jsonb := '[
    ["received","inspection"], ["received","available"], ["received","retired"],
    ["inspection","available"], ["inspection","repair"], ["inspection","retired"],
    ["available","reserved"], ["available","repair"], ["available","retired"],
    ["reserved","available"], ["reserved","repair"], ["reserved","retired"],
    ["sold","warranty"], ["sold","returned"],
    ["warranty","repair"], ["warranty","sold"], ["warranty","retired"],
    ["repair","available"], ["repair","sold"], ["repair","retired"],
    ["returned","repair"], ["returned","retired"]
  ]'::jsonb;
  v_neg jsonb := '[
    ["received","sold"], ["available","sold"], ["sold","available"],
    ["retired","available"], ["returned","available"]
  ]'::jsonb;
  v_pair jsonb;
begin
  -- ── Política ────────────────────────────────────────────────────────
  select public.erp_agent_action_policy('inventory.resolve_units') into v_pol_resolve;
  select public.erp_agent_action_policy('inventory.transition_units') into v_pol_transition;
  select public.erp_agent_action_policy('inventory.list_products') into v_pol_list;

  if coalesce(v_pol_resolve->>'permission','') <> 'inventory.read'
     or coalesce(v_pol_resolve->>'risk','') <> 'read' then
    raise exception 'P20_18_policy_resolve_units_failed:%', v_pol_resolve;
  end if;
  if coalesce(v_pol_transition->>'permission','') <> 'inventory.manage'
     or coalesce(v_pol_transition->>'risk','') <> 'write' then
    raise exception 'P20_18_policy_transition_units_failed:%', v_pol_transition;
  end if;
  if coalesce(v_pol_list->>'permission','') <> 'inventory.read'
     or coalesce(v_pol_list->>'risk','') <> 'read' then
    raise exception 'P20_18_policy_list_products_failed:%', v_pol_list;
  end if;

  -- ── Dispatch ────────────────────────────────────────────────────────
  select pg_get_functiondef(p.oid)
    into v_dispatch_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_agent_dispatch'
    and oidvectortypes(p.proargtypes) = 'uuid, text, jsonb, uuid'
  limit 1;

  if v_dispatch_def not ilike '%inventory.resolve_units%'
     or v_dispatch_def not ilike '%inventory.transition_units%'
     or v_dispatch_def not ilike '%inventory.list_products%'
     or v_dispatch_def not ilike '%erp_transition_product_units_batch%'
     or v_dispatch_def not ilike '%erp_resolve_product_units_batch%' then
    raise exception 'P20_18_dispatch_verification_failed';
  end if;

  -- ── Matriz: exhaustiva, positivos Y negativos ──────────────────────
  for v_pair in select * from jsonb_array_elements(v_pos) loop
    if not public.erp_unit_transition_allowed(v_pair->>0, v_pair->>1) then
      raise exception 'P20_18_transition_matrix_missing:%->%', v_pair->>0, v_pair->>1;
    end if;
  end loop;
  for v_pair in select * from jsonb_array_elements(v_neg) loop
    if public.erp_unit_transition_allowed(v_pair->>0, v_pair->>1) then
      raise exception 'P20_18_transition_matrix_unexpected:%->%', v_pair->>0, v_pair->>1;
    end if;
  end loop;

  -- ── Parche: la función interna usa la matriz extraída; el wrapper sigue
  --    delegando en la función interna (ninguno de los dos se reescribió a
  --    mano; se re-verifica aquí, además de en el bloque inmediato de la
  --    sección 2.1, por si algo posterior en esta migración lo alterara).
  select pg_get_functiondef(p.oid)
    into v_def_internal
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_internal_transition_product_unit'
    and p.oid = to_regprocedure(
      'public.erp_internal_transition_product_unit(uuid,text,text,text,text,timestamptz)'
    )
  limit 1;

  if v_def_internal is null or v_def_internal not ilike '%erp_unit_transition_allowed%' then
    raise exception 'P20_18_internal_transition_final_verification_failed';
  end if;

  select pg_get_functiondef(p.oid)
    into v_def_wrapper
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'erp_transition_product_unit'
  limit 1;

  if v_def_wrapper is null or v_def_wrapper not ilike '%erp_internal_transition_product_unit%' then
    raise exception 'P20_18_wrapper_final_verification_failed';
  end if;
end;
$verify$;
