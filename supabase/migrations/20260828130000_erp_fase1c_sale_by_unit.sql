-- SISTETECNI ERP — Fase 1C
-- Venta transaccional por unidad física / serial.
--
-- Objetivos:
-- - enlazar cada computador de una venta a product_units;
-- - impedir doble venta concurrente de la misma unidad;
-- - cambiar available -> sold y fijar sold_at en la MISMA transacción de la venta;
-- - registrar inventory_movement + audit_event;
-- - enlazar opcionalmente la venta con customers sin perder el snapshot histórico;
-- - mantener products.stock SIN cambios en esta fase.
--
-- Dependencias:
--   20260826000000_ventas_comprobantes.sql
--   20260827183000_erp_core_fase1a.sql
--   20260827204500_erp_fase1b_admin_operations.sql

-- ============================================================================
-- 1. Enlaces históricos venta -> cliente / unidad física
-- ============================================================================

alter table public.sales
  add column if not exists customer_id uuid;

alter table public.sale_items
  add column if not exists product_unit_id uuid,
  add column if not exists unit_code_snapshot text,
  add column if not exists serial_number_snapshot text,
  add column if not exists unit_spec_overrides_snapshot jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_customer_id_fkey'
      and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_customer_id_fkey
      foreign key (customer_id) references public.customers(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sale_items_product_unit_id_fkey'
      and conrelid = 'public.sale_items'::regclass
  ) then
    alter table public.sale_items
      add constraint sale_items_product_unit_id_fkey
      foreign key (product_unit_id) references public.product_units(id) on delete set null;
  end if;
end
$$;

create index if not exists idx_sales_customer_id
  on public.sales (customer_id);

create index if not exists idx_sale_items_product_unit_id
  on public.sale_items (product_unit_id);

-- Defensa adicional: una unidad física solo puede quedar asociada a UN ítem de
-- venta. El estado sold también lo impide, pero esta UNIQUE hace imposible una
-- segunda asociación incluso ante un bug futuro.
create unique index if not exists uq_sale_items_product_unit_once
  on public.sale_items (product_unit_id)
  where product_unit_id is not null;

comment on column public.sales.customer_id is
  'Cliente canónico opcional del ERP. Los campos customer_* siguen siendo el snapshot histórico del comprobante.';
comment on column public.sale_items.product_unit_id is
  'Unidad física entregada en este ítem. Null en ventas históricas y productos manuales.';
comment on column public.sale_items.unit_code_snapshot is
  'Código STU-* congelado al vender. Sobrevive aunque el vínculo vivo se pierda en el futuro.';
comment on column public.sale_items.serial_number_snapshot is
  'Serial del fabricante congelado al vender. Puede ser null si la unidad se recibió sin serial.';
comment on column public.sale_items.unit_spec_overrides_snapshot is
  'Snapshot de diferencias verificadas de la unidad física (RAM/SSD/estado, etc.) al momento de la venta.';

-- ============================================================================
-- 2. Transición controlada received/inspection -> available
-- ============================================================================

create or replace function public.erp_mark_unit_available(p_unit_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_unit public.product_units%rowtype;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p where p.id = v_actor and p.is_admin = true
  ) then
    raise exception 'erp_admin_required' using errcode = '42501';
  end if;

  select * into v_unit
  from public.product_units
  where id = p_unit_id
  for update;

  if not found then
    raise exception 'unit_not_found';
  end if;

  -- Idempotente para doble clic: si ya está disponible, no crea otro movimiento.
  if v_unit.status = 'available' then
    return v_unit.id;
  end if;

  if v_unit.status not in ('received', 'inspection') then
    raise exception 'invalid_status_transition:%->available', v_unit.status;
  end if;

  update public.product_units
  set status = 'available'
  where id = v_unit.id;

  insert into public.inventory_movements (
    unit_id, product_id, movement_type, from_status, to_status,
    reason, source, actor_ref, metadata, created_by
  ) values (
    v_unit.id, v_unit.product_id, 'available', v_unit.status, 'available',
    'Unidad habilitada para venta desde panel ERP',
    'web_admin', v_actor::text,
    jsonb_build_object('unitCode', v_unit.unit_code),
    v_actor
  );

  insert into public.audit_events (
    actor_type, actor_ref, channel, operation, entity_type, entity_id,
    before_snapshot, after_snapshot, metadata
  ) values (
    'web_admin', v_actor::text, 'web', 'inventory.mark_available',
    'product_unit', v_unit.id,
    jsonb_build_object('status', v_unit.status, 'unitCode', v_unit.unit_code),
    jsonb_build_object('status', 'available', 'unitCode', v_unit.unit_code),
    jsonb_build_object('source', 'admin_panel')
  );

  return v_unit.id;
end;
$$;

grant execute on function public.erp_mark_unit_available(uuid) to authenticated;

comment on function public.erp_mark_unit_available(uuid) is
  'Fase 1C: transición atómica received/inspection -> available con movimiento y auditoría. No toca products.stock.';

-- ============================================================================
-- 3. Venta por unidades físicas — transacción única
-- ============================================================================
--
-- p_items es un array JSON construido únicamente por la Server Action admin.
-- Formas admitidas:
-- catalog:
-- {
--   "itemType":"catalog",
--   "productId":"uuid",
--   "productUnitId":"uuid",
--   "description":"texto opcional",
--   "unitPriceCop":650000,
--   "quantity":1
-- }
-- manual:
-- {
--   "itemType":"manual",
--   "description":"Mouse",
--   "unitPriceCop":30000,
--   "quantity":1
-- }
--
-- El navegador nunca llama este RPC directamente en el flujo de la app: pasa
-- por requireAdmin() y createSaleAdmin. Aun así, la función vuelve a validar
-- admin, estados, producto/unidad, precios y cantidades porque la garantía de
-- concurrencia debe vivir en la base.

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
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p where p.id = v_actor and p.is_admin = true
  ) then
    raise exception 'erp_admin_required' using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'idempotency_key_required';
  end if;

  -- Serializa exclusivamente los reintentos de la MISMA venta. Esto evita que
  -- un segundo submit con la misma key llegue a competir por la unidad después
  -- de que el primero ya la marcó sold.
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

    -- El comprobante guarda snapshot; si hay cliente canónico se toma como
    -- autoridad para evitar que customer_id y snapshot se contradigan.
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

  -- No permitir repetir la misma unidad dos veces dentro de la misma venta.
  if (
    select count(*)
    from jsonb_array_elements(p_items) x
    where x->>'itemType' = 'catalog'
  ) <> (
    select count(distinct (x->>'productUnitId'))
    from jsonb_array_elements(p_items) x
    where x->>'itemType' = 'catalog'
  ) then
    raise exception 'duplicate_product_unit_in_sale';
  end if;

  -- Bloqueo determinista por UUID para evitar deadlocks cuando una venta tiene
  -- varias unidades y dos transacciones intentan tomarlas en orden distinto.
  perform u.id
  from public.product_units u
  where u.id in (
    select (x->>'productUnitId')::uuid
    from jsonb_array_elements(p_items) x
    where x->>'itemType' = 'catalog'
  )
  order by u.id
  for update;

  -- Primera pasada: validar TODO y calcular total antes de escribir la venta.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_type := v_item->>'itemType';
    v_unit_price := nullif(v_item->>'unitPriceCop', '')::bigint;
    v_quantity := nullif(v_item->>'quantity', '')::integer;

    if v_unit_price is null or v_unit_price < 0 then
      raise exception 'invalid_unit_price';
    end if;
    if v_quantity is null or v_quantity < 1 then
      raise exception 'invalid_quantity';
    end if;

    if v_item_type = 'catalog' then
      v_product_id := (v_item->>'productId')::uuid;
      v_unit_id := (v_item->>'productUnitId')::uuid;

      if v_quantity <> 1 then
        raise exception 'catalog_physical_unit_quantity_must_be_one';
      end if;

      select * into v_product from public.products where id = v_product_id;
      if not found then
        raise exception 'product_not_found';
      end if;

      select * into v_unit from public.product_units where id = v_unit_id;
      if not found then
        raise exception 'unit_not_found';
      end if;

      if v_unit.product_id <> v_product_id then
        raise exception 'unit_product_mismatch';
      end if;

      if v_unit.status <> 'available' then
        raise exception 'unit_not_available:%', v_unit.status;
      end if;
    elsif v_item_type = 'manual' then
      v_description := nullif(btrim(coalesce(v_item->>'description', '')), '');
      if v_description is null then
        raise exception 'manual_description_required';
      end if;
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
    customer_id,
    customer_name,
    customer_document,
    customer_phone,
    customer_email,
    subtotal_cop,
    discount_cop,
    total_cop,
    payment_method,
    payment_status,
    warranty_months,
    notes,
    idempotency_key,
    created_by
  ) values (
    p_customer_id,
    v_customer_name,
    v_customer_document,
    v_customer_phone,
    v_customer_email,
    v_subtotal,
    p_discount_cop,
    v_subtotal - p_discount_cop,
    p_payment_method,
    p_payment_status,
    p_warranty_months,
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_idempotency_key,
    v_actor
  )
  returning id into v_sale_id;

  -- Segunda pasada: insertar snapshots y consumir físicamente las unidades.
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

      insert into public.sale_items (
        sale_id,
        item_type,
        product_id,
        product_unit_id,
        unit_code_snapshot,
        serial_number_snapshot,
        unit_spec_overrides_snapshot,
        product_name,
        product_description,
        product_image,
        product_specs,
        original_unit_price_cop,
        unit_price_cop,
        quantity,
        subtotal_cop,
        sort_order
      ) values (
        v_sale_id,
        'catalog',
        v_product.id,
        v_unit.id,
        v_unit.unit_code,
        v_unit.serial_number,
        v_unit.spec_overrides,
        v_product.title,
        coalesce(v_description,
          concat_ws(' / ',
            nullif(v_product.cpu, ''),
            case when v_product.ram is not null then v_product.ram::text || ' GB RAM' else null end,
            nullif(v_product.storage, '')
          )
        ),
        case when coalesce(array_length(v_product.images, 1), 0) > 0 then v_product.images[1] else null end,
        jsonb_strip_nulls(jsonb_build_object(
          'brand', nullif(v_product.brand, ''),
          'model', nullif(v_product.model, ''),
          'cpu', nullif(v_product.cpu, ''),
          'ram', v_product.ram,
          'storage', nullif(v_product.storage, ''),
          'screen', nullif(v_product.screen, ''),
          'condition', nullif(v_product.condition, '')
        )),
        round(v_product.price)::bigint,
        v_unit_price,
        1,
        v_item_subtotal,
        v_sort_order
      );

      update public.product_units
      set status = 'sold', sold_at = now()
      where id = v_unit.id;

      insert into public.inventory_movements (
        unit_id, product_id, movement_type, from_status, to_status,
        reference_type, reference_id, reason, source, actor_ref, metadata, created_by
      ) values (
        v_unit.id, v_product.id, 'sale', 'available', 'sold',
        'sale', v_sale_id, 'Venta desde panel ERP', 'web_admin', v_actor::text,
        jsonb_build_object(
          'saleId', v_sale_id,
          'unitCode', v_unit.unit_code,
          'serialPresent', v_unit.serial_number is not null
        ),
        v_actor
      );

      insert into public.audit_events (
        actor_type, actor_ref, channel, operation, entity_type, entity_id,
        before_snapshot, after_snapshot, metadata
      ) values (
        'web_admin', v_actor::text, 'web', 'inventory.sell',
        'product_unit', v_unit.id,
        jsonb_build_object('status', 'available', 'unitCode', v_unit.unit_code),
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
      'saleId', v_sale_id,
      'customerId', p_customer_id,
      'subtotalCop', v_subtotal,
      'discountCop', p_discount_cop,
      'totalCop', v_subtotal - p_discount_cop,
      'paymentMethod', p_payment_method,
      'paymentStatus', p_payment_status
    ),
    jsonb_build_object('source', 'admin_panel', 'physicalInventory', true)
  );

  return v_sale_id;
end;
$$;

grant execute on function public.erp_create_sale_with_units(
  uuid,text,text,text,text,jsonb,bigint,text,text,integer,text,uuid
) to authenticated;

comment on function public.erp_create_sale_with_units(uuid,text,text,text,text,jsonb,bigint,text,text,integer,text,uuid) is
  'Fase 1C: crea venta + snapshots + consumo de unidades + movimientos + auditoría en una sola transacción. Bloquea cada product_unit FOR UPDATE y solo vende status=available. No toca products.stock.';

-- ============================================================================
-- 4. Verificación esperada en STAGING
-- ============================================================================
-- - erp_mark_unit_available(received_unit) => status available + movement + audit
-- - venta de available => sales + sale_items(product_unit_id) + product_units.sold
--   + inventory_movements.sale + audit inventory.sell + audit sale.create
-- - segundo intento con el mismo product_unit_id => unit_not_available:sold
-- - dos transacciones concurrentes sobre la misma unidad => una espera el lock;
--   tras el commit de la primera, la segunda ve sold y falla.
-- - products.stock permanece sin cambios.
