-- ============================================================================
-- SISTETECNI · FASE 0 · Descubrimiento de esquema + seguridad (SOLO LECTURA)
--
-- Base: docs/fase2-descubrimiento-esquema.sql de ~/sistetecni-ai-agent (sin cambios)
-- Añadido: PK explícitas, índices, constraints CHECK/UNIQUE, triggers,
--          y policies de storage.objects (subida/borrado de archivos).
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Todo es SELECT. No modifica nada.
-- ============================================================================


-- ─── 1. TABLAS Y COLUMNAS DEL ESQUEMA PUBLIC ────────────────────────────────
select
  c.table_name,
  c.ordinal_position           as pos,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
from information_schema.columns c
join information_schema.tables t
  on t.table_schema = c.table_schema
 and t.table_name   = c.table_name
where c.table_schema = 'public'
  and t.table_type = 'BASE TABLE'
order by c.table_name, c.ordinal_position;


-- ─── 2. FOREIGN KEYS ─────────────────────────────────────────────────────
select
  tc.table_name        as tabla_origen,
  kcu.column_name      as columna_origen,
  ccu.table_name       as tabla_destino,
  ccu.column_name      as columna_destino,
  tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name
 and kcu.table_schema    = tc.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema    = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
order by tc.table_name;


-- ─── 2b. PRIMARY KEYS (añadido) ─────────────────────────────────────────────
select
  tc.table_name,
  kcu.column_name,
  tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name
 and kcu.table_schema    = tc.table_schema
where tc.constraint_type = 'PRIMARY KEY'
  and tc.table_schema = 'public'
order by tc.table_name;


-- ─── 2c. CHECK / UNIQUE CONSTRAINTS (añadido) ───────────────────────────────
select
  tc.table_name,
  tc.constraint_type,
  tc.constraint_name,
  cc.check_clause
from information_schema.table_constraints tc
left join information_schema.check_constraints cc
  on cc.constraint_name = tc.constraint_name
 and cc.constraint_schema = tc.table_schema
where tc.table_schema = 'public'
  and tc.constraint_type in ('CHECK', 'UNIQUE')
order by tc.table_name, tc.constraint_type;


-- ─── 2d. ÍNDICES (añadido) ───────────────────────────────────────────────────
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;


-- ─── 2e. TRIGGERS (añadido) ──────────────────────────────────────────────────
select
  event_object_table  as tabla,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table, trigger_name;


-- ─── 3. VISTAS ──────────────────────────────────────────────────────────────
select table_name, view_definition
from information_schema.views
where table_schema = 'public';


-- ─── 4. FUNCIONES / RPC ─────────────────────────────────────────────────────
select
  p.proname                                as funcion,
  pg_get_function_identity_arguments(p.oid) as argumentos,
  case p.provolatile
    when 'i' then 'immutable'
    when 's' then 'stable'
    when 'v' then 'volatile (puede escribir)'
  end                                       as volatilidad,
  pg_get_function_result(p.oid)             as retorna
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;


-- ─── 5. RLS: ESTADO Y POLICIES DE TABLAS ────────────────────────────────────
select
  c.relname                    as tabla,
  c.relrowsecurity             as rls_activado,
  c.relforcerowsecurity        as rls_forzado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

select
  schemaname, tablename, policyname,
  roles, cmd as operacion, qual as condicion_using, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;


-- ─── 6. MUESTRA DE DATOS (opcional — revisa antes de compartir) ────────────
-- select * from <TABLA_DE_PRODUCTOS> limit 3;


-- ─── 7. STORAGE: BUCKETS ─────────────────────────────────────────────────────
select id as bucket, name, public as es_publico, created_at,
       file_size_limit, allowed_mime_types
from storage.buckets;

select bucket_id, name as ruta
from storage.objects
limit 5;


-- ─── 7b. STORAGE: RLS Y POLICIES DE storage.objects (añadido) ───────────────
-- Esto es lo que realmente decide si un anónimo puede subir/borrar archivos.
select
  c.relname as tabla,
  c.relrowsecurity as rls_activado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'storage' and c.relname = 'objects';

select
  schemaname, tablename, policyname,
  roles, cmd as operacion, qual as condicion_using, with_check
from pg_policies
where schemaname = 'storage'
order by tablename, policyname;
