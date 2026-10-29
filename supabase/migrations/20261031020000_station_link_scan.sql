-- El celular vinculado envía lo que escanea y el computador lo recibe (el lector del computador se extiende al celular).
begin;
alter table public.erp_station_links add column if not exists last_scan text, add column if not exists last_scan_seq bigint not null default 0, add column if not exists last_scan_at timestamptz;
create or replace function public.erp_station_link(p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v public.erp_station_links%rowtype; v_token text; v_code text; v_session text:=auth.jwt()->>'session_id'; v_unit uuid;
begin
 perform public.erp_assert_permission('inventory.read');
 if not exists(select 1 from public.erp_workshop_settings where enabled) then raise exception 'workshop_disabled'; end if;
 if nullif(v_session,'') is null then raise exception 'authenticated_session_required' using errcode='42501'; end if;
 if p_action='create' then
  if (select count(*) from public.erp_station_links where owner_id=auth.uid() and revoked_at is null and expires_at>now())>=10 then raise exception 'too_many_active_links'; end if;
  v_token:=encode(gen_random_bytes(32),'hex'); for i in 1..30 loop
   v_code:=lpad(((get_byte(gen_random_bytes(4),0)*16777216::bigint+get_byte(gen_random_bytes(4),1)*65536+get_byte(gen_random_bytes(4),2)*256+get_byte(gen_random_bytes(4),3)) % 100000)::text,5,'0');
   exit when not exists(select 1 from public.erp_station_links where code_hash=encode(digest(v_code,'sha256'),'hex') and revoked_at is null and mobile_session is null and pair_until>now());
   v_code:=null;
  end loop;
  if v_code is null then raise exception 'link_code_unavailable'; end if;
  insert into public.erp_station_links(owner_id,station,desktop_session,desktop_hash,code_hash)
   values(auth.uid(),btrim(p_payload->>'station'),v_session,encode(digest(v_token,'sha256'),'hex'),encode(digest(v_code,'sha256'),'hex')) returning * into v;
  return jsonb_build_object('id',v.id,'token',v_token,'code',v_code,'pairUntil',v.pair_until,'expiresAt',v.expires_at);
 elsif p_action='join' then
  select * into v from public.erp_station_links where code_hash=encode(digest(upper(btrim(p_payload->>'code')),'sha256'),'hex') and owner_id=auth.uid() and revoked_at is null and mobile_session is null and pair_until>now() and expires_at>now() order by created_at desc limit 1 for update;
  if not found or v.owner_id<>auth.uid() or v.revoked_at is not null or v.pair_until<=now() or v.expires_at<=now() or v.mobile_session is not null then raise exception 'link_invalid_or_expired' using errcode='42501'; end if;
  v_token:=encode(gen_random_bytes(32),'hex');
  update public.erp_station_links set mobile_session=v_session,mobile_hash=encode(digest(v_token,'sha256'),'hex'),revision=revision+1 where id=v.id;
  return jsonb_build_object('id',v.id,'token',v_token,'expiresAt',v.expires_at);
 end if;
 select * into v from public.erp_station_links where id=(p_payload->>'id')::uuid for update;
 if not found or v.owner_id<>auth.uid() or v.revoked_at is not null or v.expires_at<=now() or not coalesce((
  (v.desktop_session=v_session and v.desktop_hash=encode(digest(p_payload->>'token','sha256'),'hex')) or
  (v.mobile_session=v_session and v.mobile_hash=encode(digest(p_payload->>'token','sha256'),'hex'))
 ),false) then raise exception 'link_invalid_or_expired' using errcode='42501'; end if;
 if p_action='select' then
  v_unit:=(p_payload->>'unitId')::uuid;
  if not exists(select 1 from public.product_units where id=v_unit) then raise exception 'unit_not_found'; end if;
  update public.erp_station_links set unit_id=v_unit,revision=revision+1 where id=v.id returning * into v;
 elsif p_action='scan' then
  if v.mobile_session is null then raise exception 'link_not_paired'; end if;
  if length(btrim(p_payload->>'value')) not between 1 and 300 or btrim(p_payload->>'value') ~ '[[:cntrl:]]' then raise exception 'scan_invalid'; end if;
  update public.erp_station_links set last_scan=btrim(p_payload->>'value'),last_scan_seq=last_scan_seq+1,last_scan_at=now(),revision=revision+1 where id=v.id returning * into v;
 elsif p_action='revoke' then
  update public.erp_station_links set revoked_at=now() where id=v.id;
  return jsonb_build_object('revoked',true);
 elsif p_action<>'read' then raise exception 'invalid_action'; end if;
 return jsonb_build_object('id',v.id,'station',v.station,'unitId',v.unit_id,'paired',v.mobile_session is not null,
  'scan',v.last_scan,'scanSeq',v.last_scan_seq,'role',case when v.desktop_session=v_session then 'desktop' else 'mobile' end,
  'revision',v.revision,'unitVersion',(select row_version from public.product_units where id=v.unit_id),'expiresAt',v.expires_at);
end $$;
revoke all on function public.erp_station_link(text,jsonb) from public,anon;
grant execute on function public.erp_station_link(text,jsonb) to authenticated;
commit;
notify pgrst, 'reload schema';
