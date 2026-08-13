-- Migración de SEGURIDAD — Fase 0.1 aplicada a producción (Fase 2B/B8).
--
-- Bloques A + B + C + D de docs/fase0.1-correccion-propuesta.sql, con el
-- texto EXACTO verificado contra la auditoría real de producción
-- (docs/00-auditoria-supabase.md / docs/00-auditoria-supabase-raw.json).
-- Bloque E (limpieza de policy redundante en profiles) queda FUERA
-- deliberadamente — no tiene relación con el personalizador, cero
-- urgencia, se aplicará aparte si se decide. Decisiones cerradas en
-- docs/fase2b-b8-decisiones-cerradas.md.
--
-- IDEMPOTENTE a propósito (drop policy if exists antes de cada create):
-- STAGING ya tiene el resultado final de estos mismos bloques desde su
-- baseline (20260812220000) — si esta migración llegara a correr también
-- ahí, no debe fallar por "la policy ya existe", solo la recrea
-- idéntica, sin efecto funcional.
--
-- Orden de aplicación en PRODUCCIÓN: 2 de 7 (después de la adopción,
-- antes de las tablas nuevas del personalizador — quote_requests
-- necesita depender de un products confiable, no de uno que cualquiera
-- pueda alterar desde la consola del navegador).

-- ============================================================================
-- BLOQUE A — products: eliminar la policy que abre escritura a cualquiera
-- Corrige: CRÍTICA #1
-- ============================================================================

drop policy if exists "service_role full access" on public.products;

-- Nota: NO se recrea apuntando a "to service_role" — ese rol tiene
-- BYPASSRLS en Supabase, ignora RLS con o sin policy.

-- ---- ROLLBACK BLOQUE A ----
-- create policy "service_role full access" on public.products
--   for all to public using (true) with check (true);


-- ============================================================================
-- BLOQUE B — gallery_images: activar RLS + policies correctas
-- Corrige: CRÍTICA #2
-- ============================================================================

alter table public.gallery_images enable row level security;

drop policy if exists "gallery_images public read" on public.gallery_images;
create policy "gallery_images public read"
  on public.gallery_images
  for select
  to public
  using (true);

drop policy if exists "gallery_images admin write" on public.gallery_images;
create policy "gallery_images admin write"
  on public.gallery_images
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- ---- ROLLBACK BLOQUE B ----
-- drop policy if exists "gallery_images public read" on public.gallery_images;
-- drop policy if exists "gallery_images admin write" on public.gallery_images;
-- alter table public.gallery_images disable row level security;


-- ============================================================================
-- BLOQUE C — storage.objects, bucket 'products': restringir ESCRITURA a
-- administradores, conservando la LECTURA pública
-- Corrige: ALTA #1
-- ============================================================================

drop policy if exists "Allow uploads to products bucket 1ifhysk_0" on storage.objects; -- INSERT original
drop policy if exists "Allow uploads to products bucket 1ifhysk_2" on storage.objects; -- UPDATE original
drop policy if exists "Allow uploads to products bucket 1ifhysk_3" on storage.objects; -- DELETE original

drop policy if exists "products bucket admin insert" on storage.objects;
create policy "products bucket admin insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'products'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

drop policy if exists "products bucket admin update" on storage.objects;
create policy "products bucket admin update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'products'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

drop policy if exists "products bucket admin delete" on storage.objects;
create policy "products bucket admin delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'products'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- Policy de SELECT ("...1ifhysk_1") NO se toca — lectura ya es pública
-- por el bucket, y no hay motivo de seguridad para restringirla.

-- ---- ROLLBACK BLOQUE C ----
-- drop policy if exists "products bucket admin insert" on storage.objects;
-- drop policy if exists "products bucket admin update" on storage.objects;
-- drop policy if exists "products bucket admin delete" on storage.objects;
--
-- create policy "Allow uploads to products bucket 1ifhysk_0"
--   on storage.objects for insert to authenticated
--   with check (bucket_id = 'products');
-- create policy "Allow uploads to products bucket 1ifhysk_2"
--   on storage.objects for update to authenticated
--   using (bucket_id = 'products');
-- create policy "Allow uploads to products bucket 1ifhysk_3"
--   on storage.objects for delete to authenticated
--   using (bucket_id = 'products');


-- ============================================================================
-- BLOQUE D — storage.objects, buckets 'gallery' y 'assets': agregar
-- policies de escritura restringidas a administradores.
--
-- Resuelto por código + datos ya auditados (docs/fase2b-b8-decisiones-
-- cerradas.md, decisión C): storage.objects tiene RLS activado
-- globalmente y estos 2 buckets NO tienen ninguna policy propia — la
-- subida desde /admin/galeria (bucket 'gallery') y /admin/configuracion +
-- /admin/media (bucket 'assets', logo y video) debería estar fallando en
-- producción ahora mismo. Este bloque no restringe algo que funciona:
-- corrige algo que ya está roto.
-- ============================================================================

drop policy if exists "gallery bucket admin write" on storage.objects;
create policy "gallery bucket admin write"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'gallery'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    bucket_id = 'gallery'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

drop policy if exists "assets bucket admin write" on storage.objects;
create policy "assets bucket admin write"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'assets'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    bucket_id = 'assets'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- ---- ROLLBACK BLOQUE D ----
-- drop policy if exists "gallery bucket admin write" on storage.objects;
-- drop policy if exists "assets bucket admin write" on storage.objects;

-- ============================================================================
-- FIN — Bloque E (profiles, policy redundante) queda fuera a propósito.
-- ============================================================================
