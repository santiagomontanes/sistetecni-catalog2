-- SISTETECNI ERP — Fase 1D / Verificación STAGING
-- Ejecutar DESPUÉS de aplicar 20260828193000_erp_fase1d_stock_sync.sql.
-- Solo lecturas: no modifica datos.

-- 1) Estado de cada producto que ya tiene al menos una unidad física.
select
  p.id,
  p.title,
  p.stock as stock_web,
  p.erp_stock_enabled,
  p.erp_stock_synced_at,
  count(u.id) as unidades_registradas,
  count(u.id) filter (where u.status = 'available') as unidades_disponibles
from public.products p
join public.product_units u on u.product_id = p.id
group by p.id, p.title, p.stock, p.erp_stock_enabled, p.erp_stock_synced_at
order by p.title;

-- 2) INVARIANTE PRINCIPAL.
-- Debe devolver CERO filas para productos con Stock ERP activo.
select
  p.id,
  p.title,
  p.stock as stock_web,
  count(u.id) filter (where u.status = 'available') as disponibles_reales
from public.products p
left join public.product_units u on u.product_id = p.id
where p.erp_stock_enabled = true
group by p.id, p.title, p.stock
having p.stock <> count(u.id) filter (where u.status = 'available');

-- 3) Los estados que NO son available nunca deben sumar stock.
select
  p.id,
  p.title,
  p.stock,
  count(u.id) filter (where u.status = 'available') as available,
  count(u.id) filter (where u.status = 'received') as received,
  count(u.id) filter (where u.status = 'inspection') as inspection,
  count(u.id) filter (where u.status = 'reserved') as reserved,
  count(u.id) filter (where u.status = 'sold') as sold,
  count(u.id) filter (where u.status = 'warranty') as warranty,
  count(u.id) filter (where u.status = 'repair') as repair,
  count(u.id) filter (where u.status = 'returned') as returned,
  count(u.id) filter (where u.status = 'retired') as retired
from public.products p
left join public.product_units u on u.product_id = p.id
where p.erp_stock_enabled = true
group by p.id, p.title, p.stock
order by p.title;

-- 4) Objetos estructurales de Fase 1D.
select
  p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'erp_available_stock',
    'erp_sync_product_stock',
    'erp_guard_managed_product_stock',
    'erp_sync_stock_from_unit_change',
    'erp_set_product_stock_mode'
  )
order by p.proname;

select
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in (
    'products_guard_managed_stock',
    'product_units_sync_web_stock'
  )
order by trigger_name, event_manipulation;

-- 5) Auditoría de activación/desactivación de la fuente ERP.
select
  operation,
  entity_type,
  entity_id,
  before_snapshot,
  after_snapshot,
  created_at
from public.audit_events
where operation in (
  'inventory.stock_erp_enable',
  'inventory.stock_erp_disable'
)
order by created_at desc
limit 20;

-- Resultado esperado tras la prueba visual:
-- - el producto probado tiene erp_stock_enabled=true;
-- - products.stock == cantidad de product_units status='available';
-- - vender una available la pasa a sold y stock baja en 1 automáticamente;
-- - marcar otra received/inspection como available sube stock en 1;
-- - la consulta #2 siempre devuelve 0 filas;
-- - los productos erp_stock_enabled=false conservan stock manual sin cambios.
