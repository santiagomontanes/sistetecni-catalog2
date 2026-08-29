-- SISTETECNI ERP 1H — verificación de STAGING
-- SOLO lectura salvo las pruebas manuales que el admin haga desde la UI.

-- 1. Estructura y RLS
select tablename, rowsecurity
from pg_tables
where schemaname='public' and tablename='cost_entries';

select policyname, cmd, roles
from pg_policies
where schemaname='public' and tablename='cost_entries'
order by policyname;

-- 2. Ledger reciente
select cost_number, entry_kind, category, product_unit_id, sale_id,
       amount_cop, incurred_at, reference_type, reference_id, reversal_of_id
from public.cost_entries
order by created_at desc
limit 50;

-- 3. Invariante: scope exactamente uno (debe devolver 0)
select count(*) as invalid_scope
from public.cost_entries
where (product_unit_id is null and sale_id is null)
   or (product_unit_id is not null and sale_id is not null);

-- 4. Invariante de signo (debe devolver 0)
select count(*) as invalid_sign
from public.cost_entries
where (entry_kind='cost' and (amount_cop<=0 or reversal_of_id is not null))
   or (entry_kind='reversal' and (amount_cop>=0 or reversal_of_id is null));

-- 5. Todo reverso debe ser exactamente el negativo del original y mantener identidad (0 filas)
select r.cost_number as reversal, o.cost_number as original,
       r.amount_cop, o.amount_cop,
       r.category, o.category,
       r.product_unit_id, o.product_unit_id,
       r.sale_id, o.sale_id
from public.cost_entries r
join public.cost_entries o on o.id=r.reversal_of_id
where r.entry_kind='reversal'
  and (
    r.amount_cop <> -o.amount_cop
    or r.category is distinct from o.category
    or r.product_unit_id is distinct from o.product_unit_id
    or r.sale_id is distinct from o.sale_id
    or r.reference_type is distinct from o.reference_type
    or r.reference_id is distinct from o.reference_id
  );

-- 6. Un costo solo puede tener un reverso (0 filas)
select reversal_of_id, count(*)
from public.cost_entries
where reversal_of_id is not null
group by reversal_of_id
having count(*)>1;

-- 7. Integración 1F -> 1H: todo GAR/DEV cerrado con costo final >0 tiene exactamente un costo positivo (0 filas)
select c.id, c.case_number, c.final_cost_cop, count(e.id) as ledger_rows
from public.after_sales_cases c
left join public.cost_entries e
  on e.reference_type='after_sales_case'
 and e.reference_id=c.id
 and e.entry_kind='cost'
where c.status='closed' and coalesce(c.final_cost_cop,0)>0
group by c.id,c.case_number,c.final_cost_cop
having count(e.id)<>1;

-- 8. El costo automático debe coincidir con final_cost_cop (0 filas)
select c.case_number, c.final_cost_cop, e.cost_number, e.amount_cop
from public.after_sales_cases c
join public.cost_entries e
  on e.reference_type='after_sales_case'
 and e.reference_id=c.id
 and e.entry_kind='cost'
where e.amount_cop<>c.final_cost_cop;

-- 9. Costos netos por STU
select u.unit_code,
       u.acquisition_cost_cop,
       coalesce(sum(e.amount_cop),0) as extra_costs_cop,
       case when u.acquisition_cost_cop is null then null
            else u.acquisition_cost_cop + coalesce(sum(e.amount_cop),0) end as known_unit_cost_cop
from public.product_units u
left join public.cost_entries e on e.product_unit_id=u.id
group by u.id,u.unit_code,u.acquisition_cost_cop
order by u.unit_code desc
limit 100;

-- 10. Costos generales netos por venta
select s.sale_number, s.total_cop,
       coalesce(sum(e.amount_cop),0) as sale_costs_cop
from public.sales s
left join public.cost_entries e on e.sale_id=s.id
group by s.id,s.sale_number,s.total_cop
order by s.created_at desc
limit 100;

-- 11. Verificación manual esperada desde UI
-- A) Buscar STU no vendido, agregar Upgrade $80.000 -> aparece CST-* y margen aún 'Aún no vendido'.
-- B) Vender ese STU -> el costo queda preventa y reduce la utilidad del STU.
-- C) Agregar costo general de venta $20.000 -> baja margen venta y se asigna proporcionalmente a sus ítems.
-- D) Reversar ese costo -> aparece una segunda fila negativa y el neto vuelve al valor anterior.
-- E) Cerrar un GAR con final_cost_cop >0 -> aparece automáticamente un CST-* category='after_sales'.
-- F) Intentar UPDATE/DELETE cost_entries debe fallar incluso si se concediera permiso accidentalmente (guard append-only).
