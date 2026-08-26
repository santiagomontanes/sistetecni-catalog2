-- Módulo de comprobantes/ventas internas del panel admin.
--
-- Documento generado: "COMPROBANTE DE VENTA" — NO es una factura
-- electrónica DIAN (no hay integración con un proveedor tecnológico
-- autorizado). La columna sales.dian_status queda reservada, sin ninguna
-- lógica asociada todavía, para no tener que rediseñar el esquema si en
-- el futuro se integra facturación electrónica.
--
-- Tres tablas nuevas, ninguna modificación de tablas existentes:
--   - sale_number_counters: contador atómico por año (solo lo toca el
--     trigger de abajo, nunca la app directamente).
--   - sales: cabecera de la venta.
--   - sale_items: ítems vendidos, con snapshot congelado — una vez creada
--     una venta, NUNCA vuelve a depender de products (el catálogo puede
--     cambiar precio o borrarse el producto sin afectar ventas históricas).
--
-- RLS: mismo patrón que quote_requests (ver
-- supabase/migrations/20260812223300_quote_requests.sql) — admin-only,
-- sin ninguna policy "to public" ni "to service_role" (service_role ya
-- tiene BYPASSRLS; una policy pública sería reabrir la misma vulnerabilidad
-- ya corregida una vez en products, ver
-- 20260812215000_fase01_seguridad_produccion.sql Bloque A).
--
-- IDEMPOTENTE (create table/policy/trigger if not exists o drop+create)
-- para poder aplicarse sin error tanto en un proyecto limpio como en uno
-- donde ya se haya corrido antes.

-- ============================================================================
-- 1. sale_number_counters — contador atómico por año
-- ============================================================================

create table if not exists public.sale_number_counters (
  year        integer primary key,
  last_value  integer not null default 0
);

comment on table public.sale_number_counters is
  'Contador transaccional por año para la numeración de comprobantes (SV-2026-000001). Solo lo escribe set_sale_number(); nunca la aplicación directamente.';

-- ============================================================================
-- 2. Numeración atómica — función + trigger BEFORE INSERT en sales
-- ============================================================================
--
-- INSERT ... ON CONFLICT (year) DO UPDATE ... RETURNING es una única
-- sentencia SQL: Postgres toma el row-lock de la fila en conflicto como
-- parte de la resolución de ON CONFLICT, así que si dos ventas se crean
-- en paralelo (dos invocaciones serverless distintas en Vercel) para el
-- mismo año, la segunda espera el lock de la primera y ve el valor YA
-- incrementado — nunca hay una ventana "leer, luego escribir" que dos
-- procesos puedan pisarse. Esto es lo que garantiza que jamás existan dos
-- comprobantes con el mismo número, a diferencia de SELECT max()+1,
-- contar filas, o Date.now() (todos con carrera real en serverless).
--
-- Sin SECURITY DEFINER: corre con el rol del propio admin autenticado que
-- ya pasó por requireAdmin() + RLS — no escala privilegios. Los huecos en
-- la secuencia (p. ej. si una venta se aborta después de generar el
-- número) son aceptables y normales en numeración de comprobantes
-- internos; lo único que nunca puede pasar es una COLISIÓN, y eso este
-- mecanismo lo garantiza.

create or replace function public.set_sale_number()
returns trigger
language plpgsql
as $$
declare
  v_year int := extract(year from now())::int;
  v_seq  int;
begin
  if new.sale_number is not null then
    return new;
  end if;

  insert into public.sale_number_counters (year, last_value)
  values (v_year, 1)
  on conflict (year) do update
    set last_value = public.sale_number_counters.last_value + 1
  returning last_value into v_seq;

  new.sale_number := 'SV-' || v_year::text || '-' || lpad(v_seq::text, 6, '0');
  return new;
end;
$$;

comment on function public.set_sale_number() is
  'Genera sales.sale_number (SV-YYYY-NNNNNN) de forma atómica ante concurrencia — ver comentario arriba. No usar para nada más.';

-- ============================================================================
-- 3. sales — cabecera de la venta
-- ============================================================================

create table if not exists public.sales (
  id                 uuid        not null default gen_random_uuid(),
  sale_number        text,                                 -- lo rellena el trigger; la app NUNCA lo envía
  customer_name      text        not null,
  customer_document  text        not null,
  customer_phone     text        not null,
  customer_email     text,
  subtotal_cop       bigint      not null,
  discount_cop       bigint      not null default 0,
  total_cop          bigint      not null,
  payment_method     text        not null,
  payment_status     text        not null default 'pagado',
  warranty_months    integer     not null default 6,
  notes              text,
  dian_status        text        not null default 'no_aplica', -- reservado para integración DIAN futura, sin lógica asociada
  idempotency_key    uuid,                                  -- evita ventas duplicadas por doble clic/doble submit
  created_by         uuid,
  created_at         timestamptz not null default now(),

  constraint sales_pkey primary key (id),
  constraint sales_sale_number_key unique (sale_number),
  constraint sales_idempotency_key_key unique (idempotency_key),
  constraint sales_created_by_fkey foreign key (created_by) references public.profiles(id),
  constraint sales_payment_method_check check (payment_method in ('efectivo','transferencia','nequi','daviplata','tarjeta','otro')),
  constraint sales_payment_status_check check (payment_status in ('pagado','pendiente','parcial')),
  constraint sales_dian_status_check check (dian_status in ('no_aplica','pendiente_integracion')),
  constraint sales_warranty_months_check check (warranty_months >= 0),
  constraint sales_amounts_non_negative check (subtotal_cop >= 0 and total_cop >= 0),
  constraint sales_discount_le_subtotal check (discount_cop >= 0 and discount_cop <= subtotal_cop),
  constraint sales_total_matches check (total_cop = subtotal_cop - discount_cop)
);

comment on table public.sales is
  'Cabecera de un comprobante de venta interno. sale_number es único y atómico (ver set_sale_number). Una venta finalizada es inmutable en la app (V1 no expone edición); si se necesita corregir algo, se documenta como evolución futura.';
comment on column public.sales.dian_status is
  'Reservado para integración futura de facturación electrónica DIAN. Sin lógica asociada — hoy siempre "no_aplica".';
comment on column public.sales.idempotency_key is
  'UUID generado una vez en el cliente al abrir el formulario de nueva venta. Reenviarlo en reintentos evita crear una venta duplicada ante doble clic.';

create index if not exists idx_sales_created_at on public.sales (created_at desc);
create index if not exists idx_sales_customer_document on public.sales (customer_document);
create index if not exists idx_sales_customer_phone on public.sales (customer_phone);

drop trigger if exists sales_set_sale_number on public.sales;
create trigger sales_set_sale_number
  before insert on public.sales
  for each row
  when (new.sale_number is null)
  execute function public.set_sale_number();

-- ============================================================================
-- 4. sale_items — ítems vendidos, con snapshot congelado
-- ============================================================================

create table if not exists public.sale_items (
  id                      uuid        not null default gen_random_uuid(),
  sale_id                 uuid        not null,
  item_type               text        not null,
  product_id              uuid,                             -- null si item_type='manual'
  product_name            text        not null,
  product_description     text,
  product_image           text,
  product_specs           jsonb,                            -- snapshot de brand/model/cpu/ram/storage/screen/condition
  original_unit_price_cop bigint,                            -- precio de catálogo al momento de la venta; null si manual
  unit_price_cop          bigint      not null,
  quantity                integer     not null,
  subtotal_cop            bigint      not null,
  sort_order              integer     not null default 0,
  created_at              timestamptz not null default now(),

  constraint sale_items_pkey primary key (id),
  constraint sale_items_sale_id_fkey foreign key (sale_id) references public.sales(id) on delete cascade,
  -- on delete set null (a diferencia de quote_requests.product_id, que usa restrict): el snapshot en
  -- las demás columnas ya es autosuficiente, así que borrar un producto del catálogo después de
  -- venderlo NO debe romper la venta histórica, solo pierde el enlace vivo.
  constraint sale_items_product_id_fkey foreign key (product_id) references public.products(id) on delete set null,
  constraint sale_items_item_type_check check (item_type in ('catalog','manual')),
  constraint sale_items_type_product_consistency check (
    (item_type = 'catalog' and product_id is not null) or
    (item_type = 'manual'  and product_id is null)
  ),
  constraint sale_items_unit_price_non_negative check (unit_price_cop >= 0),
  constraint sale_items_quantity_positive check (quantity > 0),
  constraint sale_items_subtotal_matches check (subtotal_cop = unit_price_cop * quantity)
);

comment on table public.sale_items is
  'Ítems de una venta, con snapshot congelado en el momento de la venta. Nunca se relee products después de creado — ver sales_pdf/buildSalePdf.ts.';

create index if not exists idx_sale_items_sale_id on public.sale_items (sale_id);
create index if not exists idx_sale_items_product_id on public.sale_items (product_id);

-- ============================================================================
-- 5. RLS — admin-only en las 3 tablas, mismo patrón que quote_requests/products
-- ============================================================================

alter table public.sale_number_counters enable row level security;

drop policy if exists "sale_number_counters admin manage" on public.sale_number_counters;
create policy "sale_number_counters admin manage"
  on public.sale_number_counters
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

alter table public.sales enable row level security;

drop policy if exists "sales admin manage" on public.sales;
create policy "sales admin manage"
  on public.sales
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

alter table public.sale_items enable row level security;

drop policy if exists "sale_items admin manage" on public.sale_items;
create policy "sale_items admin manage"
  on public.sale_items
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- Deliberadamente NO se crea ninguna policy "to public" ni "to service_role"
-- en ninguna de las 3 tablas — mismo criterio que products/quote_requests
-- (ver notas en 20260812220000_baseline_esquema_actual.sql y
-- 20260812223300_quote_requests.sql). Los datos de clientes (nombre,
-- documento, celular) y los montos de venta no deben ser legibles por el
-- rol público bajo ninguna circunstancia.

-- ============================================================================
-- ROLLBACK — orden inverso, comentado a propósito
-- ============================================================================
-- drop policy if exists "sale_items admin manage" on public.sale_items;
-- drop policy if exists "sales admin manage" on public.sales;
-- drop policy if exists "sale_number_counters admin manage" on public.sale_number_counters;
--
-- drop table if exists public.sale_items;
--
-- drop trigger if exists sales_set_sale_number on public.sales;
-- drop table if exists public.sales;
--
-- drop function if exists public.set_sale_number();
-- drop table if exists public.sale_number_counters;
