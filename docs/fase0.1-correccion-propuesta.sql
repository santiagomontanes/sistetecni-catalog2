-- ============================================================================
-- SISTETECNI · FASE 0.1 · Corrección de seguridad PROPUESTA (NO EJECUTADA)
--
-- Este archivo es una PROPUESTA para revisión. NO fue ejecutado contra
-- Supabase. NO lo ejecutes tampoco tú hasta revisarlo bloque por bloque.
--
-- Basado en el resultado REAL de docs/fase0-descubrimiento-export.sql
-- ejecutado en producción el 2026-08-13.
--
-- Cada bloque:
--   - dice qué vulnerabilidad de docs/00-auditoria-supabase.md corrige
--   - solo toca POLICIES y RLS — ninguna columna, ninguna tabla, ningún dato
--   - incluye su propio ROLLBACK comentado, con los valores EXACTOS
--     capturados en la auditoría real (no inventados)
--
-- Orden recomendado de aplicación: A, B, C son las urgentes (CRÍTICA/ALTA).
-- D y E son de menor prioridad — revisar la nota de cada una antes de aplicar.
-- ============================================================================


-- ============================================================================
-- BLOQUE A — products: eliminar la policy que abre escritura a cualquiera
-- Corrige: CRÍTICA #1 (docs/00-auditoria-supabase.md §8)
--
-- Hoy: "service_role full access" tiene roles=["public"], comando ALL,
-- using=true, with_check=true. En Postgres, el pseudo-rol "public" en una
-- policy significa "aplica a CUALQUIER rol" — incluye anon y authenticated,
-- no solo a quien la policy dice que va dirigida por su nombre. Como las
-- policies permissive se combinan con OR, con que ESTA sea aplicable ya
-- basta para autorizar el INSERT/UPDATE/DELETE, sin importar que la policy
-- "products admin write" exija is_admin=true en paralelo.
--
-- Después de este bloque: seguirán existiendo, SIN TOCAR:
--   - "products public read"  (public, SELECT, using true)      → catálogo sigue igual
--   - "products admin write"  (authenticated, ALL, is_admin=true) → admin sigue igual
-- ============================================================================

drop policy if exists "service_role full access" on public.products;

-- Nota: NO se recrea apuntando a "to service_role" porque no hace falta.
-- El rol service_role tiene BYPASSRLS activado a nivel de Postgres en
-- Supabase: ignora TODAS las políticas RLS de cualquier tabla, con o sin
-- policy explícita. Una policy para service_role nunca es necesaria.

-- ---- ROLLBACK BLOQUE A (recrear exactamente como estaba en producción) ----
-- create policy "service_role full access" on public.products
--   for all
--   to public
--   using (true)
--   with check (true);


-- ============================================================================
-- BLOQUE B — gallery_images: activar RLS + policies correctas
-- Corrige: CRÍTICA #2 (docs/00-auditoria-supabase.md §8)
--
-- Hoy: rls_activado = false y CERO policies. Con RLS desactivado, cualquier
-- rol con permiso SQL base sobre la tabla (anon/authenticated, por defecto
-- en Supabase) tiene acceso sin ningún filtro por fila ni por operación.
--
-- Después de este bloque: lectura pública se mantiene (galería visible en
-- el sitio), escritura queda restringida a profiles.is_admin = true — el
-- mismo patrón que ya usan products, testimonials y business_profile.
-- ============================================================================

alter table public.gallery_images enable row level security;

create policy "gallery_images public read"
  on public.gallery_images
  for select
  to public
  using (true);

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

-- ---- ROLLBACK BLOQUE B (volver exactamente al estado real capturado) ----
-- drop policy if exists "gallery_images public read" on public.gallery_images;
-- drop policy if exists "gallery_images admin write" on public.gallery_images;
-- alter table public.gallery_images disable row level security;


-- ============================================================================
-- BLOQUE C — storage.objects, bucket 'products': restringir ESCRITURA a
-- administradores, conservando la LECTURA pública
-- Corrige: ALTA #1 (docs/00-auditoria-supabase.md §8)
--
-- Hoy: 4 policies con roles=["authenticated"] (sin ninguna verificación de
-- is_admin) para bucket_id='products':
--   1ifhysk_0  INSERT  with_check (bucket_id = 'products')
--   1ifhysk_1  SELECT  using      (bucket_id = 'products')   ← NO SE TOCA
--   1ifhysk_2  UPDATE  using      (bucket_id = 'products')
--   1ifhysk_3  DELETE  using      (bucket_id = 'products')
--
-- Cualquier cuenta autenticada (no solo la del panel admin) puede hoy
-- subir, sobrescribir o borrar archivos de ese bucket.
--
-- La lectura pública de imágenes (getPublicUrl, usada por todo el catálogo)
-- NO depende de estas policies: el bucket 'products' está marcado como
-- público en storage.buckets, y esa ruta pública no pasa por RLS. Por eso
-- este bloque solo toca INSERT/UPDATE/DELETE — la política de SELECT
-- ("...1ifhysk_1") se deja intacta, no hay ningún motivo de seguridad para
-- tocarla y así evitamos romper cualquier uso interno del panel que liste
-- o lea archivos con sesión.
-- ============================================================================

drop policy if exists "Allow uploads to products bucket 1ifhysk_0" on storage.objects; -- INSERT
drop policy if exists "Allow uploads to products bucket 1ifhysk_2" on storage.objects; -- UPDATE
drop policy if exists "Allow uploads to products bucket 1ifhysk_3" on storage.objects; -- DELETE

create policy "products bucket admin insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'products'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

create policy "products bucket admin update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'products'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

create policy "products bucket admin delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'products'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- ---- ROLLBACK BLOQUE C (recrear las 3 policies originales, tal cual) ----
-- drop policy if exists "products bucket admin insert" on storage.objects;
-- drop policy if exists "products bucket admin update" on storage.objects;
-- drop policy if exists "products bucket admin delete" on storage.objects;
--
-- create policy "Allow uploads to products bucket 1ifhysk_0"
--   on storage.objects for insert to authenticated
--   with check (bucket_id = 'products');
--
-- create policy "Allow uploads to products bucket 1ifhysk_2"
--   on storage.objects for update to authenticated
--   using (bucket_id = 'products');
--
-- create policy "Allow uploads to products bucket 1ifhysk_3"
--   on storage.objects for delete to authenticated
--   using (bucket_id = 'products');


-- ============================================================================
-- BLOQUE D (adicional — no pedido explícitamente, pero detectado en esta
-- auditoría) — buckets 'gallery' y 'assets': sin ninguna policy propia hoy.
--
-- storage.objects tiene RLS activado GLOBALMENTE (es una sola tabla para
-- todos los buckets). Sin una policy que cubra bucket_id='gallery' o
-- bucket_id='assets', cualquier intento de escritura vía la API
-- autenticada (que es lo que usan uploadGalleryImage/uploadAssetFile en
-- src/supabase/storage.ts) debería estar siendo RECHAZADO ahora mismo en
-- producción — no es una vulnerabilidad, es un candado que probablemente
-- ya está roto en el otro sentido: bloqueando funcionalidad legítima.
--
-- ⚠️ ANTES de aplicar este bloque: entra a /admin/galeria y a
-- /admin/configuracion (subir logo) y confirma si falla. Si ya falla,
-- este bloque lo repara. Si funciona, hay una policy que este descubrimiento
-- no capturó y hay que investigar antes de aplicar nada.
-- ============================================================================

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
-- BLOQUE E (opcional, prioridad BAJA, limpieza sin riesgo) — profiles:
-- dos policies redundantes que hacen exactamente lo mismo
-- ("profiles read own" y "read own profile" — ambas: leer solo tu propia
-- fila). No es un riesgo de seguridad, es deuda técnica.
-- ============================================================================

drop policy if exists "profiles read own" on public.profiles;
-- se conserva "read own profile", que hace exactamente lo mismo.

-- ---- ROLLBACK BLOQUE E ----
-- create policy "profiles read own" on public.profiles
--   for select
--   to authenticated
--   using (id = auth.uid());

-- ============================================================================
-- FIN DE LA PROPUESTA. No se ejecutó nada de este archivo.
-- ============================================================================
