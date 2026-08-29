-- SISTETECNI ERP — Fase 1B
-- Operaciones atómicas para el panel visual: crear cliente y recibir computador.
--
-- Esta migración depende de:
--   20260827183000_erp_core_fase1a.sql
--
-- IMPORTANTE:
-- - NO modifica products.stock todavía.
-- - NO modifica sales/sale_items.
-- - NO habilita acceso público.
-- - Cada mutación deja audit_event; la recepción deja además inventory_movement.

-- ============================================================================
-- 1. Secuencia interna para códigos legibles de unidad física
-- ============================================================================

create sequence if not exists public.product_unit_code_seq start with 1 increment by 1;

comment on sequence public.product_unit_code_seq is
  'Secuencia ERP para generar códigos internos STU-000001, STU-000002, etc. No representa stock.';

-- El RPC es SECURITY INVOKER y las tablas siguen protegidas por RLS. Se concede
-- uso de la secuencia a authenticated únicamente para que un admin autenticado
-- pueda ejecutar la recepción; un no-admin seguirá fallando al insertar por RLS.
grant usage, select on sequence public.product_unit_code_seq to authenticated;

-- ============================================================================
-- 2. Crear cliente + auditoría en una sola transacción
-- ============================================================================

create or replace function public.erp_create_customer(
  p_full_name text,
  p_document_type text default null,
  p_document_number text default null,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_city text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
  v_actor uuid := auth.uid();
begin
  if p_full_name is null or length(btrim(p_full_name)) = 0 then
    raise exception 'customer_full_name_required';
  end if;

  insert into public.customers (
    full_name,
    document_type,
    document_number,
    phone,
    email,
    address,
    city,
    notes,
    created_by
  ) values (
    btrim(p_full_name),
    nullif(btrim(coalesce(p_document_type, '')), ''),
    nullif(btrim(coalesce(p_document_number, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_actor
  )
  returning id into v_customer_id;

  insert into public.audit_events (
    actor_type,
    actor_ref,
    channel,
    operation,
    entity_type,
    entity_id,
    after_snapshot,
    metadata
  ) values (
    'web_admin',
    case when v_actor is null then null else v_actor::text end,
    'web',
    'customer.create',
    'customer',
    v_customer_id,
    jsonb_build_object(
      'id', v_customer_id,
      'fullName', btrim(p_full_name),
      'documentType', nullif(btrim(coalesce(p_document_type, '')), ''),
      'documentNumber', nullif(btrim(coalesce(p_document_number, '')), ''),
      'phonePresent', nullif(btrim(coalesce(p_phone, '')), '') is not null,
      'emailPresent', nullif(btrim(coalesce(p_email, '')), '') is not null,
      'city', nullif(btrim(coalesce(p_city, '')), '')
    ),
    jsonb_build_object('source', 'admin_panel')
  );

  return v_customer_id;
end;
$$;

grant execute on function public.erp_create_customer(text,text,text,text,text,text,text,text) to authenticated;

comment on function public.erp_create_customer(text,text,text,text,text,text,text,text) is
  'Fase 1B: crea cliente y audit_event atómicamente. SECURITY INVOKER: RLS exige admin.';

-- ============================================================================
-- 3. Recibir unidad física + movimiento + auditoría en una sola transacción
-- ============================================================================

create or replace function public.erp_receive_product_unit(
  p_product_id uuid,
  p_serial_number text default null,
  p_acquisition_cost_cop bigint default null,
  p_battery_health_percent integer default null,
  p_storage_health_percent integer default null,
  p_spec_overrides jsonb default '{}'::jsonb,
  p_notes text default null
)
returns table(unit_id uuid, unit_code text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_unit_id uuid;
  v_unit_code text;
  v_actor uuid := auth.uid();
  v_specs jsonb := coalesce(p_spec_overrides, '{}'::jsonb);
begin
  if p_product_id is null then
    raise exception 'product_id_required';
  end if;

  if jsonb_typeof(v_specs) <> 'object' then
    raise exception 'spec_overrides_must_be_object';
  end if;

  if p_acquisition_cost_cop is not null and p_acquisition_cost_cop < 0 then
    raise exception 'acquisition_cost_invalid';
  end if;

  if p_battery_health_percent is not null and (p_battery_health_percent < 0 or p_battery_health_percent > 100) then
    raise exception 'battery_health_invalid';
  end if;

  if p_storage_health_percent is not null and (p_storage_health_percent < 0 or p_storage_health_percent > 100) then
    raise exception 'storage_health_invalid';
  end if;

  -- FK product_units_product_id_fkey garantiza que el producto exista.
  v_unit_code := 'STU-' || lpad(nextval('public.product_unit_code_seq')::text, 6, '0');

  insert into public.product_units (
    product_id,
    unit_code,
    serial_number,
    status,
    acquisition_cost_cop,
    battery_health_percent,
    storage_health_percent,
    spec_overrides,
    notes,
    created_by
  ) values (
    p_product_id,
    v_unit_code,
    nullif(btrim(coalesce(p_serial_number, '')), ''),
    'received',
    p_acquisition_cost_cop,
    p_battery_health_percent,
    p_storage_health_percent,
    v_specs,
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_actor
  )
  returning id into v_unit_id;

  insert into public.inventory_movements (
    unit_id,
    product_id,
    movement_type,
    from_status,
    to_status,
    reason,
    source,
    actor_ref,
    metadata,
    created_by
  ) values (
    v_unit_id,
    p_product_id,
    'receipt',
    null,
    'received',
    'Recepción desde panel ERP',
    'web_admin',
    case when v_actor is null then null else v_actor::text end,
    jsonb_build_object('unitCode', v_unit_code),
    v_actor
  );

  insert into public.audit_events (
    actor_type,
    actor_ref,
    channel,
    operation,
    entity_type,
    entity_id,
    after_snapshot,
    metadata
  ) values (
    'web_admin',
    case when v_actor is null then null else v_actor::text end,
    'web',
    'inventory.receive',
    'product_unit',
    v_unit_id,
    jsonb_build_object(
      'id', v_unit_id,
      'unitCode', v_unit_code,
      'productId', p_product_id,
      'serialPresent', nullif(btrim(coalesce(p_serial_number, '')), '') is not null,
      'status', 'received',
      'acquisitionCostCop', p_acquisition_cost_cop,
      'batteryHealthPercent', p_battery_health_percent,
      'storageHealthPercent', p_storage_health_percent,
      'specOverrides', v_specs
    ),
    jsonb_build_object('source', 'admin_panel')
  );

  return query select v_unit_id, v_unit_code;
end;
$$;

grant execute on function public.erp_receive_product_unit(uuid,text,bigint,integer,integer,jsonb,text) to authenticated;

comment on function public.erp_receive_product_unit(uuid,text,bigint,integer,integer,jsonb,text) is
  'Fase 1B: recibe una máquina física y crea product_unit + receipt movement + audit_event atómicamente. No toca products.stock.';

-- ============================================================================
-- 4. Verificación esperada en STAGING
-- ============================================================================
--
-- Admin autenticado:
-- select public.erp_create_customer('Cliente prueba', 'CC', 'STG-ERP-001', '3000000000', null, null, 'Bogotá', null);
-- select * from public.erp_receive_product_unit(<product_uuid>, 'STG-SERIAL-001', 400000, 90, 95, '{"ramGb":8,"storageGb":256,"storageType":"SSD"}', 'Prueba staging');
--
-- Verificar que por cada recepción existan exactamente:
-- - 1 product_units
-- - 1 inventory_movements movement_type='receipt'
-- - 1 audit_events operation='inventory.receive'
--
-- Verificar que products.stock NO haya cambiado.
--
-- Un usuario authenticated no-admin debe fallar por RLS.
-- anon no tiene EXECUTE ni acceso a tablas ERP.
