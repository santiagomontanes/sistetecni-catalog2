-- Fase 1G — verificación manual en STAGING
-- Ejecutar después de crear al menos una compra desde /admin/compras/nueva.

-- 1. Últimas compras
select id,purchase_number,supplier_name_snapshot,supplier_invoice_reference,purchase_date,status,
       item_count,merchandise_subtotal_cop,shared_costs_cop,total_cost_cop,created_at
from public.purchases
order by created_at desc
limit 20;

-- 2. Líneas y STU creados por compra
select p.purchase_number,pi.sort_order,pi.product_name_snapshot,pi.unit_code_snapshot,
       pi.serial_number_snapshot,pi.base_cost_cop,pi.allocated_extra_cost_cop,pi.landed_cost_cop,
       pu.status,pu.acquisition_cost_cop,pu.purchase_id
from public.purchase_items pi
join public.purchases p on p.id=pi.purchase_id
join public.product_units pu on pu.id=pi.product_unit_id
order by p.created_at desc,pi.sort_order;

-- 3. INVARIANTE: total COMP = suma costos reales de STU. Debe devolver 0 filas.
select p.id,p.purchase_number,p.total_cost_cop,sum(pi.landed_cost_cop) as suma_stu
from public.purchases p
join public.purchase_items pi on pi.purchase_id=p.id
group by p.id,p.purchase_number,p.total_cost_cop
having p.total_cost_cop <> sum(pi.landed_cost_cop);

-- 4. INVARIANTE: subtotal COMP = suma costos base. 0 filas.
select p.id,p.purchase_number,p.merchandise_subtotal_cop,sum(pi.base_cost_cop) as suma_base
from public.purchases p
join public.purchase_items pi on pi.purchase_id=p.id
group by p.id,p.purchase_number,p.merchandise_subtotal_cop
having p.merchandise_subtotal_cop <> sum(pi.base_cost_cop);

-- 5. INVARIANTE: gastos compartidos = suma asignaciones. 0 filas.
select p.id,p.purchase_number,p.shared_costs_cop,sum(pi.allocated_extra_cost_cop) as suma_asignada
from public.purchases p
join public.purchase_items pi on pi.purchase_id=p.id
group by p.id,p.purchase_number,p.shared_costs_cop
having p.shared_costs_cop <> sum(pi.allocated_extra_cost_cop);

-- 6. INVARIANTE: costo del STU = landed_cost de su línea. 0 filas.
select p.purchase_number,pu.unit_code,pu.acquisition_cost_cop,pi.landed_cost_cop
from public.purchase_items pi
join public.purchases p on p.id=pi.purchase_id
join public.product_units pu on pu.id=pi.product_unit_id
where pu.acquisition_cost_cop is distinct from pi.landed_cost_cop;

-- 7. INVARIANTE: purchase_id del STU coincide con purchase_item. 0 filas.
select p.purchase_number,pu.unit_code,pu.purchase_id,pi.purchase_id as item_purchase_id
from public.purchase_items pi
join public.purchases p on p.id=pi.purchase_id
join public.product_units pu on pu.id=pi.product_unit_id
where pu.purchase_id is distinct from pi.purchase_id;

-- 8. INVARIANTE: cantidad de líneas = item_count. 0 filas.
select p.id,p.purchase_number,p.item_count,count(pi.id) as lineas
from public.purchases p
left join public.purchase_items pi on pi.purchase_id=p.id
group by p.id,p.purchase_number,p.item_count
having p.item_count <> count(pi.id);

-- 9. Todo STU recibido por COMP nace received. Si acabas de crear el lote y aún
-- no lo has procesado en Inventario, cualquier fila distinta sería inesperada.
select p.purchase_number,pu.unit_code,pu.status
from public.product_units pu
join public.purchases p on p.id=pu.purchase_id
order by pu.created_at desc
limit 50;

-- 10. Debe existir un receipt por cada purchase_item, referenciado a purchase.
select p.purchase_number,count(pi.id) as items,
       count(im.id) filter(where im.movement_type='receipt' and im.reference_type='purchase') as receipts
from public.purchases p
join public.purchase_items pi on pi.purchase_id=p.id
left join public.inventory_movements im on im.unit_id=pi.product_unit_id and im.reference_id=p.id
 group by p.id,p.purchase_number
having count(pi.id) <> count(im.id) filter(where im.movement_type='receipt' and im.reference_type='purchase');

-- 11. Auditoría esperada
select operation,entity_type,entity_id,metadata,created_at
from public.audit_events
where operation in ('supplier.create','purchase.receive','inventory.receive_purchase')
order by created_at desc
limit 100;

-- 12. No debe haber líneas huérfanas. 0 filas.
select pi.id from public.purchase_items pi
left join public.purchases p on p.id=pi.purchase_id
left join public.product_units pu on pu.id=pi.product_unit_id
where p.id is null or pu.id is null;
