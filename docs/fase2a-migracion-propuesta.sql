-- ============================================================================
-- SISTETECNI · FASE 2A · Migración PROPUESTA para "Personaliza tu portátil"
--
-- ⚠ SUPERSEDIDO — este archivo ya NO es la fuente ejecutable. Se conserva
-- como documento de diseño/razonamiento (explica el POR QUÉ de cada
-- decisión con más detalle del que corresponde a una migración real).
-- La versión versionada y lista para aplicar está en:
--     supabase/migrations/  (4 archivos, ver supabase/migrations/README.md)
-- Ese es el contenido que se aplicará a STAGING y, después, a PRODUCTION.
--
-- ESTADO: PROPUESTA PARA REVISIÓN. NO EJECUTADA. NO EJECUTAR SIN AUTORIZACIÓN.
--
-- Distingue EXISTENTE vs NUEVO en cada bloque. No modifica ni elimina
-- ninguna columna existente de `products` — solo agrega columnas nuevas,
-- nullable, sin default destructivo (patrón idéntico al que ya usa
-- database/supabase-migrations.sql con `ADD COLUMN IF NOT EXISTS`).
--
-- Prerrequisito de PRODUCCIÓN (no de desarrollo/pruebas): las correcciones
-- de docs/fase0.1-correccion-propuesta.sql deben aplicarse ANTES de que
-- esta función reciba tráfico real — un precio base (`products.price`)
-- que cualquiera puede alterar hoy invalida cualquier cotización que se
-- calcule sobre él. Ver docs/fase2a-personalizador-diseno.md §20 (Riesgos).
--
-- ── CAMBIOS TRAS LA APROBACIÓN DE DECISIONES (docs/fase2a-decisiones-
--    pendientes.md) — todas aprobadas salvo D11, que no afecta esquema ──
--   · D5  → se agrega quote_requests.customer_city (nullable, opcional).
--           NO se agregan campos de nombre/teléfono — decisión explícita.
--   · D9  → status admite ahora 'contactada' (7 estados en total).
--   · Trigger set_updated_at RETIRADO de la propuesta — updated_at queda
--     gestionado explícitamente por la aplicación (Server Action), no por
--     lógica en Postgres. Preserva el patrón "cero funciones/triggers"
--     que ya tenía este esquema (docs/00-auditoria-supabase.md §1).
--   · D1, D2, D3, D4, D6, D7, D8, D10, D12, D13, D14 → no requieren ningún
--     cambio de esquema; son decisiones de algoritmo, UI o proceso admin.
-- ============================================================================


-- ============================================================================
-- BLOQUE 1 — products: columnas NUEVAS, aditivas (NO se toca nada existente)
--
-- Por qué cada una — ver docs/fase2a-personalizador-diseno.md §5 para la
-- justificación completa de por qué van en `products` y no en otra tabla.
-- Todas nullable: los productos existentes quedan con estos campos vacíos
-- hasta que el admin los complete manualmente (trabajo de datos, no de
-- código — ver §20 Riesgos).
-- ============================================================================

alter table public.products
  add column if not exists cpu_generation     integer,        -- generación numérica del procesador (ej. 8 = "8va gen"); complementa `cpu`/`procesador` (texto libre), no los reemplaza
  add column if not exists gpu_type           varchar(20),    -- 'integrada' | 'dedicada' — filtro de equipo base, casi nunca upgradeable
  add column if not exists gpu_model          text,           -- ej. "NVIDIA MX250" — informativo, no filtrable numéricamente
  add column if not exists touch_screen       boolean default false,  -- filtro de equipo base, característica física del panel
  add column if not exists screen_size_inches numeric(3,1),   -- complementa `screen` (texto libre tipo "14\" FHD") con un número filtrable
  add column if not exists storage_gb         integer;        -- capacidad ACTUAL instalada en GB; complementa `storage`/`almacenamiento` (texto). Necesario para poder comparar numéricamente contra requisitos y opciones de upgrade.

comment on column public.products.cpu_generation     is 'Generación numérica del CPU (ej. 8, 10, 11). Filtro de equipo base para el personalizador. No sustituye a cpu/procesador (texto).';
comment on column public.products.gpu_type           is 'integrada | dedicada. Filtro de equipo base — la GPU normalmente no es upgrade en portátiles reacondicionados.';
comment on column public.products.gpu_model          is 'Modelo de GPU dedicada, si aplica. Solo informativo.';
comment on column public.products.touch_screen       is 'Filtro de equipo base — característica física del panel, no upgradeable.';
comment on column public.products.screen_size_inches is 'Tamaño de pantalla en pulgadas, numérico, para filtrar por rango. Complementa a screen (texto libre).';
comment on column public.products.storage_gb          is 'Capacidad de almacenamiento ACTUAL instalada, en GB. Necesaria para el algoritmo de compatibilidad de upgrades.';

-- ---- ROLLBACK BLOQUE 1 ----
-- alter table public.products
--   drop column if exists cpu_generation,
--   drop column if exists gpu_type,
--   drop column if exists gpu_model,
--   drop column if exists touch_screen,
--   drop column if exists screen_size_inches,
--   drop column if exists storage_gb;
-- -- Seguro de ejecutar mientras ninguna fila real dependa aún de estas
-- -- columnas (es decir, antes de que la Fase 2B esté en producción).


-- ============================================================================
-- BLOQUE 2 — upgrade_options: catálogo reutilizable de upgrades posibles
--
-- Una fila = un "producto de upgrade" administrable (ej. "RAM 16 GB",
-- "SSD 500 GB NVMe"), con su costo. NO está atado a ningún product_id
-- todavía — eso lo hace la tabla de compatibilidad (Bloque 3).
-- ============================================================================

create table if not exists public.upgrade_options (
  id             uuid primary key default gen_random_uuid(),
  category       varchar(20)  not null check (category in ('ram', 'storage')),  -- extensible en el futuro (ej. 'battery'), no sobrediseñado ahora
  label          text         not null,        -- ej. "16 GB RAM", "500 GB SSD NVMe" — lo que ve el cliente
  value          integer      not null,        -- capacidad resultante en GB (RAM o almacenamiento, mismo criterio para ambas categorías)
  interface      varchar(20),                  -- solo aplica a category='storage': 'SATA' | 'NVMe' | 'M.2 SATA' | null
  extra_cost     numeric      not null check (extra_cost >= 0),  -- precio FINAL adicional que paga el cliente — el único valor usado en el cálculo de cotización
  component_cost numeric,                      -- opcional, informativo/interno: costo del repuesto — NO se usa en el cálculo de precio al cliente
  install_cost   numeric,                      -- opcional, informativo/interno: costo de instalación — NO se usa en el cálculo de precio al cliente
  active         boolean      not null default true,
  created_at     timestamptz  not null default now()
);

comment on table public.upgrade_options is 'Catálogo administrable de upgrades posibles (RAM/almacenamiento). extra_cost es el ÚNICO campo que alimenta el cálculo de precio al cliente; component_cost/install_cost son opcionales, solo para análisis interno de margen.';

create index if not exists idx_upgrade_options_category_active
  on public.upgrade_options (category, active);

alter table public.upgrade_options enable row level security;

-- Lectura pública: el catálogo de upgrades es tan público como el precio
-- de los productos — el personalizador necesita mostrarlo sin sesión.
create policy "upgrade_options public read"
  on public.upgrade_options
  for select
  to public
  using (true);

-- Escritura SOLO admin. Aprendizaje directo de la Fase 0.1: el rol se
-- declara explícito (`authenticated`, nunca `public`) para ALL/escritura.
create policy "upgrade_options admin write"
  on public.upgrade_options
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- ---- ROLLBACK BLOQUE 2 ----
-- drop policy if exists "upgrade_options public read" on public.upgrade_options;
-- drop policy if exists "upgrade_options admin write" on public.upgrade_options;
-- drop table if exists public.upgrade_options;


-- ============================================================================
-- BLOQUE 3 — product_upgrade_options: COMPATIBILIDAD explícita
--
-- La pieza crítica: si un product_id no tiene fila aquí para una
-- upgrade_option, esa opción NUNCA se ofrece para ese producto — es lo
-- que impide estructuralmente prometer un upgrade físicamente imposible.
-- ============================================================================

create table if not exists public.product_upgrade_options (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid        not null references public.products(id) on delete cascade,
  upgrade_option_id uuid        not null references public.upgrade_options(id) on delete cascade,
  note              text,       -- ej. "requiere retirar el módulo de 8GB existente"
  active            boolean     not null default true,
  created_at        timestamptz not null default now(),
  unique (product_id, upgrade_option_id)
);

comment on table public.product_upgrade_options is 'Compatibilidad explícita: qué upgrade_options aplican a qué producto. Ausencia de fila = upgrade NO disponible para ese producto. Nunca se infiere compatibilidad por categoría o por regla global.';

create index if not exists idx_product_upgrade_options_product
  on public.product_upgrade_options (product_id) where active = true;

alter table public.product_upgrade_options enable row level security;

create policy "product_upgrade_options public read"
  on public.product_upgrade_options
  for select
  to public
  using (true);

create policy "product_upgrade_options admin write"
  on public.product_upgrade_options
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- ---- ROLLBACK BLOQUE 3 ----
-- drop policy if exists "product_upgrade_options public read" on public.product_upgrade_options;
-- drop policy if exists "product_upgrade_options admin write" on public.product_upgrade_options;
-- drop table if exists public.product_upgrade_options;


-- ============================================================================
-- BLOQUE 4 — quote_requests: solicitud de cotización, con SNAPSHOT
--
-- IMPORTANTE — a diferencia de products/upgrade_options/*, esta tabla NO
-- lleva policy de lectura pública abierta. Un `using (true)` en SELECT
-- permitiría a cualquiera con la clave anónima listar TODAS las
-- cotizaciones de TODOS los clientes (presupuestos, configuraciones,
-- notas). El acceso de clientes a SU PROPIA cotización pasa siempre por
-- un Route Handler server-side que consulta por código exacto — nunca
-- por una query abierta desde el navegador. Ver
-- docs/fase2a-personalizador-diseno.md §8 (Arquitectura server-side).
--
-- Por eso aquí NO se crea ninguna policy para anon/authenticated: sin
-- policy y con RLS activado, el acceso vía anon key queda denegado por
-- defecto (fail-closed) tanto en lectura como en escritura. Todo pasa por
-- el Route Handler/Server Action, que usa la service_role key (server-only,
-- nunca en código de cliente, nunca con prefijo NEXT_PUBLIC_).
-- ============================================================================

create table if not exists public.quote_requests (
  id                        uuid primary key default gen_random_uuid(),
  code                      text        not null unique,   -- ej. "COT-A8K31F" — generado en el servidor (Next.js), no en la BD. Ver diseño §12.
  product_id                uuid        references public.products(id) on delete restrict,  -- RESTRICT: no se puede borrar un producto con historial de cotizaciones; usar visible_web=false en su lugar (ya es el patrón existente)
  is_special_request        boolean     not null default false,  -- true cuando no se encontró ningún producto base compatible

  base_price_snapshot       numeric,             -- precio de products.price EN EL MOMENTO de la cotización — nunca se relee después
  base_config_snapshot      jsonb,               -- specs completas del producto base en ese momento (title, brand, model, cpu, ram, storage, screen, condition...)
  requested_config          jsonb       not null,-- lo que el cliente pidió (ram/storage deseados, presupuesto, preferencias, uso, etc.)
  selected_upgrades_snapshot jsonb      not null default '[]'::jsonb, -- array de upgrades elegidos, cada uno con su extra_cost YA CONGELADO en ese momento

  estimated_price           numeric,             -- base_price_snapshot + suma(selected_upgrades_snapshot[].extra_cost), calculado server-side
  customer_budget           numeric,
  customer_city             text,                -- (D5) único dato de contacto pedido antes de WhatsApp, opcional. NUNCA nombre ni teléfono aquí.
  customer_note             text,

  status                    text        not null default 'nueva'
                               check (status in ('nueva','en_revision','contactada','cotizada','aceptada','rechazada','expirada')),  -- (D9) 'contactada' agregada
  channel                   text        not null default 'web_personalizador',

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),  -- gestionado EXPLÍCITAMENTE por la aplicación en cada UPDATE — sin trigger
  expires_at                timestamptz,          -- (D6) la aplicación lo fija en created_at + 7 días al crear la fila; sin default en la BD, mismo criterio explícito que updated_at

  constraint quote_requests_product_or_special
    check (product_id is not null or is_special_request = true)
);

comment on table public.quote_requests is 'Solicitud de cotización con snapshot congelado — el precio/config no se recalcula al leerla después. code es el identificador público (para WhatsApp); id (uuid) nunca se expone al cliente.';
comment on column public.quote_requests.code is 'Identificador amigable, generado server-side con alfabeto sin caracteres ambiguos (sin 0/O/1/I/L), no secuencial. Formato: COT-XXXXXX.';

create unique index if not exists idx_quote_requests_code on public.quote_requests (code);
create index if not exists idx_quote_requests_status on public.quote_requests (status);
create index if not exists idx_quote_requests_product on public.quote_requests (product_id);
create index if not exists idx_quote_requests_created_at on public.quote_requests (created_at desc);

alter table public.quote_requests enable row level security;

-- Solo administradores (vía panel) pueden leer/gestionar el listado
-- completo. El acceso de un cliente a SU cotización por código nunca pasa
-- por esta policy — pasa por el Route Handler con service_role (bypassa
-- RLS por diseño de Supabase, ver docs/00-auditoria-supabase.md §8).
create policy "quote_requests admin manage"
  on public.quote_requests
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- NOTA — sin trigger para updated_at (decisión revisada y aprobada): se
-- descartó el trigger que proponía la versión anterior de este archivo.
-- updated_at se gestiona explícitamente desde el Server Action en cada
-- UPDATE (`.update({ ..., updated_at: new Date().toISOString() })`),
-- preservando el patrón "cero funciones/triggers" que ya tenía este
-- esquema antes de esta migración (docs/00-auditoria-supabase.md §1).

-- ---- ROLLBACK BLOQUE 4 ----
-- drop policy if exists "quote_requests admin manage" on public.quote_requests;
-- drop table if exists public.quote_requests;

-- ============================================================================
-- FIN DE LA PROPUESTA. Nada de este archivo fue ejecutado contra Supabase.
-- ============================================================================
