-- Migración 2/4 — Fase 2B "Personaliza tu portátil"
-- Catálogo reutilizable de upgrades posibles (RAM/almacenamiento).
-- Una fila = un "producto de upgrade" administrable, con su costo.
-- NO está atado a ningún product_id todavía — eso lo hace la
-- migración 3 (product_upgrade_options).
--
-- Modelo de precio (D1, D2 aprobadas): opción final independiente, no
-- origen→destino. extra_cost es el ÚNICO campo que alimenta el cálculo
-- de precio al cliente; component_cost/install_cost son opcionales,
-- solo para análisis interno de margen.
--
-- Orden de aplicación: 2 de 4. Depende de: (ninguna tabla nueva previa).

create table if not exists public.upgrade_options (
  id             uuid primary key default gen_random_uuid(),
  category       varchar(20)  not null check (category in ('ram', 'storage')),  -- extensible en el futuro (ej. 'battery'), no sobrediseñado ahora
  label          text         not null,        -- ej. "16 GB RAM", "500 GB SSD NVMe" — lo que ve el cliente
  value          integer      not null,        -- capacidad resultante en GB (RAM o almacenamiento, mismo criterio para ambas categorías)
  interface      varchar(20),                  -- solo aplica a category='storage': 'SATA' | 'NVMe' | 'M.2 SATA' | null
  extra_cost     numeric      not null check (extra_cost >= 0),  -- (D1, D2) precio FINAL adicional que paga el cliente — el único valor usado en el cálculo de cotización
  component_cost numeric,                      -- (D2) opcional, informativo/interno — NO se usa en el cálculo de precio al cliente
  install_cost   numeric,                      -- (D2) opcional, informativo/interno — NO se usa en el cálculo de precio al cliente
  active         boolean      not null default true,  -- (D14) activo/inactivo, sin cantidad real de inventario
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

-- ---- ROLLBACK ----
-- drop policy if exists "upgrade_options public read" on public.upgrade_options;
-- drop policy if exists "upgrade_options admin write" on public.upgrade_options;
-- drop table if exists public.upgrade_options;
