-- Una sola sesión abierta por usuario: al iniciar sesión se cierran las demás sesiones de esa misma persona.
-- Personas distintas no se afectan entre sí. Excepciones: (a) sesiones que forman parte de un vínculo
-- computador-celular vigente (lector remoto de QR) y (b) mientras exista un vínculo pendiente de canje
-- (el celular está iniciando sesión para vincularse).
begin;
create or replace function public.erp_claim_single_session()
returns integer language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_user uuid:=auth.uid(); v_session text:=auth.jwt()->>'session_id'; v_closed integer:=0;
begin
 if v_user is null or nullif(v_session,'') is null then raise exception 'authenticated_session_required' using errcode='42501'; end if;
 if exists(select 1 from public.erp_station_links l where l.owner_id=v_user and l.revoked_at is null and l.mobile_session is null and l.pair_until>now() and l.expires_at>now()) then
  return 0;
 end if;
 with gone as (
  delete from auth.sessions s
  where s.user_id=v_user and s.id::text<>v_session
    and not exists(select 1 from public.erp_station_links l where l.owner_id=v_user and l.revoked_at is null and l.expires_at>now() and v_session is not null and s.id::text in (l.desktop_session,coalesce(l.mobile_session,'')))
  returning 1)
 select count(*) into v_closed from gone;
 return v_closed;
end $$;
revoke all on function public.erp_claim_single_session() from public,anon;
grant execute on function public.erp_claim_single_session() to authenticated;
commit;
notify pgrst, 'reload schema';
