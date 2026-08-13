-- Verificación de solo lectura del esquema aplicado a STAGING tras el
-- db push de baseline + 4 migraciones del personalizador.
-- Reutilizable: sirve igual para verificar producción cuando llegue el momento.
-- Una sola sentencia SELECT. No modifica nada.

with
tablas as (
  select jsonb_agg(jsonb_build_object('tabla', c.table_name) order by c.table_name) as data
  from information_schema.tables c
  where c.table_schema = 'public' and c.table_type = 'BASE TABLE'
),
columnas_products as (
  select jsonb_agg(jsonb_build_object(
    'columna', column_name, 'tipo', data_type, 'nullable', is_nullable, 'default', column_default
  ) order by ordinal_position) as data
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products'
),
rls as (
  select jsonb_agg(jsonb_build_object('tabla', c.relname, 'rls_activado', c.relrowsecurity) order by c.relname) as data
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
policies as (
  select jsonb_agg(jsonb_build_object(
    'tabla', tablename, 'policy', policyname, 'roles', roles, 'comando', cmd, 'using', qual, 'with_check', with_check
  ) order by tablename, policyname) as data
  from pg_policies where schemaname = 'public'
),
pk as (
  select jsonb_agg(jsonb_build_object('tabla', tc.table_name, 'columna', kcu.column_name, 'constraint', tc.constraint_name) order by tc.table_name) as data
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
  where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = 'public'
),
fk as (
  select jsonb_agg(jsonb_build_object(
    'tabla_origen', tc.table_name, 'columna_origen', kcu.column_name,
    'tabla_destino', ccu.table_name, 'columna_destino', ccu.column_name
  ) order by tc.table_name) as data
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
  join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
  where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
),
otros_constraints as (
  select jsonb_agg(jsonb_build_object('tabla', tc.table_name, 'tipo', tc.constraint_type, 'constraint', tc.constraint_name) order by tc.table_name) as data
  from information_schema.table_constraints tc
  where tc.table_schema = 'public' and tc.constraint_type in ('CHECK','UNIQUE')
)
select jsonb_build_object(
  'tablas', coalesce((select data from tablas), '[]'::jsonb),
  'columnas_products', coalesce((select data from columnas_products), '[]'::jsonb),
  'rls', coalesce((select data from rls), '[]'::jsonb),
  'policies', coalesce((select data from policies), '[]'::jsonb),
  'primary_keys', coalesce((select data from pk), '[]'::jsonb),
  'foreign_keys', coalesce((select data from fk), '[]'::jsonb),
  'constraints_check_unique', coalesce((select data from otros_constraints), '[]'::jsonb)
) as verificacion;
