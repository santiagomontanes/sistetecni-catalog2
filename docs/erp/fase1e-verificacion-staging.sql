-- SISTETECNI ERP — Fase 1E
-- Verificación manual en STAGING después de aplicar ambas migraciones 1E.

-- 1) Columnas de reserva creadas.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'product_units'
  and column_name in (
    'reserved_at',
    'reservation_expires_at',
    'reservation_customer_name',
    'reservation_customer_phone',
    'reservation_note'
  )
order by column_name;

-- Esperado: 5 filas.

-- 2) Estado actual y reserva vigente de las unidades recientes.
select
  unit_code,
  serial_number,
  status,
  sold_at,
  reserved_at,
  reservation_expires_at,
  reservation_customer_name,
  reservation_customer_phone,
  reservation_note,
  product_id,
  updated_at
from public.product_units
order by updated_at desc
limit 30;

-- 3) Historial operativo 1E.
select
  unit_id,
  product_id,
  movement_type,
  from_status,
  to_status,
  reason,
  metadata,
  created_at
from public.inventory_movements
where movement_type in (
  'inspection', 'available', 'reserve', 'release_reservation',
  'warranty_in', 'warranty_out', 'repair_in', 'repair_out',
  'return', 'retire', 'sale'
)
order by created_at desc
limit 50;

-- 4) Auditoría 1E.
select
  operation,
  entity_type,
  entity_id,
  before_snapshot,
  after_snapshot,
  metadata,
  created_at
from public.audit_events
where operation in ('inventory.transition', 'inventory.sell', 'sale.create')
order by created_at desc
limit 50;

-- 5) Invariante 1D sigue válido con 1E.
select
  p.id,
  p.title,
  p.stock as products_stock,
  count(u.id) filter (where u.status = 'available')::integer as available_units
from public.products p
left join public.product_units u on u.product_id = p.id
where p.erp_stock_enabled = true
group by p.id, p.title, p.stock
having p.stock <> count(u.id) filter (where u.status = 'available')::integer;

-- Esperado: 0 filas.

-- 6) Ninguna unidad reserved debe carecer de nombre cuando fue creada por 1E.
-- (La migración no corrige datos históricos manuales previos.)
select unit_code, reservation_customer_name, reserved_at
from public.product_units
where status = 'reserved'
  and nullif(btrim(coalesce(reservation_customer_name, '')), '') is null;

-- Para reservas creadas desde 1E: 0 filas.

-- 7) Venta de reserva: el movimiento sale debe conservar la reserva consumida.
select
  unit_id,
  reference_id as sale_id,
  from_status,
  to_status,
  metadata -> 'consumedReservation' as consumed_reservation,
  created_at
from public.inventory_movements
where movement_type = 'sale'
  and from_status = 'reserved'
order by created_at desc
limit 20;

-- Tras probar una venta reservada: from_status='reserved', to_status='sold'
-- y consumed_reservation no null.

-- 8) Guard de asociación única de venta física sigue vigente.
select product_unit_id, count(*) as veces
from public.sale_items
where product_unit_id is not null
group by product_unit_id
having count(*) > 1;

-- Esperado: 0 filas.

-- 9) No debe existir reparación postventa en available.
select unit_code, status, sold_at
from public.product_units
where status = 'available'
  and sold_at is not null;

-- Esperado bajo el flujo 1E: 0 filas.

-- 10) Funciones/triggers 1E instalados.
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'erp_transition_product_unit',
    'erp_guard_repair_sale_history',
    'erp_guard_reserved_sale_customer'
  )
order by routine_name;

select trigger_name, event_object_table
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in (
    'product_units_guard_repair_sale_history',
    'sale_items_guard_reserved_customer'
  )
order by trigger_name;
