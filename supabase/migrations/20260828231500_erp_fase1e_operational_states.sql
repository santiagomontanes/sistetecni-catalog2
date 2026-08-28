-- SISTETECNI ERP — Fase 1E
-- Reservas y transiciones operativas controladas por unidad física.
--
-- Objetivos:
-- - reservar una unidad available sin crear una venta;
-- - liberar reservas y manejar inspección/reparación/garantía/devolución/retiro;
-- - impedir saltos de estado arbitrarios;
-- - registrar cada transición en inventory_movements + audit_events;
-- - mantener sold como consecuencia del flujo de Ventas, nunca de un botón genérico;
-- - permitir que una venta consuma atómicamente una unidad available O reserved;
-- - aprovechar Fase 1D: todo cambio de status recalcula products.stock cuando ERP está activo.
--
-- Dependencias:
--   20260827183000_erp_core_fase1a.sql
--   20260828130000_erp_fase1c_sale_by_unit.sql
--   20260828193000_erp_fase1d_stock_sync.sql

-- ============================================================================
-- 1. Metadatos de la reserva vigente
-- ============================================================================

alter table public.product_units
  add column if not exists reserved_at timestamptz,
  add column if not exists reservation_expires_at timestamptz,
  add column if not exists reservation_customer_name text,
  add column if not exists reservation_customer_phone text,
  add column if not exists reservation_note text;

comment on column public.product_units.reserved_at is
  'Inicio de la reserva vigente. Se limpia cuando la unidad deja status=reserved; el historial permanece en inventory_movements.';
comment on column public.product_units.reservation_expires_at is
  'Vencimiento informativo de la reserva vigente. Fase 1E no libera automáticamente: el admin decide liberar o vender.';
comment on column public.product_units.reservation_customer_name is
  'Nombre del cliente asociado a la reserva vigente; no sustituye customers ni constituye una venta.';
comment on column public.product_units.reservation_customer_phone is
  'Teléfono opcional de la reserva vigente.';
comment on column public.product_units.reservation_note is
  'Nota operativa opcional de la reserva vigente.';

create index if not exists idx_product_units_reserved_expires
  on public.product_units (reservation_expires_at)
  where status = 'reserved' and reservation_expires_at is not null;

-- ============================================================================
-- 2. Transición operativa única
-- ============================================================================

create or replace function public.erp_transition_product_unit(
  p_unit_id uuid,
  p_to_status text,
  p_reason text default null,
  p_reservation_customer_name text default null,
  p_reservation_customer_phone text default null,
  p_reservation_expires_at timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_unit public.product_units%rowtype;
  v_from text;
  v_to text := lower(btrim(coalesce(p_to_status, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_res_name text := nullif(btrim(coalesce(p_reservation_customer_name, '')), '');
  v_res_phone text := nullif(btrim(coalesce(p_reservation_customer_phone, '')), '');
  v_movement text;
  v_allowed boolean := false;
  v_before_reservation jsonb;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p where p.id = v_actor and p.is_admin = true
  ) then
    raise exception 'erp_admin_required' using errcode = '42501';
  end if;

  if v_to not in ('received','inspection','available','reserved','sold','warranty','repair','returned','retired') then
    raise exception 'invalid_target_status';
  end if;

  select * into v_unit
  from public.product_units
  where id = p_unit_id
  for update;

  if not found then
    raise exception 'unit_not_found';
  end if;

  v_from := v_unit.status;

  if v_from = v_to then
    return v_unit.id;
  end if;

  -- Matriz explícita. sold NO se admite desde available/reserved aquí:
  -- una venta real debe pasar por erp_create_sale_with_units.
  v_allowed :=
       (v_from = 'received'   and v_to in ('inspection','available','retired'))
    or (v_from = 'inspection' and v_to in ('available','repair','retired'))
    or (v_from = 'available'  and v_to in ('reserved','repair','retired'))
    or (v_from = 'reserved'   and v_to in ('available','repair','retired'))
    or (v_from = 'sold'       and v_to in ('warranty','returned'))
    or (v_from = 'warranty'   and v_to in ('repair','sold','retired'))
    or (v_from = 'repair'     and v_to in ('available','sold','retired'))
    or (v_from = 'returned'   and v_to in ('repair','retired'));

  if not v_allowed then
    raise exception 'invalid_status_transition:%->%', v_from, v_to;
  end if;

  -- Solo una unidad que ya fue vendida puede volver de garantía/reparación a
  -- sold. Así una reparación pre-venta nunca puede convertirse en venta falsa.
  if v_to = 'sold' and v_unit.sold_at is null then
    raise exception 'sold_transition_requires_prior_sale';
  end if;

  if v_to = 'reserved' then
    if v_res_name is null or length(v_res_name) < 2 then
      raise exception 'reservation_customer_name_required';
    end if;
    if p_reservation_expires_at is not null and p_reservation_expires_at <= now() then
      raise exception 'reservation_expiry_must_be_future';
    end if;
  elsif p_reservation_customer_name is not null
     or p_reservation_customer_phone is not null
     or p_reservation_expires_at is not null then
    raise exception 'reservation_fields_only_for_reserved';
  end if;

  if v_to in ('repair','warranty','returned','retired') and v_reason is null then
    raise exception 'reason_required_for_status:%', v_to;
  end if;

  v_before_reservation := jsonb_strip_nulls(jsonb_build_object(
    'reservedAt', v_unit.reserved_at,
    'expiresAt', v_unit.reservation_expires_at,
    'customerName', v_unit.reservation_customer_name,
    'customerPhone', v_unit.reservation_customer_phone,
    'note', v_unit.reservation_note
  ));

  v_movement := case
    when v_from = 'available' and v_to = 'reserved' then 'reserve'
    when v_from = 'reserved' and v_to = 'available' then 'release_reservation'
    when v_to = 'inspection' then 'inspection'
    when v_from = 'repair' and v_to in ('available','sold') then 'repair_out'
    when v_to = 'available' then 'available'
    when v_to = 'repair' then 'repair_in'
    when v_from = 'sold' and v_to = 'warranty' then 'warranty_in'
    when v_from = 'warranty' and v_to = 'sold' then 'warranty_out'
    when v_from = 'sold' and v_to = 'returned' then 'return'
    when v_to = 'retired' then 'retire'
    else 'adjustment'
  end;

  if v_to = 'reserved' then
    update public.product_units
    set status = 'reserved',
        reserved_at = now(),
        reservation_expires_at = p_reservation_expires_at,
        reservation_customer_name = v_res_name,
        reservation_customer_phone = v_res_phone,
        reservation_note = v_reason
    where id = v_unit.id;
  else
    update public.product_units
    set status = v_to,
        reserved_at = null,
        reservation_expires_at = null,
        reservation_customer_name = null,
        reservation_customer_phone = null,
        reservation_note = null
    where id = v_unit.id;
  end if;

  insert into public.inventory_movements (
    unit_id, product_id, movement_type, from_status, to_status,
    reason, source, actor_ref, metadata, created_by
  ) values (
    v_unit.id, v_unit.product_id, v_movement, v_from, v_to,
    v_reason, 'web_admin', v_actor::text,
    jsonb_strip_nulls(jsonb_build_object(
      'unitCode', v_unit.unit_code,
      'reservationBefore', case when v_from = 'reserved' then v_before_reservation else null end,
      'reservationAfter', case when v_to = 'reserved' then jsonb_strip_nulls(jsonb_build_object(
        'customerName', v_res_name,
        'customerPhone', v_res_phone,
        'expiresAt', p_reservation_expires_at,
        'note', v_reason
      )) else null end
    )),
    v_actor
  );

  insert into public.audit_events (
    actor_type, actor_ref, channel, operation, entity_type, entity_id,
    before_snapshot, after_snapshot, metadata
  ) values (
    'web_admin', v_actor::text, 'web', 'inventory.transition',
    'product_unit', v_unit.id,
    jsonb_strip_nulls(jsonb_build_object(
      'status', v_from,
      'unitCode', v_unit.unit_code,
      'reservation', case when v_from = 'reserved' then v_before_reservation else null end
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'status', v_to,
      'unitCode', v_unit.unit_code,
      'reservation', case when v_to = 'reserved' then jsonb_strip_nulls(jsonb_build_object(
        'customerName', v_res_name,
        'customerPhone', v_res_phone,
        'expiresAt', p_reservation_expires_at,
        'note', v_reason
      )) else null end
    )),
    jsonb_build_object('movementType', v_movement, 'source', 'admin_panel')
  );

  return v_unit.id;
end;
$$;

revoke all on function public.erp_transition_product_unit(uuid,text,text,text,text,timestamptz) from public;
grant execute on function public.erp_transition_product_unit(uuid,text,text,text,text,timestamptz) to authenticated;

comment on function public.erp_transition_product_unit(uuid,text,text,text,text,timestamptz) is
  'Fase 1E: transición operativa atómica con matriz de estados, movimiento y auditoría. Nunca crea una venta.';

-- ============================================================================
-- 3. Venta 1C actualizada: available O reserved -> sold
-- ============================================================================
-- La función conserva el mismo contrato para no romper SalesRepository.
-- Al consumir una reserva, guarda sus datos en metadata del movimiento y limpia
-- los campos de reserva. El UNIQUE de sale_items + FOR UPDATE siguen impidiendo
-- doble venta concurrente.

create or replace function public.erp_create_sale_with_units(
  p_customer_id uuid,
  p_customer_name text,
  p_customer_document text,
  p_customer_phone text,
  p_customer_email text,
  p_items jsonb,
  p_discount_cop bigint,
  p_payment_method text,
  p_payment_status text,
  p_warranty_months integer,
  p_notes text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_existing_sale_id uuid;
  v_sale_id uuid;
  v_item jsonb;
  v_item_type text;
  v_product_id uuid;
  v_unit_id uuid;
  v_description text;
  v_unit_price bigint;
  v_quantity integer;
  v_subtotal bigint := 0;
  v_item_subtotal bigint;
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
  v_customer public.customers%rowtype;
  v_customer_name text := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_customer_document text := nullif(btrim(coalesce(p_customer_document, '')), '');
  v_customer_phone text := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_customer_email text := nullif(btrim(coalesce(p_customer_email, '')), '');
  v_sort_order integer := 0;
  v_from_status text;
  v_reservation_meta jsonb;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p where p.id = v_actor and p.is_admin = true
  ) then
    raise exception 'erp_admin_required' using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'idempotency_key_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));

  select s.id into v_existing_sale_id
  from public.sales s
  where s.idempotency_key = p_idempotency_key;

  if v_existing_sale_id is not null then
    return v_existing_sale_id;
  end if;

  if p_customer_id is not null then
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

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'sale_items_required';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'too_many_sale_items';
  end if;

  if (
    select count(*) from jsonb_array_elements(p_items) x where x->>'itemType' = 'catalog'
  ) <> (
    select count(distinct (x->>'productUnitId')) from jsonb_array_elements(p_items) x where x->>'itemType' = 'catalog'
  ) then
    raise exception 'duplicate_product_unit_in_sale';
  end if;

  perform u.id
  from public.product_units u
  where u.id in (
    select (x->>'productUnitId')::uuid
    from jsonb_array_elements(p_items) x
    where x->>'itemType' = 'catalog'
  )
  order by u.id
  for update;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_type := v_item->>'itemType';
    v_unit_price := nullif(v_item->>'unitPriceCop', '')::bigint;
    v_quantity := nullif(v_item->>'quantity', '')::integer;

    if v_unit_price is null or v_unit_price < 0 then raise exception 'invalid_unit_price'; end if;
    if v_quantity is null or v_quantity < 1 then raise exception 'invalid_quantity'; end if;

    if v_item_type = 'catalog' then
      v_product_id := (v_item->>'productId')::uuid;
      v_unit_id := (v_item->>'productUnitId')::uuid;
      if v_quantity <> 1 then raise exception 'catalog_physical_unit_quantity_must_be_one'; end if;

      select * into v_product from public.products where id = v_product_id;
      if not found then raise exception 'product_not_found'; end if;

      select * into v_unit from public.product_units where id = v_unit_id;
      if not found then raise exception 'unit_not_found'; end if;
      if v_unit.product_id <> v_product_id then raise exception 'unit_product_mismatch'; end if;
      if v_unit.status not in ('available','reserved') then
        raise exception 'unit_not_available:%', v_unit.status;
      end if;
    elsif v_item_type = 'manual' then
      v_description := nullif(btrim(coalesce(v_item->>'description', '')), '');
      if v_description is null then raise exception 'manual_description_required'; end if;
    else
      raise exception 'invalid_item_type';
    end if;

    v_item_subtotal := v_unit_price * v_quantity;
    v_subtotal := v_subtotal + v_item_subtotal;
  end loop;

  if p_discount_cop is null or p_discount_cop < 0 or p_discount_cop > v_subtotal then
    raise exception 'invalid_discount';
  end if;

  insert into public.sales (
    customer_id, customer_name, customer_document, customer_phone, customer_email,
    subtotal_cop, discount_cop, total_cop, payment_method, payment_status,
    warranty_months, notes, idempotency_key, created_by
  ) values (
    p_customer_id, v_customer_name, v_customer_document, v_customer_phone, v_customer_email,
    v_subtotal, p_discount_cop, v_subtotal - p_discount_cop, p_payment_method, p_payment_status,
    p_warranty_months, nullif(btrim(coalesce(p_notes, '')), ''), p_idempotency_key, v_actor
  ) returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_type := v_item->>'itemType';
    v_unit_price := (v_item->>'unitPriceCop')::bigint;
    v_quantity := (v_item->>'quantity')::integer;
    v_item_subtotal := v_unit_price * v_quantity;

    if v_item_type = 'catalog' then
      v_product_id := (v_item->>'productId')::uuid;
      v_unit_id := (v_item->>'productUnitId')::uuid;
      v_description := nullif(btrim(coalesce(v_item->>'description', '')), '');

      select * into v_product from public.products where id = v_product_id;
      select * into v_unit from public.product_units where id = v_unit_id;
      v_from_status := v_unit.status;
      v_reservation_meta := case when v_unit.status = 'reserved' then jsonb_strip_nulls(jsonb_build_object(
        'reservedAt', v_unit.reserved_at,
        'expiresAt', v_unit.reservation_expires_at,
        'customerName', v_unit.reservation_customer_name,
        'customerPhone', v_unit.reservation_customer_phone,
        'note', v_unit.reservation_note
      )) else null end;

      insert into public.sale_items (
        sale_id, item_type, product_id, product_unit_id,
        unit_code_snapshot, serial_number_snapshot, unit_spec_overrides_snapshot,
        product_name, product_description, product_image, product_specs,
        original_unit_price_cop, unit_price_cop, quantity, subtotal_cop, sort_order
      ) values (
        v_sale_id, 'catalog', v_product.id, v_unit.id,
        v_unit.unit_code, v_unit.serial_number, v_unit.spec_overrides,
        v_product.title,
        coalesce(v_description, concat_ws(' / ',
          nullif(v_product.cpu, ''),
          case when v_product.ram is not null then v_product.ram::text || ' GB RAM' else null end,
          nullif(v_product.storage, '')
        )),
        case when coalesce(array_length(v_product.images, 1), 0) > 0 then v_product.images[1] else null end,
        jsonb_strip_nulls(jsonb_build_object(
          'brand', nullif(v_product.brand, ''), 'model', nullif(v_product.model, ''),
          'cpu', nullif(v_product.cpu, ''), 'ram', v_product.ram,
          'storage', nullif(v_product.storage, ''), 'screen', nullif(v_product.screen, ''),
          'condition', nullif(v_product.condition, '')
        )),
        round(v_product.price)::bigint, v_unit_price, 1, v_item_subtotal, v_sort_order
      );

      update public.product_units
      set status = 'sold',
          sold_at = coalesce(sold_at, now()),
          reserved_at = null,
          reservation_expires_at = null,
          reservation_customer_name = null,
          reservation_customer_phone = null,
          reservation_note = null
      where id = v_unit.id;

      insert into public.inventory_movements (
        unit_id, product_id, movement_type, from_status, to_status,
        reference_type, reference_id, reason, source, actor_ref, metadata, created_by
      ) values (
        v_unit.id, v_product.id, 'sale', v_from_status, 'sold',
        'sale', v_sale_id, 'Venta desde panel ERP', 'web_admin', v_actor::text,
        jsonb_strip_nulls(jsonb_build_object(
          'saleId', v_sale_id, 'unitCode', v_unit.unit_code,
          'serialPresent', v_unit.serial_number is not null,
          'consumedReservation', v_reservation_meta
        )),
        v_actor
      );

      insert into public.audit_events (
        actor_type, actor_ref, channel, operation, entity_type, entity_id,
        before_snapshot, after_snapshot, metadata
      ) values (
        'web_admin', v_actor::text, 'web', 'inventory.sell', 'product_unit', v_unit.id,
        jsonb_strip_nulls(jsonb_build_object(
          'status', v_from_status, 'unitCode', v_unit.unit_code,
          'reservation', v_reservation_meta
        )),
        jsonb_build_object('status', 'sold', 'unitCode', v_unit.unit_code, 'saleId', v_sale_id),
        jsonb_build_object('saleId', v_sale_id, 'source', 'admin_panel')
      );
    else
      v_description := btrim(v_item->>'description');
      insert into public.sale_items (
        sale_id, item_type, product_id, product_unit_id,
        product_name, product_description, product_image, product_specs,
        original_unit_price_cop, unit_price_cop, quantity, subtotal_cop, sort_order
      ) values (
        v_sale_id, 'manual', null, null,
        v_description, null, null, null,
        null, v_unit_price, v_quantity, v_item_subtotal, v_sort_order
      );
    end if;

    v_sort_order := v_sort_order + 1;
  end loop;

  insert into public.audit_events (
    actor_type, actor_ref, channel, operation, entity_type, entity_id,
    after_snapshot, metadata
  ) values (
    'web_admin', v_actor::text, 'web', 'sale.create', 'sale', v_sale_id,
    jsonb_build_object(
      'saleId', v_sale_id, 'customerId', p_customer_id,
      'subtotalCop', v_subtotal, 'discountCop', p_discount_cop,
      'totalCop', v_subtotal - p_discount_cop,
      'paymentMethod', p_payment_method, 'paymentStatus', p_payment_status
    ),
    jsonb_build_object('source', 'admin_panel', 'physicalInventory', true)
  );

  return v_sale_id;
end;
$$;

revoke all on function public.erp_create_sale_with_units(uuid,text,text,text,text,jsonb,bigint,text,text,integer,text,uuid) from public;
grant execute on function public.erp_create_sale_with_units(uuid,text,text,text,text,jsonb,bigint,text,text,integer,text,uuid) to authenticated;

comment on function public.erp_create_sale_with_units(uuid,text,text,text,text,jsonb,bigint,text,text,integer,text,uuid) is
  'Fase 1E: venta 1C ampliada para consumir atómicamente unidades available o reserved; la reserva queda en el historial y se limpia al vender.';

-- ============================================================================
-- 4. Invariantes
-- ============================================================================
-- - available -> reserved reduce stock ERP vía trigger 1D;
-- - reserved -> available aumenta stock ERP vía trigger 1D;
-- - reserved -> sold ocurre SOLO dentro de una venta real;
-- - no existe transición genérica available/reserved -> sold;
-- - repair -> sold exige sold_at previo (retorno al dueño, no nueva venta);
-- - una reserva vencida no se libera sola: sigue bloqueada hasta acción admin;
-- - metadata de la reserva consumida/liberada queda en inventory_movements/audit;
-- - ninguna transición modifica sales/sale_items salvo la venta real.
