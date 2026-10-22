-- P20.29 — comprobación posterior a aplicar las dos migraciones del color.
-- Solo lectura. Cada fila dice OK o FALLA.
with c as (
  select
    count(*) filter (where column_name='color') as col_color,
    count(*) filter (where column_name='colores_disponibles') as col_cd
  from information_schema.columns
  where table_schema='public' and table_name='products'
),
t as (
  select count(*) filter (where tgname='product_units_sync_colors') as t_units,
         count(*) filter (where tgname='products_sync_colors') as t_prod
  from pg_trigger where not tgisinternal
),
f as (
  select count(*) filter (where proname='erp_unit_color') as f_unit,
         count(*) filter (where proname='erp_sync_product_colors') as f_sync
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
),
d as (
  select pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='erp_agent_dispatch'
    and oidvectortypes(p.proargtypes)='uuid, text, jsonb, uuid' limit 1
),
b as (
  select count(*) as total,
         count(*) filter (where colores_disponibles is not null) as con_array,
         count(*) filter (where cardinality(colores_disponibles) > 0) as con_colores
  from public.products
),
m as (
  select count(*) filter (where version='20261021200000') as m1,
         count(*) filter (where version='20261021220000') as m2
  from supabase_migrations.schema_migrations
)
select 'products.color existe'            as comprobacion, case when c.col_color=1 then 'OK' else 'FALLA' end as r from c
union all select 'products.colores_disponibles existe', case when c.col_cd=1 then 'OK' else 'FALLA' end from c
union all select 'trigger product_units_sync_colors',   case when t.t_units=1 then 'OK' else 'FALLA' end from t
union all select 'trigger products_sync_colors',        case when t.t_prod=1 then 'OK' else 'FALLA' end from t
union all select 'funcion erp_unit_color',              case when f.f_unit=1 then 'OK' else 'FALLA' end from f
union all select 'funcion erp_sync_product_colors',     case when f.f_sync=1 then 'OK' else 'FALLA' end from f
union all select 'erp_sync_product_colors toma candado',case when (select position('for update' in prosrc)>0 from pg_proc where proname='erp_sync_product_colors') then 'OK' else 'FALLA' end
union all select 'dispatch acepta color',               case when (select position('''condition'', ''description'', ''color''' in def)>0 from d) then 'OK' else 'FALLA' end
union all select 'dispatch NO expone colores_disponibles', case when (select position('colores_disponibles' in def)=0 from d) then 'OK' else 'FALLA' end
union all select 'dispatch conserva unknown_fields',     case when (select position('catalog_product_update_unknown_fields' in def)>0 from d) then 'OK' else 'FALLA' end
union all select 'dispatch conserva invalid_description', case when (select position('catalog_product_update_invalid_description' in def)>0 from d) then 'OK' else 'FALLA' end
union all select 'backfill: ningun array nulo',          case when b.total=b.con_array then 'OK' else 'FALLA' end from b
union all select 'migracion 20261021200000 registrada',  case when m.m1=1 then 'OK' else 'PENDIENTE DE REGISTRAR' end from m
union all select 'migracion 20261021220000 registrada',  case when m.m2=1 then 'OK' else 'PENDIENTE DE REGISTRAR' end from m
union all select 'productos con algun color disponible', (select con_colores::text || ' de ' || total::text from b);
