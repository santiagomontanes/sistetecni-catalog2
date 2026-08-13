-- ============================================================================
-- SISTETECNI · FASE 0 · Exportación consolidada de esquema + seguridad
--
-- SOLO LECTURA. Una única sentencia SELECT (con CTEs de solo lectura),
-- un único resultado: 1 fila, 1 columna JSONB con toda la auditoría
-- organizada por secciones.
--
-- No crea, modifica, inserta, actualiza, borra ni altera absolutamente nada.
-- No consulta datos de negocio (productos, clientes, precios reales, etc.),
-- ni tablas de autenticación (auth.*), ni contraseñas, ni claves, ni tokens.
-- Solo lee metadata de esquema (nombres de tabla/columna, tipos, políticas)
-- de los catálogos de sistema de Postgres/Supabase.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
-- ============================================================================

with

tablas_columnas as (
  select jsonb_agg(
    jsonb_build_object(
      'tabla',      c.table_name,
      'posicion',   c.ordinal_position,
      'columna',    c.column_name,
      'tipo_dato',  c.data_type,
      'nullable',   c.is_nullable,
      'default',    c.column_default
    ) order by c.table_name, c.ordinal_position
  ) as data
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema
   and t.table_name   = c.table_name
  where c.table_schema = 'public'
    and t.table_type = 'BASE TABLE'
),

primary_keys as (
  select jsonb_agg(
    jsonb_build_object(
      'tabla',      tc.table_name,
      'columna',    kcu.column_name,
      'constraint', tc.constraint_name
    ) order by tc.table_name, kcu.column_name
  ) as data
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name
   and kcu.table_schema    = tc.table_schema
  where tc.constraint_type = 'PRIMARY KEY'
    and tc.table_schema = 'public'
),

foreign_keys as (
  select jsonb_agg(
    jsonb_build_object(
      'tabla_origen',    tc.table_name,
      'columna_origen',  kcu.column_name,
      'tabla_destino',   ccu.table_name,
      'columna_destino', ccu.column_name,
      'constraint',      tc.constraint_name
    ) order by tc.table_name
  ) as data
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name
   and kcu.table_schema    = tc.table_schema
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name
   and ccu.table_schema    = tc.table_schema
  where tc.constraint_type = 'FOREIGN KEY'
    and tc.table_schema = 'public'
),

constraints_check_unique as (
  select jsonb_agg(
    jsonb_build_object(
      'tabla',        tc.table_name,
      'tipo',         tc.constraint_type,
      'constraint',   tc.constraint_name,
      'check_clause', cc.check_clause
    ) order by tc.table_name, tc.constraint_type
  ) as data
  from information_schema.table_constraints tc
  left join information_schema.check_constraints cc
    on cc.constraint_name   = tc.constraint_name
   and cc.constraint_schema = tc.table_schema
  where tc.table_schema = 'public'
    and tc.constraint_type in ('CHECK', 'UNIQUE')
),

indices as (
  select jsonb_agg(
    jsonb_build_object(
      'tabla',      tablename,
      'indice',     indexname,
      'definicion', indexdef
    ) order by tablename, indexname
  ) as data
  from pg_indexes
  where schemaname = 'public'
),

triggers as (
  select jsonb_agg(
    jsonb_build_object(
      'tabla',   event_object_table,
      'trigger', trigger_name,
      'momento', action_timing,
      'evento',  event_manipulation,
      'accion',  action_statement
    ) order by event_object_table, trigger_name
  ) as data
  from information_schema.triggers
  where trigger_schema = 'public'
),

vistas as (
  select jsonb_agg(
    jsonb_build_object(
      'vista',      table_name,
      'definicion', view_definition
    ) order by table_name
  ) as data
  from information_schema.views
  where table_schema = 'public'
),

funciones as (
  select jsonb_agg(
    jsonb_build_object(
      'funcion',           p.proname,
      'argumentos',        pg_get_function_identity_arguments(p.oid),
      'volatilidad',       case p.provolatile
                              when 'i' then 'immutable'
                              when 's' then 'stable'
                              when 'v' then 'volatile (puede escribir)'
                            end,
      'retorna',           pg_get_function_result(p.oid),
      'security_definer',  p.prosecdef
    ) order by p.proname
  ) as data
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),

rls_tablas as (
  select jsonb_agg(
    jsonb_build_object(
      'tabla',        c.relname,
      'rls_activado', c.relrowsecurity,
      'rls_forzado',  c.relforcerowsecurity
    ) order by c.relname
  ) as data
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
),

policies_public as (
  select jsonb_agg(
    jsonb_build_object(
      'tabla',      tablename,
      'policy',     policyname,
      'roles',      roles,
      'comando',    cmd,
      'using',      qual,
      'with_check', with_check
    ) order by tablename, policyname
  ) as data
  from pg_policies
  where schemaname = 'public'
),

storage_buckets as (
  select jsonb_agg(
    jsonb_build_object(
      'bucket',          id,
      'nombre',          name,
      'publico',         public,
      'creado',          created_at,
      'limite_bytes',    file_size_limit,
      'mime_permitidos', allowed_mime_types
    ) order by id
  ) as data
  from storage.buckets
),

storage_rls_objects as (
  select jsonb_build_object(
    'tabla',        c.relname,
    'rls_activado', c.relrowsecurity
  ) as data
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'storage'
    and c.relname = 'objects'
),

storage_policies as (
  select jsonb_agg(
    jsonb_build_object(
      'tabla',      tablename,
      'policy',     policyname,
      'roles',      roles,
      'comando',    cmd,
      'using',      qual,
      'with_check', with_check
    ) order by tablename, policyname
  ) as data
  from pg_policies
  where schemaname = 'storage'
)

select jsonb_build_object(
  'generado_en',              now(),
  'tablas_columnas',          coalesce((select data from tablas_columnas),         '[]'::jsonb),
  'primary_keys',             coalesce((select data from primary_keys),            '[]'::jsonb),
  'foreign_keys',              coalesce((select data from foreign_keys),            '[]'::jsonb),
  'constraints_check_unique', coalesce((select data from constraints_check_unique),'[]'::jsonb),
  'indices',                  coalesce((select data from indices),                 '[]'::jsonb),
  'triggers',                 coalesce((select data from triggers),                '[]'::jsonb),
  'vistas',                   coalesce((select data from vistas),                  '[]'::jsonb),
  'funciones',                coalesce((select data from funciones),               '[]'::jsonb),
  'rls_tablas',                coalesce((select data from rls_tablas),              '[]'::jsonb),
  'policies_public',          coalesce((select data from policies_public),         '[]'::jsonb),
  'storage_buckets',          coalesce((select data from storage_buckets),         '[]'::jsonb),
  'storage_rls_objects',      coalesce((select data from storage_rls_objects),     '{}'::jsonb),
  'storage_policies',         coalesce((select data from storage_policies),        '[]'::jsonb)
) as auditoria_supabase;
