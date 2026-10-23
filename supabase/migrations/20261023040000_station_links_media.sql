-- Vinculación explícita por pestaña y sesión autenticada; nunca por canal global.
-- Depende de taller (row_version). No modifica registros históricos.
begin;
create table if not exists public.erp_station_links (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
 station text not null check(length(station) between 1 and 80),
 desktop_session text not null, mobile_session text,
 desktop_hash text not null, mobile_hash text, code_hash text not null,
 pair_until timestamptz not null default now()+interval '5 minutes',
 expires_at timestamptz not null default now()+interval '8 hours', revoked_at timestamptz,
 unit_id uuid references public.product_units(id), revision bigint not null default 0,
 created_at timestamptz not null default now()
);
create unique index if not exists erp_station_links_code on public.erp_station_links(code_hash);
create index if not exists erp_station_links_expiry on public.erp_station_links(expires_at);
alter table public.erp_station_links enable row level security;
revoke all on public.erp_station_links from anon,authenticated;

create or replace function public.erp_station_link(p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v public.erp_station_links%rowtype; v_token text; v_code text; v_session text:=auth.jwt()->>'session_id'; v_unit uuid;
begin
 perform public.erp_assert_permission('inventory.read');
 if not exists(select 1 from public.erp_workshop_settings where enabled) then raise exception 'workshop_disabled'; end if;
 if nullif(v_session,'') is null then raise exception 'authenticated_session_required' using errcode='42501'; end if;
 if p_action='create' then
  if (select count(*) from public.erp_station_links where owner_id=auth.uid() and revoked_at is null and expires_at>now())>=10 then raise exception 'too_many_active_links'; end if;
  v_token:=encode(gen_random_bytes(32),'hex'); v_code:=upper(encode(gen_random_bytes(8),'hex'));
  insert into public.erp_station_links(owner_id,station,desktop_session,desktop_hash,code_hash)
   values(auth.uid(),btrim(p_payload->>'station'),v_session,encode(digest(v_token,'sha256'),'hex'),encode(digest(v_code,'sha256'),'hex')) returning * into v;
  return jsonb_build_object('id',v.id,'token',v_token,'code',v_code,'pairUntil',v.pair_until,'expiresAt',v.expires_at);
 elsif p_action='join' then
  select * into v from public.erp_station_links where code_hash=encode(digest(upper(btrim(p_payload->>'code')),'sha256'),'hex') for update;
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
 elsif p_action='revoke' then
  update public.erp_station_links set revoked_at=now() where id=v.id;
  return jsonb_build_object('revoked',true);
 elsif p_action<>'read' then raise exception 'invalid_action'; end if;
 return jsonb_build_object('id',v.id,'station',v.station,'unitId',v.unit_id,'paired',v.mobile_session is not null,
  'revision',v.revision,'unitVersion',(select row_version from public.product_units where id=v.unit_id),'expiresAt',v.expires_at);
end $$;
revoke all on function public.erp_station_link(text,jsonb) from public,anon;
grant execute on function public.erp_station_link(text,jsonb) to authenticated;

create table if not exists public.erp_unit_photos (
 id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.product_units(id),
 path text not null unique, mime text not null check(mime in ('image/jpeg','image/png','image/webp')),
 bytes integer not null check(bytes>0 and bytes<=5242880), created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
alter table public.erp_unit_photos add column if not exists context text not null default 'technical' check(context in('reception','technical','aesthetic','final_check'));
alter table public.erp_unit_photos add column if not exists receipt_id uuid references public.workshop_receipts(id);
create index if not exists erp_unit_photos_unit on public.erp_unit_photos(unit_id,created_at);
alter table public.erp_unit_photos enable row level security;
revoke all on public.erp_unit_photos from anon,authenticated;
grant select on public.erp_unit_photos to authenticated;
drop policy if exists erp_unit_photos_read on public.erp_unit_photos;
create policy erp_unit_photos_read on public.erp_unit_photos for select to authenticated using(public.erp_has_permission('inventory.read'));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('workshop-private','workshop-private',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
-- Solo servidor validado escribe objetos. Ninguna URL pública ni upload directo.
create or replace function public.erp_unit_photo_add(p_unit uuid,p_path text,p_mime text,p_bytes integer)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_phase text; v_receipt uuid;
begin
 perform public.erp_assert_permission('inventory.manage');
 if not exists(select 1 from public.erp_workshop_settings where enabled) then raise exception 'workshop_disabled'; end if;
 select workshop_phase into v_phase from public.product_units where id=p_unit for update;
 if not found then raise exception 'unit_not_found'; end if;
 if p_path !~ ('^units/'||p_unit::text||'/[a-f0-9-]{36}\.(jpg|png|webp)$') then raise exception 'invalid_photo_path'; end if;
 if not exists(select 1 from storage.objects where bucket_id='workshop-private' and name=p_path) then raise exception 'photo_upload_missing'; end if;
 if v_phase in('reception','warehouse') then select id into v_receipt from public.workshop_receipts where unit_id=p_unit and correction_of is null order by created_at limit 1; end if;
 insert into public.erp_unit_photos(unit_id,path,mime,bytes,created_by,context,receipt_id)
 values(p_unit,p_path,p_mime,p_bytes,auth.uid(),case when v_receipt is not null then 'reception' when v_phase='aesthetic' then 'aesthetic' when v_phase='final_check' then 'final_check' else 'technical' end,v_receipt) returning id into v_id;
 update public.product_units set updated_at=now() where id=p_unit;
 insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,metadata)
 values('web_admin',auth.uid()::text,'web','unit.photo.add','product_unit',p_unit,jsonb_build_object('photoId',v_id));
 return v_id;
end $$;
revoke all on function public.erp_unit_photo_add(uuid,text,text,integer) from public,anon;
grant execute on function public.erp_unit_photo_add(uuid,text,text,integer) to authenticated;
commit;
-- Desactivación sin borrado: deshabilitar erp_workshop_settings.enabled y revocar vínculos.
-- UPDATE public.erp_station_links SET revoked_at=now() WHERE revoked_at IS NULL;
-- Conservar tabla de referencias y bucket privado; no borrar evidencia para revertir la UI.
