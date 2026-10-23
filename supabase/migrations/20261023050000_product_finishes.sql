-- Acabados y configuración comercial por unidad, activación explícita por producto.
begin;
alter table public.products add column if not exists finishes_enabled boolean not null default false;
create table if not exists public.product_finishes (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id),
 base_color text not null check(length(btrim(base_color)) between 1 and 60),
 texture text not null check(length(btrim(texture)) between 1 and 100),
 name text not null check(length(btrim(name)) between 1 and 120),
 image_paths text[] not null default '{}', active boolean not null default true,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 unique(product_id,name)
);
alter table public.product_units
 add column if not exists finish_id uuid references public.product_finishes(id),
 add column if not exists commercial_configuration jsonb,
 add column if not exists commercial_price_cop bigint check(commercial_price_cop>0),
 add column if not exists commercial_signature text;
create index if not exists product_units_finish_available on public.product_units(product_id,finish_id,status);
alter table public.product_finishes enable row level security;
revoke all on public.product_finishes from anon,authenticated;
grant select on public.product_finishes to authenticated;
drop policy if exists product_finishes_internal on public.product_finishes;
create policy product_finishes_internal on public.product_finishes for select to authenticated using(public.erp_has_permission('inventory.read'));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('catalog-finishes','catalog-finishes',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;

create or replace function public.erp_unit_configuration(p_unit uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'cpu',u.spec_overrides->>'cpu',
  'ramGb',(select case when bool_and(c.component_attributes->>'capacityGb' is not null) then sum((c.component_attributes->>'capacityGb')::numeric) end from product_units c where c.installed_in_unit_id=u.id and c.asset_kind='ram'),
  'storage',coalesce((select jsonb_agg(jsonb_build_object('capacityGb',c.component_attributes->'capacityGb','technology',c.component_attributes->>'technology','formFactor',c.component_attributes->>'formFactor','interface',c.component_attributes->>'interface') order by c.unit_code) from product_units c where c.installed_in_unit_id=u.id and c.asset_kind='storage'),'[]'::jsonb),
  'screen',u.spec_overrides->>'screen'
 ) from public.product_units u where u.id=p_unit
$$;
revoke all on function public.erp_unit_configuration(uuid) from public,anon,authenticated;
create or replace function public.erp_unit_configuration_signature(p_unit uuid) returns text
language sql stable security definer set search_path=public,pg_temp as $$
 select md5(public.erp_unit_configuration(p_unit)::text)
$$;
revoke all on function public.erp_unit_configuration_signature(uuid) from public,anon,authenticated;

create or replace function public.erp_finish_guard() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if current_setting('erp.finish_write',true) is distinct from 'on' and (
  (tg_op='INSERT' and (new.finish_id is not null or new.commercial_configuration is not null or new.commercial_price_cop is not null or new.commercial_signature is not null)) or
  (tg_op='UPDATE' and (new.finish_id is distinct from old.finish_id or new.commercial_configuration is distinct from old.commercial_configuration or new.commercial_price_cop is distinct from old.commercial_price_cop or new.commercial_signature is distinct from old.commercial_signature))
 ) then raise exception 'finish_use_command'; end if;
 if new.finish_id is not null and not exists(select 1 from public.product_finishes where id=new.finish_id and product_id=new.product_id and active) then raise exception 'finish_product_mismatch'; end if;
 if new.workshop_managed and new.asset_kind='computer' and new.status in('available','reserved') and
  exists(select 1 from public.products where id=new.product_id and finishes_enabled) then
  if new.finish_id is null or new.commercial_configuration is null or new.commercial_price_cop is null or
   new.commercial_signature is distinct from public.erp_unit_configuration_signature(new.id) then raise exception 'commercial_validation_required'; end if;
 end if;
 return new;
end $$;
drop trigger if exists product_units_finish_guard on public.product_units;
create trigger product_units_finish_guard before insert or update on public.product_units for each row execute function public.erp_finish_guard();

create or replace function public.erp_finish_command(p_action text,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare u public.product_units%rowtype; f public.product_finishes%rowtype; v_id uuid; v_data jsonb; old_result public.workshop_operations%rowtype; v_config jsonb; v_path text;
begin
 perform public.erp_assert_permission('inventory.manage');
 if not exists(select 1 from public.erp_workshop_settings where enabled) then raise exception 'workshop_disabled'; end if;
 if p_key is null or p_payload is null then raise exception 'request_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,719));
 select * into old_result from public.workshop_operations where id=p_key;
 if found then
  if old_result.actor_id<>auth.uid() or old_result.action<>'finish.'||p_action or old_result.payload<>p_payload then raise exception 'idempotency_conflict'; end if;
  return old_result.result;
 end if;
 if p_action='create' then
  insert into public.product_finishes(product_id,base_color,texture,name,created_by)
   values((p_payload->>'productId')::uuid,btrim(p_payload->>'baseColor'),btrim(p_payload->>'texture'),btrim(p_payload->>'name'),auth.uid()) returning id into v_id;
  v_data:=jsonb_build_object('id',v_id);
 elsif p_action='photo' then
  select * into f from public.product_finishes where id=(p_payload->>'finishId')::uuid for update;
  if not found then raise exception 'finish_missing'; end if;
  v_path:=p_payload->>'path';
  if v_path !~ ('^'||f.id::text||'/[a-f0-9-]{36}\.(jpg|png|webp)$') or not exists(select 1 from storage.objects where bucket_id='catalog-finishes' and name=v_path) then raise exception 'photo_missing'; end if;
  if cardinality(f.image_paths)>=12 then raise exception 'max_12_photos'; end if;
  update public.product_finishes set image_paths=array_append(image_paths,v_path) where id=f.id;
  v_data:=jsonb_build_object('id',f.id);
 elsif p_action='publish' then
  perform public.erp_assert_permission('users.manage');
  v_id:=(p_payload->>'productId')::uuid;
  perform 1 from public.products where id=v_id for update;
  if not found then raise exception 'product_missing'; end if;
  if coalesce((p_payload->>'confirmed')::boolean,false)<>true then raise exception 'confirmation_required'; end if;
  if exists(select 1 from public.product_units pu left join public.product_finishes pf on pf.id=pu.finish_id where pu.product_id=v_id and pu.status='available' and
   (not pu.workshop_managed or pu.finish_id is null or not pf.active or cardinality(pf.image_paths)=0 or pu.commercial_price_cop is null or pu.commercial_configuration is null or pu.commercial_signature is distinct from public.erp_unit_configuration_signature(pu.id))) then raise exception 'available_units_require_validation_and_photos'; end if;
  if not exists(select 1 from public.product_units where product_id=v_id and status='available') then raise exception 'no_sellable_units'; end if;
  update public.products set finishes_enabled=true,visible_web=true where id=v_id;
  v_data:=jsonb_build_object('id',v_id,'published',true);
 elsif p_action='assign' then
  select * into u from public.product_units where id=(p_payload->>'unitId')::uuid for update;
  if not found or u.asset_kind<>'computer' or u.status in('sold','reserved','retired') then raise exception 'unit_not_editable'; end if;
  if u.row_version<>coalesce((p_payload->>'version')::bigint,-1) then raise exception 'workshop_version_conflict'; end if;
  select * into f from public.product_finishes where id=(p_payload->>'finishId')::uuid and active;
  if not found then raise exception 'finish_missing'; end if;
  v_config:=public.erp_unit_configuration(u.id);
  if coalesce((p_payload->>'confirmed')::boolean,false)<>true then raise exception 'configuration_confirmation_required'; end if;
  if (p_payload->>'priceCop')::bigint not between 1 and 999999999999 then raise exception 'commercial_price_invalid'; end if;
  if not public.erp_has_permission('sales.manage') and
   (p_payload->>'priceCop')::bigint is distinct from (select price from public.products where id=f.product_id) then raise exception 'price_permission_required' using errcode='42501'; end if;
  perform set_config('erp.workshop_write','on',true);
  perform set_config('erp.finish_write','on',true);
  update public.product_units set product_id=f.product_id,finish_id=f.id,
   commercial_configuration=v_config,commercial_price_cop=(p_payload->>'priceCop')::bigint,
   commercial_signature=public.erp_unit_configuration_signature(u.id),
   spec_overrides=spec_overrides||jsonb_build_object('color',f.base_color,'finish',f.name)
   where id=u.id;
  perform set_config('erp.workshop_write','off',true);
  perform set_config('erp.finish_write','off',true);
  v_data:=jsonb_build_object('id',u.id,'configuration',v_config);
 else raise exception 'action_invalid'; end if;
 insert into public.workshop_operations(id,actor_id,action,payload,result) values(p_key,auth.uid(),'finish.'||p_action,p_payload,v_data);
 insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,after_snapshot)
 values('web_admin',auth.uid()::text,'web','finish.'||p_action,'product_finish',coalesce(v_id,u.id,f.id),v_data);
 return v_data;
end $$;
revoke all on function public.erp_finish_command(text,jsonb,uuid) from public,anon;
grant execute on function public.erp_finish_command(text,jsonb,uuid) to authenticated;

create or replace function public.erp_finish_read(p_unit uuid,p_query text default '') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.erp_assert_permission('inventory.read');
 return jsonb_build_object('unit',(select jsonb_build_object('id',id,'version',row_version,'productId',product_id,'finishId',finish_id,'priceCop',commercial_price_cop::text) from public.product_units where id=p_unit),
  'draft',public.erp_unit_configuration(p_unit),
  'products',coalesce((select jsonb_agg(to_jsonb(p)) from(select id,title,brand,model,finishes_enabled from public.products where title ilike '%'||left(p_query,80)||'%' order by title limit 30)p),'[]'),
  'finishes',coalesce((select jsonb_agg(to_jsonb(f)) from(select f.* from public.product_finishes f join public.products p on p.id=f.product_id where f.active and p.title ilike '%'||left(p_query,80)||'%' order by f.name limit 100)f),'[]'));
end $$;
revoke all on function public.erp_finish_read(uuid,text) from public,anon;
grant execute on function public.erp_finish_read(uuid,text) to authenticated;

create or replace function public.catalog_finish_options(p_product uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('enabled',p.finishes_enabled,'options',coalesce((
  select jsonb_agg(to_jsonb(o)) from (
   select f.id as "finishId",f.name,f.base_color as "baseColor",f.texture,f.image_paths as "imagePaths",
    u.commercial_configuration as configuration,u.commercial_price_cop::text as "priceCop",count(*)::integer as stock
   from public.product_units u join public.product_finishes f on f.id=u.finish_id
   where u.product_id=p.id and f.product_id=p.id and p.finishes_enabled and f.active and cardinality(f.image_paths)>0 and
    u.asset_kind='computer' and u.status='available' and u.workshop_phase='ready' and u.commercial_configuration is not null and
    u.commercial_price_cop>0 and u.commercial_signature=public.erp_unit_configuration_signature(u.id)
   group by f.id,u.commercial_configuration,u.commercial_price_cop order by f.name,u.commercial_price_cop
  )o),'[]'::jsonb)) from public.products p where p.id=p_product and coalesce(p.visible_web,true)
$$;
revoke all on function public.catalog_finish_options(uuid) from public;
grant execute on function public.catalog_finish_options(uuid) to anon,authenticated,service_role;

-- La venta y su comprobante existente conservan la configuración DE LA UNIDAD,
-- no heredan RAM/disco/CPU del modelo. No cambia totales, descuentos ni emisión.
create or replace function public.erp_finish_sale_snapshot() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare u public.product_units%rowtype; f public.product_finishes%rowtype; cfg jsonb; disks text;
begin
 if new.product_unit_id is null then return new; end if;
 select * into u from public.product_units where id=new.product_unit_id;
 if u.finish_id is null then return new; end if;
 select * into f from public.product_finishes where id=u.finish_id;
 cfg:=u.commercial_configuration;
 if cfg is null or u.commercial_signature is distinct from public.erp_unit_configuration_signature(u.id) then raise exception 'commercial_validation_required'; end if;
 select string_agg(concat_ws(' ',coalesce(d->>'capacityGb','?')||' GB',d->>'technology',d->>'formFactor',d->>'interface'),' + ')
   into disks from jsonb_array_elements(coalesce(cfg->'storage','[]')) d;
 new.product_name:=new.product_name||' · '||f.name;
 new.product_specs:=jsonb_strip_nulls(jsonb_build_object('cpu',cfg->>'cpu','ram',cfg->'ramGb','screen',cfg->>'screen','storage',disks));
 new.product_description:=concat_ws(' · ',f.name,coalesce(cfg->>'cpu','CPU sin confirmar'),coalesce(cfg->>'ramGb','?')||' GB RAM',coalesce(disks,'Discos sin confirmar'));
 new.product_image:=null; -- no copiar foto genérica que podría ser de otro acabado
 new.unit_spec_overrides_snapshot:=u.spec_overrides||jsonb_build_object('finishId',f.id,'finish',f.name,'commercialConfiguration',cfg,'finishImagePaths',f.image_paths);
 new.original_unit_price_cop:=u.commercial_price_cop;
 return new;
end $$;
revoke all on function public.erp_finish_sale_snapshot() from public,anon,authenticated;
drop trigger if exists sale_items_finish_snapshot on public.sale_items;
create trigger sale_items_finish_snapshot before insert on public.sale_items for each row execute function public.erp_finish_sale_snapshot();
commit;
-- Rollback sin borrar acabados ni configuración: desactivar interfaz por producto
-- UPDATE public.products SET finishes_enabled=false WHERE id='<producto revisado>';
-- Primero revisar precio/especificaciones del producto legado; mantener controles del taller activos.
