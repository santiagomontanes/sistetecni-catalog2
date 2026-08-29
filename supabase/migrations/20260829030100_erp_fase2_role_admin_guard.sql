-- Fase 2D: compatibilidad del rol admin con módulos históricos + protección del último admin.
create or replace function public.erp_set_profile_role(
  p_profile_id uuid,p_role text,p_display_name text default null,p_active boolean default true
) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid();
  v_role text:=lower(btrim(coalesce(p_role,'')));
  v_active boolean:=coalesce(p_active,true);
  v_current_role text;
  v_current_active boolean;
begin
  if v_actor is null or not exists(select 1 from public.profiles p where p.id=v_actor and p.active=true and p.erp_role='admin') then
    raise exception 'erp_users_admin_required' using errcode='42501';
  end if;
  if v_role not in ('admin','supervisor','vendedor','tecnico','caja','bodega','viewer') then raise exception 'invalid_erp_role'; end if;
  select erp_role,active into v_current_role,v_current_active from public.profiles where id=p_profile_id for update;
  if not found then raise exception 'profile_not_found'; end if;
  if v_current_role='admin' and v_current_active=true and (v_role<>'admin' or v_active=false)
     and (select count(*) from public.profiles where erp_role='admin' and active=true)<=1 then
    raise exception 'last_active_admin_required';
  end if;
  update public.profiles set
    erp_role=v_role,
    is_admin=(v_role='admin' and v_active=true),
    display_name=nullif(btrim(coalesce(p_display_name,'')),''),
    active=v_active,
    updated_at=now()
  where id=p_profile_id;
  return p_profile_id;
end;$$;
revoke all on function public.erp_set_profile_role(uuid,text,text,boolean) from public,anon;
grant execute on function public.erp_set_profile_role(uuid,text,text,boolean) to authenticated;
