-- SISTETECNI ERP — Fase 3C
-- Recepción transaccional de unidades en lote, consulta de consecutivo STU sin
-- consumirlo, identidad de serial de fabricante (asignar/corregir) y condición
-- particular por unidad. Expuesto al agente de WhatsApp vía el dispatcher de
-- Fase 3A.2/3B — sin abrir SQL arbitrario ni una segunda vía a Supabase.
--
-- AUDITADO ANTES DE ESCRIBIR (no se crea nada de esto de cero):
--   - `product_units.unit_code` YA se genera con la secuencia real
--     `public.product_unit_code_seq` (creada en 20260827204500_erp_fase1b,
--     formato STU-NNNNNN vía `nextval()+lpad`). Se REUTILIZA tal cual — no se
--     crea una segunda secuencia.
--   - `erp_receive_product_unit()` (Fase 1B, envuelto por Fase 2D con permiso
--     'inventory.manage') YA recibe UNA unidad física + inventory_movement +
--     audit_event, atómico. `erp_receive_units_batch()` de abajo es un
--     WRAPPER que la llama N veces DENTRO de la misma transacción — no
--     reimplementa el INSERT.
--   - El consecutivo CORTO ("45") NUNCA fue una columna separada: se
--     reconstruye matemáticamente de `unit_code` (STU-NNNNNN) con `lpad`. No
--     se agrega `internal_sequence` — sería el identificador físico
--     redundante que el propio encargo pide no crear (P20.17B §4/§19).
--   - El código de PRE-RESERVA comercial (P20.12, `ST-XXXXXX`, 6 símbolos de
--     un alfabeto de 32 sin 0/O/1/I/L) es un objeto DISTINTO, en el AGENTE
--     (src/reservas/almacen.js), nunca en esta base. `STU-NNNNNN` (con la U)
--     y `ST-XXXXXX` no colisionan por prefijo NI por alfabeto — confirmado,
--     no se cambia nomenclatura en ningún lado (P20.17B §55/56 del encargo).
--   - Los permisos/confirmación/idempotencia por `meta_message_id` de
--     `erp_agent_submit_request`/`erp_agent_confirm_request`/
--     `erp_agent_cancel_request` (Fase 3A.2/3B) NO se tocan: solo se agregan
--     casos nuevos a `erp_agent_action_policy()`/`erp_agent_dispatch()`.
--
-- IMPORTANTE:
-- - NO modifica products.stock (igual que Fase 1B: sigue desacoplado).
-- - NO publica products.images ni title/description (Fase P20.17D).
-- - NO vende ni envía (Fase P20.17E). `sale.create_by_stu` sigue intacto.
-- - NO se aplica automáticamente: ver instrucciones de STAGING al final.

-- ============================================================================
-- 0. Ampliar el ledger para los tres hechos nuevos que audita esta fase
-- ============================================================================
-- Aditivo: se AGREGAN valores permitidos, ninguna fila existente deja de
-- cumplir la restricción (todas sus movement_type ya estaban en la lista).
alter table public.inventory_movements drop constraint if exists inventory_movements_type_check;
alter table public.inventory_movements add constraint inventory_movements_type_check check (movement_type in (
  'receipt','inspection','available','reserve','release_reservation','sale','return',
  'warranty_in','warranty_out','repair_in','repair_out','adjustment','retire',
  'serial_assigned','serial_corrected','condition_updated'
));

-- ============================================================================
-- 1. Recepción en lote — wrapper transaccional sobre erp_receive_product_unit
-- ============================================================================
-- p_manufacturer_serials: array ORDENADO, posición i → unidad i. El llamador
-- (agente) solo debe mandar un array cuando el orden es INEQUÍVOCO (P20.17B
-- §27); esta RPC no intenta adivinar una correspondencia. `quantity=5` con
-- `serials=[s1,s2,s3]` crea 5 unidades, asigna s1..s3 a las 3 primeras, las
-- 2 restantes quedan `serial_number=null` — nunca al revés, nunca reordenado.
create or replace function public.erp_receive_units_batch(
  p_product_id uuid,
  p_quantity integer,
  p_manufacturer_serials text[] default null,
  p_spec_overrides jsonb default '{}'::jsonb,
  p_notes text default null
)
returns table(unit_id uuid, unit_code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prev boolean;
  v_i integer;
  v_serial text;
  v_serial_count integer := coalesce(array_length(p_manufacturer_serials, 1), 0);
begin
  perform public.erp_assert_permission('inventory.manage');
  v_prev := public.erp_legacy_elevate();

  if p_product_id is null then raise exception 'product_id_required'; end if;
  if not exists (select 1 from public.products where id = p_product_id) then
    perform public.erp_legacy_restore(v_prev);
    raise exception 'product_not_found';
  end if;
  if p_quantity is null or p_quantity < 1 then
    perform public.erp_legacy_restore(v_prev);
    raise exception 'quantity_invalid';
  end if;
  -- Tope razonable de un solo lote por WhatsApp: coherente con el límite de
  -- `purchases_item_count_positive` (Fase 1G) para el mismo tipo de operación.
  if p_quantity > 100 then
    perform public.erp_legacy_restore(v_prev);
    raise exception 'quantity_exceeds_limit';
  end if;
  if v_serial_count > p_quantity then
    perform public.erp_legacy_restore(v_prev);
    raise exception 'too_many_serials_for_quantity';
  end if;

  for v_i in 1..p_quantity loop
    v_serial := case when v_i <= v_serial_count then nullif(btrim(p_manufacturer_serials[v_i]), '') else null end;
    -- Reutiliza la RPC de 1 unidad (Fase 1B/2D) tal cual: mismo INSERT, mismo
    -- movement 'receipt', mismo audit_event — nada se reimplementa aquí.
    -- `elevate`/`restore` anidados son seguros por diseño (Fase 2D): la
    -- llamada interna ve is_admin ya en true y no lo vuelve a bajar hasta que
    -- ESTA función restaura el valor original al final.
    return query
      select r.unit_id, r.unit_code
      from public.erp_receive_product_unit(p_product_id, v_serial, null, null, null, coalesce(p_spec_overrides, '{}'::jsonb), p_notes) r;
  end loop;

  perform public.erp_legacy_restore(v_prev);
end;
$$;
revoke all on function public.erp_receive_units_batch(uuid, integer, text[], jsonb, text) from public, anon, authenticated;
grant execute on function public.erp_receive_units_batch(uuid, integer, text[], jsonb, text) to authenticated;

comment on function public.erp_receive_units_batch(uuid, integer, text[], jsonb, text) is
  'Fase 3C: recibe N unidades físicas de un producto YA existente en una sola transacción, reutilizando erp_receive_product_unit por unidad. Estado inicial: received (mismo que Fase 1B — auditado, no se asume "available"). NO toca products.stock.';

-- ============================================================================
-- 2. Consulta de consecutivo — NO consume nextval()
-- ============================================================================
-- `pg_sequence_last_value()` es una lectura de catálogo (PG10+): expone el
-- último valor emitido por la secuencia SIN generar uno nuevo. `currval()` NO
-- sirve aquí — exige que la MISMA sesión ya haya llamado `nextval()` antes, lo
-- que nunca es cierto en una consulta administrativa aislada.
--
-- GARANTÍA REAL (auditada, no prometida de más): los códigos son únicos,
-- crecientes y nunca se reutilizan. NO son necesariamente consecutivos sin
-- huecos — un lote que falla a mitad de camino o un `nextval()` de un intento
-- descartado no le devuelve el número a la secuencia (comportamiento estándar
-- de PostgreSQL, no transaccional). Documentado aquí porque P20.17B §10 lo
-- exige explícitamente: no prometer ausencia de huecos que la base no garantiza.
create or replace function public.erp_inventory_sequence_status()
returns jsonb
language plpgsql
security invoker
stable
set search_path = public, pg_temp
as $$
declare
  v_last bigint;
begin
  perform public.erp_assert_permission('inventory.read');
  v_last := pg_catalog.pg_sequence_last_value('public.product_unit_code_seq'::regclass);
  if v_last is null then
    return jsonb_build_object('lastUsed', null, 'lastUsedCode', null, 'nextExpected', 1, 'nextExpectedCode', 'STU-000001');
  end if;
  return jsonb_build_object(
    'lastUsed', v_last,
    'lastUsedCode', 'STU-' || lpad(v_last::text, 6, '0'),
    'nextExpected', v_last + 1,
    'nextExpectedCode', 'STU-' || lpad((v_last + 1)::text, 6, '0')
  );
end;
$$;
revoke all on function public.erp_inventory_sequence_status() from public, anon, authenticated;
grant execute on function public.erp_inventory_sequence_status() to authenticated;

comment on function public.erp_inventory_sequence_status() is
  'Fase 3C: último consecutivo STU emitido y el siguiente esperado, SIN consumir nextval(). No promete ausencia de huecos (propiedad real de las sequences de PostgreSQL).';

-- ============================================================================
-- 3. Serial de fabricante — asignar Y corregir en una sola RPC
-- ============================================================================
-- Un `serial_number` previo NULL → 'serial_assigned'. Un valor previo
-- DISTINTO → 'serial_corrected', con el valor viejo Y el nuevo en el
-- metadata del movimiento (nunca se borra el hecho histórico, P20.17B §12).
-- Reenviar el MISMO valor ya vigente es un no-op idempotente: no genera un
-- segundo movimiento (retry-safe, P20.17B §23).
--
-- Unicidad: la reutiliza el índice `uq_product_units_serial_normalized`
-- (Fase 1A) — un duplicado revienta aquí con una excepción clara en vez de
-- silenciarse.
create or replace function public.erp_set_manufacturer_serial(
  p_unit_id uuid,
  p_serial_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prev boolean;
  v_actor uuid := auth.uid();
  v_unit public.product_units%rowtype;
  v_new text := nullif(btrim(coalesce(p_serial_number, '')), '');
  v_movement text;
begin
  perform public.erp_assert_permission('inventory.manage');
  v_prev := public.erp_legacy_elevate();

  if v_new is null then
    perform public.erp_legacy_restore(v_prev);
    raise exception 'serial_number_required';
  end if;

  select * into v_unit from public.product_units where id = p_unit_id for update;
  if not found then
    perform public.erp_legacy_restore(v_prev);
    raise exception 'unit_not_found';
  end if;

  if v_unit.serial_number is not null and lower(btrim(v_unit.serial_number)) = lower(v_new) then
    -- Idempotente: el mismo valor ya vigente no genera un movimiento nuevo.
    perform public.erp_legacy_restore(v_prev);
    return jsonb_build_object('unitId', v_unit.id, 'unitCode', v_unit.unit_code, 'serialAssigned', false, 'changed', false);
  end if;

  v_movement := case when v_unit.serial_number is null then 'serial_assigned' else 'serial_corrected' end;

  update public.product_units set serial_number = v_new where id = p_unit_id;

  insert into public.inventory_movements (unit_id, product_id, movement_type, from_status, to_status, reason, source, actor_ref, metadata, created_by)
  values (
    v_unit.id, v_unit.product_id, v_movement, null, null,
    case when v_movement = 'serial_assigned' then 'Serial de fabricante asignado' else 'Serial de fabricante corregido' end,
    'whatsapp_admin', case when v_actor is null then null else v_actor::text end,
    jsonb_strip_nulls(jsonb_build_object(
      'unitCode', v_unit.unit_code,
      'oldSerialPresent', v_unit.serial_number is not null,
      'oldSerial', v_unit.serial_number,
      'newSerial', v_new
    )),
    v_actor
  );

  insert into public.audit_events (actor_type, actor_ref, channel, operation, entity_type, entity_id, before_snapshot, after_snapshot, metadata)
  values (
    'whatsapp_admin', case when v_actor is null then null else v_actor::text end, 'whatsapp',
    case when v_movement = 'serial_assigned' then 'inventory.serial_assigned' else 'inventory.serial_corrected' end,
    'product_unit', v_unit.id,
    jsonb_build_object('serialNumber', v_unit.serial_number),
    jsonb_build_object('serialNumber', v_new),
    jsonb_build_object('unitCode', v_unit.unit_code)
  );

  perform public.erp_legacy_restore(v_prev);
  return jsonb_build_object('unitId', v_unit.id, 'unitCode', v_unit.unit_code, 'serialAssigned', true, 'changed', true, 'movement', v_movement);
end;
$$;
revoke all on function public.erp_set_manufacturer_serial(uuid, text) from public, anon, authenticated;
grant execute on function public.erp_set_manufacturer_serial(uuid, text) to authenticated;

comment on function public.erp_set_manufacturer_serial(uuid, text) is
  'Fase 3C: asigna (si estaba null) o corrige (si ya tenía otro valor) el serial de fabricante de una unidad. Único cuando está presente (índice Fase 1A). Idempotente si se reenvía el mismo valor. Nunca borra el hecho histórico: old/new quedan en inventory_movements.metadata.';

-- ============================================================================
-- 4. Condición particular de una unidad — spec_overrides + notes, sin tabla nueva
-- ============================================================================
-- Vocabulario CORTO recomendado (P20.17B §15, el mismo que ya usa P20.17A en
-- el agente: src/catalogo/draft-modelo.js CONDICIONES): pantalla_regular,
-- sin_bateria, bateria_degradada, rayones, teclado_regular, tapa_regular,
-- puerto_danado, estado_normal. NO se impone como CHECK de base de datos a
-- propósito — spec_overrides es jsonb de uso general (Fase 1A) y esa
-- taxonomía es una CONVENCIÓN de aplicación, no una restricción física de la
-- unidad; el agente la valida antes de llamar aquí. `p_condition` acepta
-- cualquier texto corto para no bloquear un caso nuevo no previsto (P20.17B
-- §15: "conservar capacidad de nota controlada").
--
-- SEPARA status (máquina de estados, Fase 1E) de condition (aquí): esta RPC
-- JAMÁS toca product_units.status.
create or replace function public.erp_update_unit_condition(
  p_unit_id uuid,
  p_condition text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prev boolean;
  v_actor uuid := auth.uid();
  v_unit public.product_units%rowtype;
  v_condition text := nullif(btrim(coalesce(p_condition, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_specs jsonb;
begin
  perform public.erp_assert_permission('inventory.manage');
  v_prev := public.erp_legacy_elevate();

  if v_condition is null and v_notes is null then
    perform public.erp_legacy_restore(v_prev);
    raise exception 'condition_or_notes_required';
  end if;
  if v_condition is not null and length(v_condition) > 40 then
    perform public.erp_legacy_restore(v_prev);
    raise exception 'condition_too_long';
  end if;

  select * into v_unit from public.product_units where id = p_unit_id for update;
  if not found then
    perform public.erp_legacy_restore(v_prev);
    raise exception 'unit_not_found';
  end if;

  v_specs := coalesce(v_unit.spec_overrides, '{}'::jsonb);
  if v_condition is not null then
    v_specs := v_specs || jsonb_build_object('condition', v_condition);
  end if;

  update public.product_units
  set spec_overrides = v_specs,
      notes = case when v_notes is not null then v_notes else notes end
  where id = p_unit_id;

  insert into public.inventory_movements (unit_id, product_id, movement_type, from_status, to_status, reason, source, actor_ref, metadata, created_by)
  values (
    v_unit.id, v_unit.product_id, 'condition_updated', null, null, 'Condición particular actualizada',
    'whatsapp_admin', case when v_actor is null then null else v_actor::text end,
    jsonb_strip_nulls(jsonb_build_object(
      'unitCode', v_unit.unit_code,
      'previousCondition', v_unit.spec_overrides->>'condition',
      'newCondition', v_condition,
      'notesChanged', v_notes is not null
    )),
    v_actor
  );

  insert into public.audit_events (actor_type, actor_ref, channel, operation, entity_type, entity_id, before_snapshot, after_snapshot, metadata)
  values (
    'whatsapp_admin', case when v_actor is null then null else v_actor::text end, 'whatsapp', 'inventory.condition_updated',
    'product_unit', v_unit.id,
    jsonb_build_object('condition', v_unit.spec_overrides->>'condition'),
    jsonb_build_object('condition', v_condition, 'notesChanged', v_notes is not null),
    jsonb_build_object('unitCode', v_unit.unit_code)
  );

  perform public.erp_legacy_restore(v_prev);
  return jsonb_build_object('unitId', v_unit.id, 'unitCode', v_unit.unit_code, 'condition', v_condition);
end;
$$;
revoke all on function public.erp_update_unit_condition(uuid, text, text) from public, anon, authenticated;
grant execute on function public.erp_update_unit_condition(uuid, text, text) to authenticated;

comment on function public.erp_update_unit_condition(uuid, text, text) is
  'Fase 3C: condición particular de UNA unidad (spec_overrides.condition + notes). Nunca toca status ni las specs del producto general (products no se modifica).';

-- ============================================================================
-- 5. Resolución de unidad — STU exacto | consecutivo corto | serial exacto | sufijo
-- ============================================================================
-- Único punto de resolución (P20.17B §17): nunca elige arbitrariamente.
-- Exactamente UN identificador por llamada — el agente decide cuál usar según
-- lo que el administrador dijo (P20.17C); esta RPC no interpreta lenguaje.
create or replace function public.erp_resolve_product_unit(
  p_unit_code text default null,
  p_sequence integer default null,
  p_manufacturer_serial text default null,
  p_manufacturer_serial_suffix text default null
)
returns jsonb
language plpgsql
security definer
-- NO se marca `stable`: internamente pasa por erp_legacy_elevate()/restore(),
-- que SÍ escriben profiles.is_admin dentro de la misma transacción (Fase 2D).
-- Marcarla stable sería una promesa falsa aunque el efecto sea transitorio.
set search_path = public, pg_temp
as $$
declare
  v_prev boolean;
  v_code text;
  v_rows jsonb;
  v_count integer;
  v_given integer := 0;
begin
  perform public.erp_assert_permission('inventory.read');
  v_prev := public.erp_legacy_elevate();

  if p_unit_code is not null then v_given := v_given + 1; end if;
  if p_sequence is not null then v_given := v_given + 1; end if;
  if p_manufacturer_serial is not null then v_given := v_given + 1; end if;
  if p_manufacturer_serial_suffix is not null then v_given := v_given + 1; end if;
  if v_given <> 1 then
    perform public.erp_legacy_restore(v_prev);
    raise exception 'exactly_one_identifier_required';
  end if;

  if p_unit_code is not null then
    v_code := upper(btrim(p_unit_code));
    select coalesce(jsonb_agg(jsonb_build_object(
        'unitId', u.id, 'unitCode', u.unit_code, 'status', u.status, 'productId', u.product_id,
        'productTitle', p.title, 'serialNumber', u.serial_number
      )), '[]'::jsonb) into v_rows
    from public.product_units u join public.products p on p.id = u.product_id
    where upper(u.unit_code) = v_code;

  elsif p_sequence is not null then
    if p_sequence < 1 or p_sequence > 999999 then
      perform public.erp_legacy_restore(v_prev);
      raise exception 'sequence_invalid';
    end if;
    v_code := 'STU-' || lpad(p_sequence::text, 6, '0');
    select coalesce(jsonb_agg(jsonb_build_object(
        'unitId', u.id, 'unitCode', u.unit_code, 'status', u.status, 'productId', u.product_id,
        'productTitle', p.title, 'serialNumber', u.serial_number
      )), '[]'::jsonb) into v_rows
    from public.product_units u join public.products p on p.id = u.product_id
    where u.unit_code = v_code;

  elsif p_manufacturer_serial is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
        'unitId', u.id, 'unitCode', u.unit_code, 'status', u.status, 'productId', u.product_id,
        'productTitle', p.title, 'serialNumber', u.serial_number
      )), '[]'::jsonb) into v_rows
    from public.product_units u join public.products p on p.id = u.product_id
    where u.serial_number is not null and lower(btrim(u.serial_number)) = lower(btrim(p_manufacturer_serial));

  else
    if length(btrim(coalesce(p_manufacturer_serial_suffix, ''))) < 3 then
      perform public.erp_legacy_restore(v_prev);
      raise exception 'serial_suffix_too_short';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
        'unitId', u.id, 'unitCode', u.unit_code, 'status', u.status, 'productId', u.product_id,
        'productTitle', p.title, 'serialNumber', u.serial_number
      )), '[]'::jsonb) into v_rows
    from public.product_units u join public.products p on p.id = u.product_id
    where u.serial_number is not null
      and lower(u.serial_number) like '%' || lower(btrim(p_manufacturer_serial_suffix))
    limit 8;
  end if;

  perform public.erp_legacy_restore(v_prev);

  v_count := jsonb_array_length(v_rows);
  if v_count = 0 then return jsonb_build_object('status', 'not_found');
  elsif v_count = 1 then return jsonb_build_object('status', 'resolved', 'unit', v_rows -> 0);
  else return jsonb_build_object('status', 'ambiguous', 'candidates', v_rows);
  end if;
end;
$$;
revoke all on function public.erp_resolve_product_unit(text, integer, text, text) from public, anon, authenticated;
grant execute on function public.erp_resolve_product_unit(text, integer, text, text) to authenticated;

comment on function public.erp_resolve_product_unit(text, integer, text, text) is
  'Fase 3C: resuelve una unidad por STU exacto, consecutivo corto (derivado de unit_code, no hay columna separada), serial de fabricante exacto o sufijo. status resolved|ambiguous|not_found — nunca elige arbitrariamente entre varias.';

-- ============================================================================
-- 6. Catálogo de acciones del agente — se recrea completo con los 6 casos nuevos
-- ============================================================================
-- Se reproduce ENTERO (no se puede "agregar un WHEN" sin recrear la función):
-- todos los casos de Fase 3A.2/3B quedan IDÉNTICOS, solo se agregan al final.
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
    -- ── Fase 3C — P20.17B ──────────────────────────────────────────────
    when 'inventory.receive_units'                 then jsonb_build_object('permission','inventory.manage','risk','sensitive')
    when 'inventory.sequence_status'                then jsonb_build_object('permission','inventory.read','risk','read')
    when 'inventory.assign_manufacturer_serial'     then jsonb_build_object('permission','inventory.manage','risk','write')
    when 'inventory.correct_manufacturer_serial'    then jsonb_build_object('permission','inventory.manage','risk','sensitive')
    when 'inventory.update_unit_condition'          then jsonb_build_object('permission','inventory.manage','risk','write')
    when 'inventory.resolve_unit'                   then jsonb_build_object('permission','inventory.read','risk','read')
    else null
  end;
$$;
revoke all on function public.erp_agent_action_policy(text) from public,anon,authenticated;
grant execute on function public.erp_agent_action_policy(text) to service_role;

-- ============================================================================
-- 7. Dispatcher — se recrea completo con los 6 casos nuevos
-- ============================================================================
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
  -- ── Fase 3C ──────────────────────────────────────────────────────────
  v_serials text[];
  v_units jsonb;
begin
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

    -- ── Fase 3C — P20.17B ────────────────────────────────────────────────
    when 'inventory.receive_units' then
      begin
        v_id := (v_args->>'productId')::uuid;
      exception when others then
        raise exception 'invalid_product_id';
      end;
      if v_args ? 'manufacturerSerials' and jsonb_typeof(v_args->'manufacturerSerials') = 'array' then
        select array_agg(elem) into v_serials from jsonb_array_elements_text(v_args->'manufacturerSerials') as elem;
      else
        v_serials := null;
      end if;
      select coalesce(jsonb_agg(jsonb_build_object('unitId',x.unit_id,'unitCode',x.unit_code)),'[]'::jsonb) into v_units
      from public.erp_receive_units_batch(
        v_id, (v_args->>'quantity')::integer, v_serials,
        coalesce(v_args->'specOverrides','{}'::jsonb), v_args->>'notes'
      ) x;
      v_result:=jsonb_build_object('productId',v_id,'quantity',(v_args->>'quantity')::integer,'units',v_units);

    when 'inventory.sequence_status' then
      v_result:=public.erp_inventory_sequence_status();

    when 'inventory.assign_manufacturer_serial','inventory.correct_manufacturer_serial' then
      -- P20.17B §19: esta acción recibe el identificador YA resuelto (STU
      -- concreto) — la ambigüedad se resuelve ANTES, con 'inventory.resolve_unit'.
      v_id := (public.erp_resolve_product_unit(nullif(v_args->>'unitCode',''),null,null,null)->'unit'->>'unitId')::uuid;
      if v_id is null then raise exception 'unit_not_found'; end if;
      v_result := public.erp_set_manufacturer_serial(v_id, v_args->>'serialNumber');

    when 'inventory.update_unit_condition' then
      v_id := (select (public.erp_resolve_product_unit(nullif(v_args->>'unitCode',''),null,null,null)->'unit'->>'unitId')::uuid);
      if v_id is null then raise exception 'unit_not_found'; end if;
      v_result := public.erp_update_unit_condition(v_id, v_args->>'condition', v_args->>'notes');

    when 'inventory.resolve_unit' then
      v_result := public.erp_resolve_product_unit(
        nullif(v_args->>'unitCode',''),
        (nullif(v_args->>'sequence',''))::integer,
        nullif(v_args->>'manufacturerSerial',''),
        nullif(v_args->>'manufacturerSerialSuffix','')
      );

    else
      raise exception 'erp_agent_unknown_action:%',v_action;
  end case;

  return coalesce(v_result,'{}'::jsonb);
end;$$;
revoke all on function public.erp_agent_dispatch(uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;

-- ============================================================================
-- 8. Verificación esperada en STAGING (no se ejecuta aquí)
-- ============================================================================
--
-- select public.erp_inventory_sequence_status(); -- dos veces seguidas: el
--   segundo lastUsed debe ser IGUAL al primero (no consumió nada).
--
-- select * from public.erp_receive_units_batch('<product_uuid>',3,
--   array['SN-STG-001','SN-STG-002'],'{}'::jsonb,'Lote de prueba staging');
--   -- 3 filas devueltas, 3 unit_code STU-* consecutivos, las 2 primeras con
--   -- serial_number, la 3ra con serial_number null.
--   -- Verificar: 3 product_units nuevas, 3 inventory_movements 'receipt',
--   -- 3 audit_events 'inventory.receive'. products.stock SIN CAMBIOS.
--
-- select public.erp_resolve_product_unit('STU-000001'); -- status=resolved
-- select public.erp_resolve_product_unit(null,1);       -- mismo resultado por consecutivo corto
-- select public.erp_resolve_product_unit(null,null,'SN-STG-001'); -- status=resolved
-- select public.erp_resolve_product_unit(null,null,null,'001');  -- status=ambiguous si hay 2+ con ese sufijo
--
-- select public.erp_set_manufacturer_serial('<unit_uuid>','SN-STG-003');
--   -- primera vez: movement='serial_assigned'. Repetir con el MISMO valor:
--   -- 'changed':false, sin movimiento nuevo. Repetir con OTRO valor:
--   -- movement='serial_corrected', inventory_movements.metadata trae
--   -- oldSerial Y newSerial.
--
-- select public.erp_update_unit_condition('<unit_uuid>','pantalla_regular');
--   -- product_units.spec_overrides->>'condition' = 'pantalla_regular'.
--   -- product_units.status SIN CAMBIOS. products (tabla) SIN CAMBIOS.
--
-- Un usuario authenticated con erp_role que NO tenga 'inventory.manage'
-- (p.ej. 'caja') debe fallar con erp_permission_denied en las 4 escrituras,
-- y poder ejecutar igual las 2 lecturas si tiene 'inventory.read'.
-- anon: 42501 en todo (revoke all ya aplicado).
--
-- Reintento con el MISMO meta_message_id vía erp_agent_submit_request: mismo
-- resultado cacheado, sin segundo lote/segunda asignación (mecanismo ya
-- existente de Fase 3A.2/3B — no se tocó, solo se prueba que sigue aplicando
-- a las acciones nuevas).

-- ============================================================================
-- 9. ROLLBACK manual — NO ejecutar junto con la migración
-- ============================================================================
--
-- -- Restaura erp_agent_action_policy/erp_agent_dispatch a la versión de
-- -- 20260829184500_erp_fase3_whatsapp_control.sql (reejecutar ESE archivo).
--
-- revoke all on function public.erp_resolve_product_unit(text,integer,text,text) from authenticated;
-- drop function if exists public.erp_resolve_product_unit(text,integer,text,text);
-- revoke all on function public.erp_update_unit_condition(uuid,text,text) from authenticated;
-- drop function if exists public.erp_update_unit_condition(uuid,text,text);
-- revoke all on function public.erp_set_manufacturer_serial(uuid,text) from authenticated;
-- drop function if exists public.erp_set_manufacturer_serial(uuid,text);
-- revoke all on function public.erp_inventory_sequence_status() from authenticated;
-- drop function if exists public.erp_inventory_sequence_status();
-- revoke all on function public.erp_receive_units_batch(uuid,integer,text[],jsonb,text) from authenticated;
-- drop function if exists public.erp_receive_units_batch(uuid,integer,text[],jsonb,text);
--
-- alter table public.inventory_movements drop constraint if exists inventory_movements_type_check;
-- alter table public.inventory_movements add constraint inventory_movements_type_check check (movement_type in (
--   'receipt','inspection','available','reserve','release_reservation','sale','return',
--   'warranty_in','warranty_out','repair_in','repair_out','adjustment','retire'
-- ));
-- -- Solo revertir el CHECK si NINGUNA fila usa ya serial_assigned/serial_corrected/
-- -- condition_updated — si las hay, el rollback del CHECK fallaría (y eso es
-- -- correcto: no se puede perder el registro de un hecho ya ocurrido).
