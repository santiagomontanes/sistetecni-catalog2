-- Migración 4/4 — Fase 2B "Personaliza tu portátil"
-- Solicitud de cotización con SNAPSHOT congelado — el precio/config no se
-- recalcula al leerla después.
--
-- IMPORTANTE — a diferencia de products/upgrade_options/*, esta tabla NO
-- lleva policy de lectura pública abierta. Un `using (true)` en SELECT
-- permitiría a cualquiera con la clave anónima listar TODAS las
-- cotizaciones de TODOS los clientes. El acceso de un cliente a su propia
-- cotización pasa siempre por un Route Handler server-side que consulta
-- por código exacto usando SUPABASE_SERVICE_ROLE_KEY (server-only) — ver
-- docs/fase2a-personalizador-diseno.md §8.
--
-- Sin trigger para updated_at (decisión revisada y aprobada): se gestiona
-- explícitamente desde el Server Action en cada UPDATE, preservando el
-- patrón "cero funciones/triggers" que ya tenía este esquema antes de
-- esta migración (docs/00-auditoria-supabase.md §1).
--
-- Orden de aplicación: 4 de 4. Depende de: migración 1 (products) ya
-- aplicada — la FK de product_id fallaría si no.

create table if not exists public.quote_requests (
  id                        uuid primary key default gen_random_uuid(),
  code                      text        not null unique,   -- ej. "COT-A8K31F" — generado en el servidor (Next.js), no en la BD
  product_id                uuid        references public.products(id) on delete restrict,  -- RESTRICT: no se puede borrar un producto con historial de cotizaciones; usar visible_web=false en su lugar
  is_special_request        boolean     not null default false,  -- true cuando no se encontró ningún producto base compatible, o (D7) cuando el producto existe pero está agotado

  base_price_snapshot       numeric,             -- precio de products.price EN EL MOMENTO de la cotización — nunca se relee después
  base_config_snapshot      jsonb,               -- specs completas del producto base en ese momento (title, brand, model, cpu, ram, storage, screen, condition, image...)
  requested_config          jsonb       not null,-- lo que el cliente pidió (ram/storage deseados, presupuesto, preferencias, uso, etc.)
  selected_upgrades_snapshot jsonb      not null default '[]'::jsonb, -- array de upgrades elegidos, cada uno con su extra_cost YA CONGELADO en ese momento

  estimated_price           numeric,             -- base_price_snapshot + suma(selected_upgrades_snapshot[].extra_cost), calculado server-side
  customer_budget           numeric,
  customer_city             text,                -- (D5) único dato de contacto pedido antes de WhatsApp, opcional. NUNCA nombre ni teléfono aquí.
  customer_note             text,

  status                    text        not null default 'nueva'
                               check (status in ('nueva','en_revision','contactada','cotizada','aceptada','rechazada','expirada')),  -- (D9) 7 estados, incluye 'contactada'
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
-- por esta policy — pasa por el Route Handler con service_role.
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

-- ---- ROLLBACK ----
-- drop policy if exists "quote_requests admin manage" on public.quote_requests;
-- drop table if exists public.quote_requests;
