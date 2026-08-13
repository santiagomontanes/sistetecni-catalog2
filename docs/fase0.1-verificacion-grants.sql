-- ============================================================================
-- SISTETECNI · FASE 0.1 · Verificación de GRANTs efectivos (SOLO LECTURA)
--
-- Por qué existe este script: la policy RLS por sí sola no autoriza nada
-- si el rol no tiene ya el privilegio SQL base (GRANT) sobre la tabla. La
-- Fase 0 asumió, por comportamiento estándar documentado de Supabase, que
-- anon/authenticated tienen INSERT/UPDATE/DELETE en products — pero no lo
-- confirmó con datos. Este script cierra esa duda con evidencia directa.
--
-- Una sola sentencia SELECT (con CTEs de solo lectura), un solo resultado:
-- 1 fila, 1 columna JSONB. NO otorga ni revoca privilegios, NO toca RLS,
-- NO toca policies, NO modifica nada.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run → Export
-- ============================================================================

with

objetivos as (
  select 'public'::text as esquema, 'products'::text as tabla
  union all select 'public', 'gallery_images'
  union all select 'public', 'business_profile'
  union all select 'public', 'profiles'
  union all select 'public', 'testimonials'
  union all select 'storage', 'objects'
),

-- NOTA: information_schema usa el literal 'PUBLIC' en MAYÚSCULA para el
-- pseudo-rol; pg_catalog (nuestra sección B) lo devuelve como 'public' en
-- minúscula por construcción propia (ver coalesce más abajo). Se incluyen
-- ambas formas para no perder ninguna fila por diferencia de mayúsculas.
roles_interes as (
  select unnest(array['anon','authenticated','service_role','public','PUBLIC']) as rol
),

-- ─── A. Privilegios vía information_schema (vista estándar del SQL) ────────
grants_information_schema as (
  select jsonb_agg(
    jsonb_build_object(
      'grantee',        g.grantee,
      'schema',         g.table_schema,
      'tabla',          g.table_name,
      'privilege_type', g.privilege_type,
      'is_grantable',   g.is_grantable,
      'grantor',        g.grantor
    ) order by g.table_schema, g.table_name, g.grantee, g.privilege_type
  ) as data
  from information_schema.role_table_grants g
  join objetivos o
    on o.esquema = g.table_schema and o.tabla = g.table_name
  where g.grantee in (select rol from roles_interes)
),

-- ─── B. ACL cruda vía pg_catalog (aclexplode) ───────────────────────────────
-- Cubre un caso que information_schema puede ocultar en silencio: si
-- relacl ES NULL (nunca se ejecutó ningún GRANT/REVOKE explícito sobre esa
-- tabla), role_table_grants simplemente no devuelve ninguna fila para ella
-- — lo cual NO significa "sin acceso", significa "aplican los privilegios
-- por defecto de Postgres". La sección siguiente (tablas_sin_acl_explicito)
-- señala explícitamente si algún objetivo está en ese caso.
acl_base as (
  select
    n.nspname as esquema,
    c.relname as tabla,
    c.relacl,
    (c.relacl is null) as sin_acl_explicito
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join objetivos o on o.esquema = n.nspname and o.tabla = c.relname
  where c.relkind = 'r'
),
acl_expandida as (
  select
    a.esquema,
    a.tabla,
    coalesce(r.rolname, 'public') as grantee,
    ae.privilege_type,
    ae.is_grantable
  from acl_base a
  cross join lateral aclexplode(a.relacl) as ae
  left join pg_roles r on r.oid = ae.grantee
  where a.relacl is not null
),
grants_pg_catalog as (
  select jsonb_agg(
    jsonb_build_object(
      'schema',         esquema,
      'tabla',          tabla,
      'grantee',        grantee,
      'privilege_type', privilege_type,
      'is_grantable',   is_grantable
    ) order by esquema, tabla, grantee, privilege_type
  ) as data
  from acl_expandida
  where grantee in (select rol from roles_interes)
),
tablas_sin_acl_explicito as (
  select jsonb_agg(
    jsonb_build_object(
      'schema', esquema,
      'tabla',  tabla,
      'nota',   'relacl IS NULL: sin GRANT explícito registrado. Aplican los privilegios por defecto de Postgres (el dueño de la tabla tiene todos los privilegios; PUBLIC no tiene ninguno) salvo que existan ALTER DEFAULT PRIVILEGES a nivel de esquema que no se reflejan aquí.'
    ) order by esquema, tabla
  ) as data
  from acl_base
  where sin_acl_explicito
),

-- ─── C. has_table_privilege(): resuelve herencia de roles automáticamente,
--        es la señal más confiable de "puede o no puede, ahora mismo" ─────
-- NOTA: 'public' NO es un rol real en pg_roles — has_table_privilege exige
-- un rol existente, así que aquí solo se prueban los 3 roles reales de
-- Supabase: anon, authenticated, service_role.
matriz_has_privilege as (
  select jsonb_agg(fila) as data
  from (
    select jsonb_build_object(
      'rol',    roles_reales.rol,
      'tabla',  o.esquema || '.' || o.tabla,
      'select', has_table_privilege(roles_reales.rol, format('%I.%I', o.esquema, o.tabla), 'SELECT'),
      'insert', has_table_privilege(roles_reales.rol, format('%I.%I', o.esquema, o.tabla), 'INSERT'),
      'update', has_table_privilege(roles_reales.rol, format('%I.%I', o.esquema, o.tabla), 'UPDATE'),
      'delete', has_table_privilege(roles_reales.rol, format('%I.%I', o.esquema, o.tabla), 'DELETE')
    ) as fila
    from objetivos o
    cross join (select unnest(array['anon','authenticated','service_role']) as rol) roles_reales
    order by o.esquema, o.tabla, roles_reales.rol
  ) x
),

-- ─── D. Atributos de los roles mismos ───────────────────────────────────────
-- Confirma o corrige, con evidencia real, si service_role efectivamente
-- tiene BYPASSRLS (lo cual haría innecesaria cualquier policy dirigida a
-- ese rol) en vez de asumirlo por comportamiento estándar de Supabase.
atributos_roles as (
  select jsonb_agg(
    jsonb_build_object(
      'rol',            rolname,
      'rolsuper',       rolsuper,
      'rolbypassrls',   rolbypassrls,
      'rolcanlogin',    rolcanlogin,
      'rolcreaterole',  rolcreaterole,
      'rolcreatedb',    rolcreatedb,
      'rolreplication', rolreplication
    ) order by rolname
  ) as data
  from pg_roles
  where rolname in ('anon','authenticated','service_role')
)

select jsonb_build_object(
  'generado_en',                now(),
  'grants_information_schema',  coalesce((select data from grants_information_schema), '[]'::jsonb),
  'grants_pg_catalog',           coalesce((select data from grants_pg_catalog),          '[]'::jsonb),
  'tablas_sin_acl_explicito',    coalesce((select data from tablas_sin_acl_explicito),   '[]'::jsonb),
  'matriz_has_table_privilege',  coalesce((select data from matriz_has_privilege),       '[]'::jsonb),
  'atributos_roles',             coalesce((select data from atributos_roles),            '[]'::jsonb)
) as verificacion_grants;
