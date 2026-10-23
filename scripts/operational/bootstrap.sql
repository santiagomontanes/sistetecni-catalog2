-- SOLO Docker de pruebas: emula los contratos de identidad/Storage de Supabase.
-- El dominio ERP se crea exclusivamente ejecutando las migraciones reales.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema storage;
create schema extensions;
create extension if not exists pgcrypto with schema extensions;
create function auth.uid() returns uuid language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
 (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid
$$;
create function auth.role() returns text language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
 (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'))
$$;
create function auth.jwt() returns jsonb language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$$;
create table auth.users(id uuid primary key, email text);
create table storage.buckets(id text primary key, name text, public boolean default false,
 file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text,
 name text, owner uuid, metadata jsonb, created_at timestamptz default now());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
 select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]
$$;
grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
grant select on auth.users to service_role;
grant all on all tables in schema storage to service_role;
grant select,insert,update,delete on storage.objects to authenticated;
grant select on storage.objects to anon;
-- Supabase tiene estos privilegios por defecto; RLS sigue decidiendo acceso.
alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,service_role;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant usage,select on sequences to authenticated,service_role;
grant execute on all functions in schema auth to anon,authenticated,service_role;
