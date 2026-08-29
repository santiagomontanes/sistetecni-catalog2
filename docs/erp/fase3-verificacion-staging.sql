-- SISTETECNI ERP · Fase 3 · verificación STAGING
-- SOLO LECTURA. No registra operadores ni ejecuta comandos.

-- 1) Tablas y RLS
select tablename, rowsecurity
from pg_tables
where schemaname='public'
  and tablename in ('whatsapp_erp_operators','whatsapp_erp_requests')
order by tablename;

-- Esperado: ambas rowsecurity=true.

-- 2) No debe haber policies públicas/autenticadas para estas tablas.
select schemaname,tablename,policyname,cmd,roles
from pg_policies
where schemaname='public'
  and tablename in ('whatsapp_erp_operators','whatsapp_erp_requests')
order by tablename,policyname;

-- Esperado: 0 filas.

-- 3) Constraints importantes
select tc.table_name,tc.constraint_name,tc.constraint_type
from information_schema.table_constraints tc
where tc.table_schema='public'
  and tc.table_name in ('whatsapp_erp_operators','whatsapp_erp_requests')
order by tc.table_name,tc.constraint_name;

-- 4) Funciones Fase 3 existentes
select p.proname,pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname like 'erp_agent_%'
order by p.proname;

-- Esperado:
-- erp_agent_action_policy
-- erp_agent_cancel_request
-- erp_agent_confirm_request
-- erp_agent_dispatch
-- erp_agent_operator_context
-- erp_agent_submit_request
-- erp_agent_upsert_operator

-- 5) Catálogo cerrado de acciones
select action,public.erp_agent_action_policy(action) as policy
from unnest(array[
  'inventory.summary','inventory.find','sales.today','cash.status',
  'expenses.today','purchases.recent','warranties.open','customers.find',
  'inventory.reserve','inventory.release','customer.create','expense.create',
  'cash.open','cash.close','cash.movement','sale.create_by_stu'
]) action;

-- 6) Una acción inventada debe ser NULL.
select public.erp_agent_action_policy('sql.execute') is null as unknown_action_is_blocked;
-- Esperado: true.

-- 7) Matriz de permisos actual, para comparar luego con el operador de prueba.
select role,permission,public.erp_role_has_permission(role,permission) as allowed
from unnest(array['admin','supervisor','vendedor','tecnico','caja','bodega','viewer']) role
cross join unnest(array[
  'inventory.read','inventory.reserve','sales.read','sales.manage',
  'cash.read','cash.manage','expenses.read','expenses.manage','purchases.read'
]) permission
order by role,permission;

-- Las pruebas de mutación NO están en este archivo: se hacen mediante la API
-- firmada con un operador de STAGING y datos de prueba, para verificar también
-- HMAC, idempotencia, confirmación y actor de auditoría extremo a extremo.
