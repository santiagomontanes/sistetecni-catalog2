-- Migración BASELINE — esquema actual de SISTETECNI (previo a la Fase 2B)
--
-- FUENTES (únicas usadas — nada inventado ni reconstruido de memoria):
--   docs/00-auditoria-supabase.md       (síntesis, texto exacto de policies)
--   docs/00-auditoria-supabase-raw.json (resultado JSON real, sin editar,
--                                        de docs/fase0-descubrimiento-export.sql
--                                        ejecutado en producción 2026-08-13T00:56:17Z)
--
-- Todo objeto de este archivo es CONFIRMADO por esas fuentes, salvo las 3
-- correcciones de seguridad explícitamente aprobadas (marcadas "DIFERENCIA
-- INTENCIONAL" en el bloque correspondiente). Los puntos donde la fuente no
-- alcanza para el 100% de precisión están señalados como REQUIERE
-- VERIFICACIÓN al final del archivo — ninguno bloquea la validez estructural.
--
-- NO se ejecuta nada de esto contra Supabase en esta sesión.
--
-- Orden de aplicación: 1 de 5 (primera cronológicamente).
--   20260812220000_baseline_esquema_actual.sql          ← este archivo
--   20260812223000_products_personalizador_columns.sql
--   20260812223100_upgrade_options.sql
--   20260812223200_product_upgrade_options.sql
--   20260812223300_quote_requests.sql
--
-- Orden interno: `profiles` se crea primero porque las policies de
-- escritura de las demás tablas hacen EXISTS(SELECT ... FROM profiles ...)
-- — Postgres exige que esa tabla ya exista al crear la policy.


-- ============================================================================
-- 1. profiles — CONFIRMADO (raw.json: tablas_columnas, primary_keys, rls_tablas, policies_public)
-- ============================================================================

create table if not exists public.profiles (
  id         uuid        not null,                 -- se asume = auth.users.id por convención de la app; SIN FK real (confirmado: foreign_keys: [] en producción)
  email      text,
  is_admin   boolean     default false,
  created_at timestamptz default now(),
  constraint profiles_pkey primary key (id)
);

comment on table public.profiles is 'Rol de administrador. id se asume igual a auth.users.id por convención del código, no hay FK que lo garantice (confirmado por auditoría) — crear un admin nuevo es un proceso manual.';

alter table public.profiles enable row level security;

-- Dos policies idénticas en efecto (confirmado — no es un error de este
-- archivo, es el estado real de producción: "profiles read own" y "read own
-- profile" hacen lo mismo con la condición escrita en distinto orden). Se
-- reproducen ambas, tal cual, porque no es una vulnerabilidad — solo una
-- redundancia inofensiva ya documentada (Fase 0.1, BAJA #1) — no estaba en
-- el alcance de las 3 correcciones de seguridad aprobadas para este baseline.
create policy "profiles read own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "read own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- Sin policy de INSERT/UPDATE/DELETE (confirmado) — con RLS activado, eso
-- es denegación por defecto: nadie puede auto-otorgarse is_admin=true vía
-- API. No se agrega ninguna — reproducir la ausencia es correcto aquí.


-- ============================================================================
-- 2. business_profile — CONFIRMADO
-- ============================================================================

create table if not exists public.business_profile (
  id              integer     not null,             -- SIN default (confirmado) — la app siempre inserta explícitamente id=1, fila única
  company_name    text,
  description     text,
  address         text,
  hours           text,
  phone_whatsapp  text,
  email           text,
  instagram       text,
  facebook        text,
  tiktok          text,
  map_link        text,
  logo_url        text,
  local_photos    text[]      default '{}'::text[],
  hero_video_url  text,
  hero_media_type character varying default 'image'::character varying,  -- longitud del varchar: REQUIERE VERIFICACIÓN, ver nota al final
  constraint business_profile_pkey primary key (id)
);

alter table public.business_profile enable row level security;

create policy "business_profile public read"
  on public.business_profile
  for select
  to public
  using (true);

create policy "business_profile admin write"
  on public.business_profile
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );


-- ============================================================================
-- 3. testimonials — CONFIRMADO
-- ============================================================================

create table if not exists public.testimonials (
  id         uuid        not null default gen_random_uuid(),
  client_name text,
  text        text,
  rating      integer,
  source      text,
  photo_url   text,
  created_at  timestamptz default now(),
  active      boolean     default true,
  constraint testimonials_pkey primary key (id)
);

alter table public.testimonials enable row level security;

create policy "testimonials public read"
  on public.testimonials
  for select
  to public
  using (true);

create policy "testimonials admin write"
  on public.testimonials
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );


-- ============================================================================
-- 4. gallery_images — CONFIRMADO el esquema de columnas.
--    DIFERENCIA INTENCIONAL en seguridad — ver nota.
-- ============================================================================
--
-- Producción real (confirmado, raw.json rls_tablas): rls_activado = FALSE,
-- CERO policies. Esto es la vulnerabilidad CRÍTICA #2 ya documentada
-- (docs/00-auditoria-supabase.md §8) — cualquier anónimo puede hoy
-- insertar/editar/borrar filas de esta tabla en producción.
--
-- STAGING NO debe heredar esto (aprobado explícitamente). Se activa RLS y
-- se agregan las 2 policies estándar — el mismo texto ya propuesto y
-- revisado en docs/fase0.1-correccion-propuesta.sql Bloque B (no aplicado
-- a producción; aplicado aquí solo a la línea base de STAGING).

create table if not exists public.gallery_images (
  id         serial      primary key,               -- serial ≡ integer + nextval('gallery_images_id_seq'), coincide exacto con el default confirmado
  url        text        not null,
  caption    character varying,                     -- longitud del varchar: REQUIERE VERIFICACIÓN, ver nota al final
  orden      integer     default 0,
  activa     boolean     default true,
  created_at timestamptz default now()
);

alter table public.gallery_images enable row level security;  -- DIFERENCIA INTENCIONAL: producción tiene esto desactivado

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


-- ============================================================================
-- 5. products — CONFIRMADO el esquema completo (23 columnas).
--    DIFERENCIA INTENCIONAL en seguridad — ver nota.
-- ============================================================================
--
-- Las 9 columnas en español (marca, procesador, almacenamiento, categoria,
-- descripcion, estado, erp_id) están CONFIRMADAS como existentes en
-- producción pero huérfanas — ningún archivo de src/ las lee ni las
-- escribe (docs/00-auditoria-supabase.md §13.1). Se incluyen igual porque
-- SÍ existen en el esquema real y las 4 migraciones del personalizador no
-- las tocan — omitirlas haría este baseline infiel a "estructura
-- equivalente a la web actual", que es el objetivo pedido.

create table if not exists public.products (
  id             uuid        not null default gen_random_uuid(),
  title          text        not null,
  brand          text,
  model          text,
  cpu            text,
  ram            integer,
  storage        text,
  screen         text,
  price          numeric,                            -- precisión/escala: REQUIERE VERIFICACIÓN, ver nota al final
  condition      text,
  stock          integer     default 0,
  images         text[]      default '{}'::text[],
  featured       boolean     default false,
  created_at     timestamptz default now(),
  erp_id         integer,
  visible_web    boolean     default false,           -- confirmado: el default REAL en producción es false (no true, a pesar de lo que dice database/supabase-migrations.sql — ver Fase 0 §12)
  almacenamiento character varying,                   -- huérfana, sin uso por la web (confirmado) — se incluye por fidelidad estructural
  procesador     character varying,                   -- huérfana, sin uso por la web (confirmado)
  marca          character varying,                   -- huérfana, sin uso por la web (confirmado)
  categoria      character varying,                   -- huérfana, sin uso por la web (confirmado)
  descripcion    text,                                -- huérfana, sin uso por la web (confirmado)
  estado         character varying,                   -- huérfana, sin uso por la web (confirmado)
  updated_at     timestamptz default now(),           -- confirmado: sin trigger que la actualice — se establece una vez y no se refresca (Fase 0.1, BAJA #2). No se agrega un trigger aquí: sería inventar comportamiento que producción no tiene.
  constraint products_pkey primary key (id),
  constraint products_erp_id_key unique (erp_id)
);

comment on column public.products.marca          is 'Huérfana — confirmado sin uso por src/. No usar como fuente todavía (ver docs/00-auditoria-supabase.md §13.1).';
comment on column public.products.procesador      is 'Huérfana — confirmado sin uso por src/.';
comment on column public.products.almacenamiento  is 'Huérfana — confirmado sin uso por src/.';
comment on column public.products.categoria       is 'Huérfana — confirmado sin uso por src/.';
comment on column public.products.descripcion     is 'Huérfana — confirmado sin uso por src/.';
comment on column public.products.estado          is 'Huérfana — confirmado sin uso por src/. Relación con condition sin aclarar (ver Fase 0.1).';
comment on column public.products.erp_id          is 'Reservada para integración ERP futura, confirmado UNIQUE, sin uso web actual.';

-- Índice redundante pero real (confirmado en producción) — el UNIQUE de
-- arriba ya crea un índice único sobre erp_id; este es un índice manual
-- adicional, inofensivo, que se reproduce por fidelidad al esquema real.
create index if not exists idx_products_erp_id on public.products (erp_id);

alter table public.products enable row level security;

create policy "products public read"
  on public.products
  for select
  to public
  using (true);

create policy "products admin write"
  on public.products
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- DIFERENCIA INTENCIONAL — NO SE CREA esta policy, a propósito:
--
--   create policy "service_role full access"
--     on public.products for all to public using (true) with check (true);
--
-- Es la vulnerabilidad CRÍTICA #1 confirmada (docs/00-auditoria-supabase.md
-- §8): roles=["public"] abre INSERT/UPDATE/DELETE a cualquiera, anulando en
-- la práctica la policy "products admin write" de arriba. No aporta nada
-- (service_role ya tiene BYPASSRLS — nunca necesita una policy) y solo
-- reproduciría el hueco de seguridad en STAGING. Aprobado explícitamente
-- excluirla.


-- ============================================================================
-- 6. storage.objects — policies del bucket "products" únicamente.
--    DIFERENCIA INTENCIONAL en seguridad — ver nota.
-- ============================================================================
--
-- NO se recrean las tablas storage.buckets/storage.objects — ya existen en
-- cualquier proyecto Supabase nuevo (Storage es una extensión que Supabase
-- instala por defecto). Recrearlas causaría conflicto.
--
-- Solo se reproduce, corregida, la policy sobre bucket_id='products' — el
-- único bucket que la auditoría confirma con policies reales (4, ALTA #1).
-- Los buckets 'gallery'/'assets'/'product-images' NO tienen ninguna policy
-- en producción (confirmado, cero filas en storage_policies para esos
-- bucket_id) — no se inventa ninguna para ellos aquí (ver "objetos
-- omitidos" en la respuesta).
--
-- Producción real (confirmado): 4 policies, roles=["authenticated"],
-- SIN chequeo de is_admin — cualquier cuenta autenticada (no solo admins)
-- puede subir/sobrescribir/borrar (ALTA #1). STAGING corrige esto: SELECT
-- se mantiene igual (lectura ya es pública vía el bucket, esta policy no
-- la afecta), INSERT/UPDATE/DELETE quedan restringidos a is_admin — mismo
-- texto ya propuesto en docs/fase0.1-correccion-propuesta.sql Bloque C.
--
-- Creación del bucket 'products' en sí (fila en storage.buckets, público)
-- NO es parte de esta migración — es configuración/datos, no esquema. Ver
-- "objetos omitidos" en la respuesta para el paso de setup correspondiente.

create policy "products bucket read"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'products');

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

-- No se crea ninguna policy dirigida a "service_role" — ese rol tiene
-- BYPASSRLS y nunca necesita una (mismo criterio que en products, aprobado
-- explícitamente no repetir policies innecesarias para service_role).


-- ============================================================================
-- ROLLBACK (orden inverso)
-- ============================================================================
-- drop policy if exists "products bucket admin delete" on storage.objects;
-- drop policy if exists "products bucket admin update" on storage.objects;
-- drop policy if exists "products bucket admin insert" on storage.objects;
-- drop policy if exists "products bucket read" on storage.objects;
-- drop policy if exists "products admin write" on public.products;
-- drop policy if exists "products public read" on public.products;
-- drop table if exists public.products;
-- drop policy if exists "gallery_images admin write" on public.gallery_images;
-- drop policy if exists "gallery_images public read" on public.gallery_images;
-- drop table if exists public.gallery_images;
-- drop policy if exists "testimonials admin write" on public.testimonials;
-- drop policy if exists "testimonials public read" on public.testimonials;
-- drop table if exists public.testimonials;
-- drop policy if exists "business_profile admin write" on public.business_profile;
-- drop policy if exists "business_profile public read" on public.business_profile;
-- drop table if exists public.business_profile;
-- drop policy if exists "read own profile" on public.profiles;
-- drop policy if exists "profiles read own" on public.profiles;
-- drop table if exists public.profiles;


-- ============================================================================
-- REQUIERE VERIFICACIÓN (no bloquea la validez estructural del baseline,
-- pero no se adivinó — queda documentado tal como pediste)
-- ============================================================================
--
-- 1. Longitud de `character varying` en: business_profile.hero_media_type,
--    gallery_images.caption, products.almacenamiento/procesador/marca/
--    categoria/estado. El script de descubrimiento capturó `data_type`
--    ("character varying") pero NO `character_maximum_length` — esa
--    columna de information_schema no estaba en la consulta original. Usé
--    `character varying` SIN límite (opción segura: nunca rechaza un valor
--    que producción sí aceptaría), pero si la columna real tiene un límite
--    (ej. varchar(50)), STAGING sería más permisivo que producción en ese
--    campo específico — inofensivo para pruebas, pero no es una réplica
--    exacta. Para confirmarlo: `SELECT column_name, character_maximum_length
--    FROM information_schema.columns WHERE table_name IN (...)`.
--
-- 2. Precisión/escala de `numeric` en products.price. Mismo motivo: no se
--    capturó `numeric_precision`/`numeric_scale`. Usé `numeric` sin límite
--    (acepta cualquier valor, incluida más precisión de la que producción
--    tal vez permite) — mismo criterio "seguro por permisivo", misma
--    limitación de fidelidad exacta.
--
-- Todo lo demás de este archivo (tipos base, nullability, defaults, PK,
-- UNIQUE, RLS, texto exacto de policies) está confirmado directamente por
-- docs/00-auditoria-supabase-raw.json — cero conjeturas.
