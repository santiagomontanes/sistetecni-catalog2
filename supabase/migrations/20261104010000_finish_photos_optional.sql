-- Las fotos del acabado dejan de ser obligatorias: publicar y mostrar el acabado en el catálogo
-- solo exige unidad validada, precio y configuración. Las fotos siguen pudiendo subirse (opcional).
begin;
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
   (not pu.workshop_managed or pu.finish_id is null or not pf.active or pu.commercial_price_cop is null or pu.commercial_configuration is null or pu.commercial_signature is distinct from public.erp_unit_configuration_signature(pu.id))) then raise exception 'available_units_require_validation'; end if;
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

create or replace function public.catalog_finish_options(p_product uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('enabled',p.finishes_enabled,'options',coalesce((
  select jsonb_agg(to_jsonb(o)) from (
   select f.id as "finishId",f.name,f.base_color as "baseColor",f.texture,f.image_paths as "imagePaths",
    u.commercial_configuration as configuration,u.commercial_price_cop::text as "priceCop",count(*)::integer as stock
   from public.product_units u join public.product_finishes f on f.id=u.finish_id
   where u.product_id=p.id and f.product_id=p.id and p.finishes_enabled and f.active and
    u.asset_kind='computer' and u.status='available' and u.workshop_phase='ready' and u.commercial_configuration is not null and
    u.commercial_price_cop>0 and u.commercial_signature=public.erp_unit_configuration_signature(u.id)
   group by f.id,u.commercial_configuration,u.commercial_price_cop order by f.name,u.commercial_price_cop
  )o),'[]'::jsonb)) from public.products p where p.id=p_product and coalesce(p.visible_web,true)
$$;
revoke all on function public.catalog_finish_options(uuid) from public;
grant execute on function public.catalog_finish_options(uuid) to anon,authenticated,service_role;
commit;
notify pgrst, 'reload schema';
