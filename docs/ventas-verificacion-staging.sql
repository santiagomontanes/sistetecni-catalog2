-- Verificación de SOLO LECTURA del módulo de ventas/comprobantes
-- (supabase/migrations/20260826000000_ventas_comprobantes.sql) — mismo
-- estilo que docs/verificacion-staging-schema.sql: una única sentencia
-- SELECT, sin insert/update/delete/DDL. Reutilizable en staging y,
-- cuando llegue el momento, en producción.
--
-- Uso: pegar completo en el SQL Editor de Supabase (o `supabase db
-- execute` de solo lectura) DESPUÉS de aplicar la migración, y revisar
-- el JSON resultante contra lo esperado (ver comentarios de cada bloque).

with
tablas as (
  select jsonb_agg(jsonb_build_object('tabla', c.table_name) order by c.table_name) as data
  from information_schema.tables c
  where c.table_schema = 'public'
    and c.table_type = 'BASE TABLE'
    and c.table_name in ('sales', 'sale_items', 'sale_number_counters')
  -- Esperado: las 3 tablas presentes.
),
columnas as (
  select jsonb_agg(jsonb_build_object(
    'tabla', table_name, 'columna', column_name, 'tipo', data_type,
    'nullable', is_nullable, 'default', column_default
  ) order by table_name, ordinal_position) as data
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('sales', 'sale_items', 'sale_number_counters')
  -- Esperado: sales.sale_number con nullable='NO'; sales.idempotency_key
  -- nullable='YES'; sale_items.product_id nullable='YES'.
),
rls as (
  select jsonb_agg(jsonb_build_object('tabla', c.relname, 'rls_activado', c.relrowsecurity) order by c.relname) as data
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in ('sales', 'sale_items', 'sale_number_counters')
  -- Esperado: rls_activado = true en las 3.
),
policies as (
  select jsonb_agg(jsonb_build_object(
    'tabla', tablename, 'policy', policyname, 'roles', roles,
    'comando', cmd, 'using', qual, 'with_check', with_check
  ) order by tablename, policyname) as data
  from pg_policies
  where schemaname = 'public'
    and tablename in ('sales', 'sale_items', 'sale_number_counters')
  -- Esperado: EXACTAMENTE 1 policy por tabla, roles={authenticated},
  -- comando=ALL, using/with_check mencionando profiles.is_admin. Ninguna
  -- fila con roles conteniendo "public" o "anon".
),
pk as (
  select jsonb_agg(jsonb_build_object('tabla', tc.table_name, 'columna', kcu.column_name, 'constraint', tc.constraint_name) order by tc.table_name) as data
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
  where tc.constraint_type = 'PRIMARY KEY'
    and tc.table_schema = 'public'
    and tc.table_name in ('sales', 'sale_items', 'sale_number_counters')
),
fk as (
  select jsonb_agg(jsonb_build_object(
    'tabla_origen', tc.table_name, 'columna_origen', kcu.column_name,
    'tabla_destino', ccu.table_name, 'columna_destino', ccu.column_name,
    'on_delete', rc.delete_rule
  ) order by tc.table_name) as data
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
  join information_schema.referential_constraints rc
    on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.table_schema
  where tc.constraint_type = 'FOREIGN KEY'
    and tc.table_schema = 'public'
    and tc.table_name in ('sales', 'sale_items', 'sale_number_counters')
  -- Esperado: sales.created_by -> profiles.id (on_delete=SET NULL);
  -- sale_items.sale_id -> sales.id (on_delete=CASCADE);
  -- sale_items.product_id -> products.id (on_delete=SET NULL).
),
constraints_check_unique as (
  select jsonb_agg(jsonb_build_object(
    'tabla', tc.table_name, 'tipo', tc.constraint_type, 'constraint', tc.constraint_name
  ) order by tc.table_name, tc.constraint_name) as data
  from information_schema.table_constraints tc
  where tc.table_schema = 'public'
    and tc.constraint_type in ('CHECK', 'UNIQUE')
    and tc.table_name in ('sales', 'sale_items', 'sale_number_counters')
  -- Esperado: sales_sale_number_key (UNIQUE), sales_sale_number_format
  -- (CHECK), sales_idempotency_key_key (UNIQUE), sales_total_matches
  -- (CHECK), sale_items_subtotal_matches (CHECK), etc. — ver la
  -- migración para la lista completa.
),
funciones as (
  select jsonb_agg(jsonb_build_object(
    'funcion', p.proname,
    'lenguaje', l.lanname,
    'security_definer', p.prosecdef,
    'search_path_fijo', p.proconfig
  )) as data
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  where n.nspname = 'public' and p.proname = 'set_sale_number'
  -- Esperado: 1 fila, security_definer=false, search_path_fijo debe
  -- contener algo como {search_path=public,pg_temp} (no null).
),
triggers as (
  select jsonb_agg(jsonb_build_object(
    'trigger', t.tgname,
    'tabla', c.relname,
    'funcion', p.proname,
    'habilitado', t.tgenabled <> 'D'
  )) as data
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal and c.relname = 'sales'
  -- Esperado: 1 fila, trigger=sales_set_sale_number, funcion=set_sale_number, habilitado=true.
),
contador_actual as (
  -- Lectura del ESTADO actual del contador (dato real, no solo esquema) —
  -- sigue siendo solo SELECT. Vacío es normal si todavía no se ha creado
  -- ninguna venta.
  select coalesce(jsonb_agg(jsonb_build_object('year', year, 'last_value', last_value) order by year), '[]'::jsonb) as data
  from public.sale_number_counters
),
ventas_de_prueba as (
  -- Detecta si quedaron ventas de prueba sin limpiar (ver
  -- docs/ventas-prueba-staging.sql) — deben aparecer solo mientras se está
  -- probando, nunca después de correr su bloque de limpieza.
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'sale_number', sale_number, 'customer_name', customer_name) order by created_at), '[]'::jsonb) as data
  from public.sales
  where customer_name like '%[TEST_VENTAS_STAGING]%'
)
select jsonb_build_object(
  'tablas', coalesce((select data from tablas), '[]'::jsonb),
  'columnas', coalesce((select data from columnas), '[]'::jsonb),
  'rls', coalesce((select data from rls), '[]'::jsonb),
  'policies', coalesce((select data from policies), '[]'::jsonb),
  'primary_keys', coalesce((select data from pk), '[]'::jsonb),
  'foreign_keys', coalesce((select data from fk), '[]'::jsonb),
  'constraints_check_unique', coalesce((select data from constraints_check_unique), '[]'::jsonb),
  'funciones', coalesce((select data from funciones), '[]'::jsonb),
  'triggers', coalesce((select data from triggers), '[]'::jsonb),
  'contador_sale_number', coalesce((select data from contador_actual), '[]'::jsonb),
  'ventas_de_prueba_sin_limpiar', coalesce((select data from ventas_de_prueba), '[]'::jsonb)
) as verificacion;
