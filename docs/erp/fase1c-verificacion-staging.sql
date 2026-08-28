-- SISTETECNI ERP — Fase 1C / VERIFICACIÓN SOLO STAGING
-- Ejecutar manualmente después de una venta de prueba.
-- Este archivo solo hace SELECT; no modifica datos.

-- 1. Últimas unidades y estado físico.
select
  pu.id,
  pu.unit_code,
  pu.serial_number,
  pu.status,
  pu.received_at,
  pu.sold_at,
  pu.product_id
from public.product_units pu
order by pu.updated_at desc
limit 20;

-- 2. Últimas ventas, incluido vínculo opcional al cliente canónico.
select
  s.id,
  s.sale_number,
  s.customer_id,
  s.customer_name,
  s.customer_document,
  s.total_cop,
  s.idempotency_key,
  s.created_at
from public.sales s
order by s.created_at desc
limit 20;

-- 3. Ítem exacto entregado: vínculo vivo + snapshots históricos.
select
  si.sale_id,
  si.product_id,
  si.product_unit_id,
  si.unit_code_snapshot,
  si.serial_number_snapshot,
  si.unit_spec_overrides_snapshot,
  si.product_name,
  si.unit_price_cop,
  si.quantity,
  si.created_at
from public.sale_items si
order by si.created_at desc
limit 30;

-- 4. Todo computador vendido por 1C debe tener quantity=1 y una unidad física.
select
  si.id,
  si.sale_id,
  si.product_id,
  si.product_unit_id,
  si.quantity
from public.sale_items si
where si.item_type = 'catalog'
  and si.created_at >= timestamp with time zone '2026-08-28 00:00:00+00'
  and (si.product_unit_id is null or si.quantity <> 1);
-- Esperado para ventas 1C: 0 filas.

-- 5. No debe haber una misma unidad asociada a dos ítems.
select product_unit_id, count(*) as veces
from public.sale_items
where product_unit_id is not null
group by product_unit_id
having count(*) > 1;
-- Esperado: 0 filas.

-- 6. Movimiento de venta vinculado al comprobante.
select
  im.unit_id,
  im.product_id,
  im.movement_type,
  im.from_status,
  im.to_status,
  im.reference_type,
  im.reference_id,
  im.source,
  im.created_at
from public.inventory_movements im
where im.movement_type in ('available', 'sale')
order by im.created_at desc
limit 30;

-- 7. Auditoría 1C.
select
  ae.operation,
  ae.entity_type,
  ae.entity_id,
  ae.actor_type,
  ae.channel,
  ae.metadata,
  ae.created_at
from public.audit_events ae
where ae.operation in ('inventory.mark_available', 'inventory.sell', 'sale.create')
order by ae.created_at desc
limit 30;

-- 8. Consistencia sold: todo sale_item ligado a unidad debe apuntar a sold y tener sold_at.
select
  si.sale_id,
  si.product_unit_id,
  pu.unit_code,
  pu.status,
  pu.sold_at
from public.sale_items si
join public.product_units pu on pu.id = si.product_unit_id
where si.product_unit_id is not null
  and (pu.status <> 'sold' or pu.sold_at is null);
-- Esperado: 0 filas.

-- 9. IMPORTANTE: Fase 1C NO sincroniza products.stock.
-- Esta vista solo permite inspeccionarlo junto al conteo físico; diferencias son esperadas todavía.
select
  p.id,
  p.title,
  p.stock as stock_web_manual,
  count(pu.id) filter (where pu.status = 'available') as unidades_available,
  count(pu.id) filter (where pu.status = 'sold') as unidades_sold
from public.products p
left join public.product_units pu on pu.product_id = p.id
where exists (select 1 from public.product_units x where x.product_id = p.id)
group by p.id, p.title, p.stock
order by p.title;
