-- SISTETECNI ERP Fase 1F — verificación STAGING
-- Ejecutar SOLO después de aplicar migraciones 20260829004500 y 20260829005000.

-- 1. Casos recientes
select id, case_number, case_type, status, sale_number_snapshot,
       customer_name_snapshot, product_name_snapshot, unit_code_snapshot,
       serial_number_snapshot, coverage_status, warranty_expires_at,
       opened_at, closed_at
from public.after_sales_cases
order by created_at desc
limit 30;

-- 2. Línea de tiempo reciente
select c.case_number, e.event_type, e.from_status, e.to_status,
       e.note, e.cost_cop, e.created_at
from public.after_sales_case_events e
join public.after_sales_cases c on c.id=e.case_id
order by e.created_at desc
limit 50;

-- 3. Todo caso abierto debe apuntar a su unidad exacta
select c.case_number, c.case_type, c.status as case_status,
       c.product_unit_id, c.unit_code_snapshot, pu.unit_code,
       c.serial_number_snapshot, pu.serial_number, pu.status as unit_status
from public.after_sales_cases c
join public.product_units pu on pu.id=c.product_unit_id
where c.status not in ('closed','cancelled')
order by c.created_at desc;

-- 4. No puede haber dos casos activos por unidad. Esperado: 0 filas.
select product_unit_id, count(*) as active_cases
from public.after_sales_cases
where status not in ('closed','cancelled')
group by product_unit_id
having count(*) > 1;

-- 5. Los vínculos deben ser coherentes sale_item -> sale -> unit. Esperado: 0 filas.
select c.case_number, c.sale_id, si.sale_id as item_sale_id,
       c.product_unit_id, si.product_unit_id as item_unit_id
from public.after_sales_cases c
join public.sale_items si on si.id=c.sale_item_id
where c.sale_id <> si.sale_id
   or c.product_unit_id <> si.product_unit_id;

-- 6. Estados físicos esperados para casos activos. Esperado: 0 filas.
select c.case_number, c.case_type, c.status, pu.status as unit_status
from public.after_sales_cases c
join public.product_units pu on pu.id=c.product_unit_id
where c.status not in ('closed','cancelled')
  and not (
       (c.case_type='warranty' and pu.status in ('warranty','repair'))
    or (c.case_type='return' and pu.status in ('returned','repair'))
  );

-- 7. Casos terminales deben tener closed_at. Esperado: 0 filas.
select case_number, status, closed_at
from public.after_sales_cases
where (status in ('closed','cancelled') and closed_at is null)
   or (status not in ('closed','cancelled') and closed_at is not null);

-- 8. Cobertura congelada para garantías
select case_number, sale_number_snapshot, coverage_status,
       warranty_expires_at, opened_at
from public.after_sales_cases
where case_type='warranty'
order by created_at desc;

-- 9. Movimientos vinculados a expedientes
select c.case_number, m.movement_type, m.from_status, m.to_status,
       m.reason, m.created_at
from public.inventory_movements m
join public.after_sales_cases c
  on m.reference_type='after_sales_case' and m.reference_id=c.id
order by m.created_at desc
limit 50;

-- 10. Auditoría de apertura/progreso
select operation, entity_type, entity_id, before_snapshot,
       after_snapshot, metadata, created_at
from public.audit_events
where operation in ('after_sales.open','after_sales.progress')
order by created_at desc
limit 50;

-- 11. Evidencias inválidas. Esperado: 0 filas.
select c.case_number, u.url
from public.after_sales_cases c
cross join lateral unnest(c.evidence_urls) as u(url)
where btrim(u.url) !~* '^https?://';

-- 12. Stock ERP debe seguir consistente. Esperado: 0 filas.
select p.id, p.title, p.stock,
       count(pu.id) filter (where pu.status='available')::integer as physical_available
from public.products p
left join public.product_units pu on pu.product_id=p.id
where p.erp_stock_enabled=true
group by p.id,p.title,p.stock
having p.stock <> count(pu.id) filter (where pu.status='available')::integer;

-- 13. Políticas / RLS
select tablename, rowsecurity
from pg_tables
where schemaname='public'
  and tablename in ('after_sales_cases','after_sales_case_events');

select tablename, policyname, cmd, roles
from pg_policies
where schemaname='public'
  and tablename in ('after_sales_cases','after_sales_case_events')
order by tablename, policyname;
