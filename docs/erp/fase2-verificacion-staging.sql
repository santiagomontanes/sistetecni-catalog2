-- SISTETECNI ERP — Verificación Fase 2 en STAGING
-- SOLO LECTURA. Ejecutar después de pruebas manuales.

-- 1. Roles/perfiles
select erp_role,active,count(*) as perfiles
from public.profiles
group by erp_role,active
order by erp_role,active;

-- Debe existir al menos un admin activo.
select count(*) as active_admins
from public.profiles
where erp_role='admin' and active=true;

-- 2. Sesiones de caja: máximo una abierta.
select count(*) as open_cash_sessions
from public.cash_sessions
where status='open';
-- esperado: 0 o 1

-- 3. Cierres de caja deben cuadrar su fórmula almacenada.
select session_number,expected_cash_cop,counted_cash_cop,difference_cop,
       counted_cash_cop-expected_cash_cop as recalculated_difference
from public.cash_sessions
where status='closed'
  and difference_cop is distinct from counted_cash_cop-expected_cash_cop;
-- esperado: 0 filas

-- 4. Movimiento de venta: máximo uno por venta pagada.
select sale_id,count(*)
from public.cash_movements
where movement_type='sale'
group by sale_id
having count(*)<>1;
-- esperado: 0 filas

-- Ventas pagadas positivas sin movimiento financiero.
select s.id,s.sale_number,s.total_cop
from public.sales s
where s.payment_status='pagado' and s.total_cop>0
  and not exists(select 1 from public.cash_movements m where m.sale_id=s.id and m.movement_type='sale');
-- esperado: 0 filas

-- 5. Gastos activos: exactamente un movimiento expense negativo.
select e.expense_number,count(m.id) as movimientos
from public.operating_expenses e
left join public.cash_movements m on m.expense_id=e.id and m.movement_type='expense'
group by e.id,e.expense_number
having count(m.id)<>1;
-- esperado: 0 filas

select e.expense_number,e.amount_cop,m.amount_cop
from public.operating_expenses e
join public.cash_movements m on m.expense_id=e.id and m.movement_type='expense'
where m.amount_cop<>-e.amount_cop;
-- esperado: 0 filas

-- 6. Gastos anulados deben tener reverso exacto del movimiento original.
select e.expense_number,m.amount_cop,r.amount_cop as reversal_amount
from public.operating_expenses e
join public.cash_movements m on m.expense_id=e.id and m.movement_type='expense'
left join public.cash_movements r on r.reversal_of_id=m.id
where e.status='voided' and (r.id is null or r.amount_cop<>-m.amount_cop);
-- esperado: 0 filas

-- 7. Reversos manuales únicos y exactos.
select r.movement_number,o.movement_number as original,r.amount_cop,o.amount_cop
from public.cash_movements r
join public.cash_movements o on o.id=r.reversal_of_id
where r.amount_cop<>-o.amount_cop;
-- esperado: 0 filas

-- 8. Movimientos de efectivo ligados a caja cerrada deben reproducir esperado.
select s.session_number,s.expected_cash_cop,
       s.opening_cash_cop+coalesce(sum(m.amount_cop) filter(where m.payment_method='efectivo'),0) as recalculated
from public.cash_sessions s
left join public.cash_movements m on m.session_id=s.id
where s.status='closed'
group by s.id
having s.expected_cash_cop is distinct from s.opening_cash_cop+coalesce(sum(m.amount_cop) filter(where m.payment_method='efectivo'),0);
-- esperado: 0 filas

-- 9. Reporte de ejemplo últimos 30 días (requiere sesión/rol reports.view si se llama por API).
-- select public.erp_business_report(current_date-30,current_date);

-- 10. Seguridad estructural de nuevas tablas.
select tablename,rowsecurity
from pg_tables
where schemaname='public' and tablename in ('cash_sessions','cash_movements','operating_expenses');
-- todos rowsecurity=true

select tablename,policyname,cmd,roles
from pg_policies
where schemaname='public' and tablename in ('cash_sessions','cash_movements','operating_expenses','profiles')
order by tablename,policyname;

-- 11. Los RPC internos legacy NO deben tener EXECUTE para authenticated.
select p.proname,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'erp_internal_%'
order by p.proname;
-- todas false
