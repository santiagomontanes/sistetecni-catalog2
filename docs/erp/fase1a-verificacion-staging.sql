-- SISTETECNI ERP — Fase 1A — verificación STAGING
-- SOLO ejecutar después de aplicar 20260827183000_erp_core_fase1a.sql en STAGING.
-- Este archivo NO debe ejecutarse en producción.

-- 1. Estructura y RLS
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('customers','product_units','inventory_movements','audit_events')
order by tablename;

select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('customers','product_units','inventory_movements','audit_events')
order by tablename, policyname;

-- 2. Grants efectivos
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('customers','product_units','inventory_movements','audit_events')
  and grantee in ('anon','authenticated')
order by table_name, grantee, privilege_type;

-- 3. Constraints relevantes
select
  conrelid::regclass::text as tabla,
  conname,
  pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid in (
  'public.customers'::regclass,
  'public.product_units'::regclass,
  'public.inventory_movements'::regclass,
  'public.audit_events'::regclass
)
order by tabla, conname;

-- 4. Índices relevantes
select tablename, indexname, indexdef
from pg_indexes
where schemaname='public'
  and tablename in ('customers','product_units','inventory_movements','audit_events')
order by tablename, indexname;

-- 5. Comprobar que products/sales no fueron modificadas por Fase 1A.
-- Esta consulta es solo una señal rápida; comparar además contra baseline/migraciones existentes.
select table_name, column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name in ('products','sales','sale_items')
order by table_name, ordinal_position;

-- PRUEBAS DE ESCRITURA CONTROLADA (hacerlas con un admin autenticado en staging):
--
-- A. Crear customer con marcador [ERP_TEST_F1A].
-- B. Intentar crear segundo customer con mismo document_number cambiando mayúsculas/espacios -> debe fallar.
-- C. Crear product_unit sobre un producto de staging con unit_code único y serial [ERP_TEST_SERIAL].
-- D. Intentar segundo serial equivalente cambiando mayúsculas/espacios -> debe fallar.
-- E. battery_health_percent = 101 -> debe fallar.
-- F. status = 'inventado' -> debe fallar.
-- G. Insertar inventory_movement -> debe funcionar para admin.
-- H. UPDATE/DELETE de ese inventory_movement -> debe fallar por RLS/grants.
-- I. Insertar audit_event -> debe funcionar para admin.
-- J. UPDATE/DELETE audit_event -> debe fallar.
-- K. Repetir SELECT/INSERT como authenticated no-admin -> debe fallar/no devolver filas.
-- L. Repetir como anon -> debe fallar/no devolver filas.
--
-- LIMPIEZA: como los ledgers son deliberadamente inmutables para authenticated,
-- la limpieza de datos de prueba debe hacerse exclusivamente en STAGING con una
-- sesión administrativa de base de datos/service role y buscando el marcador
-- [ERP_TEST_F1A]. Nunca reutilizar este procedimiento en producción.
