-- Migración 3/4 — Fase 2B "Personaliza tu portátil"
-- Compatibilidad EXPLÍCITA entre products y upgrade_options (D3 aprobada:
-- por product_id individual — la utilidad de "copiar compatibilidad
-- entre productos" es una función del panel admin, Fase 2B bloque B6,
-- no algo que viva en este esquema).
--
-- La pieza crítica: si un product_id no tiene fila aquí para una
-- upgrade_option, esa opción NUNCA se ofrece para ese producto — es lo
-- que impide estructuralmente prometer un upgrade físicamente imposible.
--
-- Orden de aplicación: 3 de 4. Depende de: migraciones 1 (products) y 2
-- (upgrade_options) ya aplicadas — las FK fallarían si no.

create table if not exists public.product_upgrade_options (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid        not null references public.products(id) on delete cascade,
  upgrade_option_id uuid        not null references public.upgrade_options(id) on delete cascade,
  note              text,       -- ej. "requiere retirar el módulo de 8GB existente"
  active            boolean     not null default true,
  created_at        timestamptz not null default now(),
  unique (product_id, upgrade_option_id)
);

comment on table public.product_upgrade_options is 'Compatibilidad explícita: qué upgrade_options aplican a qué producto. Ausencia de fila = upgrade NO disponible para ese producto. Nunca se infiere compatibilidad por categoría, modelo o regla global (D3).';

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

-- ---- ROLLBACK ----
-- drop policy if exists "product_upgrade_options public read" on public.product_upgrade_options;
-- drop policy if exists "product_upgrade_options admin write" on public.product_upgrade_options;
-- drop table if exists public.product_upgrade_options;
