-- SISTETECNI ERP — Fase 1A
-- Núcleo no destructivo: clientes, unidades físicas, movimientos de inventario y auditoría.
--
-- IMPORTANTE
-- - Esta migración NO elimina ni reemplaza products.stock.
-- - Esta migración NO modifica sales/sale_items todavía.
-- - Esta migración NO se aplica automáticamente a producción.
-- - El stock público seguirá usando products.stock hasta completar la migración de unidades.
--
-- El objetivo de esta fase es crear una base privada y auditable sobre la cual
-- construir luego las operaciones transaccionales de venta, reserva, devolución,
-- garantía y las tools del agente de WhatsApp.

-- ============================================================================
-- 0. Helper updated_at compartido por tablas ERP
-- ============================================================================

create or replace function public.erp_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.erp_set_updated_at() is
  'Helper ERP: actualiza updated_at en UPDATE. SECURITY INVOKER; no escala privilegios.';

-- ============================================================================
-- 1. customers — cliente canónico del ERP
-- ============================================================================
--
-- Las ventas históricas seguirán conservando customer_name/document/phone como
-- snapshot. En una fase posterior sales.customer_id enlazará opcionalmente a
-- esta tabla sin convertir el histórico en datos mutables.

create table if not exists public.customers (
  id               uuid        not null default gen_random_uuid(),
  full_name        text        not null,
  document_type    text,
  document_number  text,
  phone            text,
  email            text,
  address          text,
  city             text,
  notes            text,
  active           boolean     not null default true,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint customers_pkey primary key (id),
  constraint customers_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null,
  constraint customers_full_name_not_blank check (length(btrim(full_name)) > 0),
  constraint customers_document_not_blank check (
    document_number is null or length(btrim(document_number)) > 0
  ),
  constraint customers_phone_not_blank check (
    phone is null or length(btrim(phone)) > 0
  ),
  constraint customers_email_not_blank check (
    email is null or length(btrim(email)) > 0
  )
);

-- Un documento informado identifica un solo cliente sin importar mayúsculas o
-- espacios laterales. No se hace UNIQUE por teléfono: familias/empresas pueden
-- compartir un número y un cliente puede cambiarlo.
create unique index if not exists uq_customers_document_normalized
  on public.customers (lower(btrim(document_number)))
  where document_number is not null and length(btrim(document_number)) > 0;

create index if not exists idx_customers_name on public.customers (lower(full_name));
create index if not exists idx_customers_phone on public.customers (phone);
create index if not exists idx_customers_created_at on public.customers (created_at desc);

comment on table public.customers is
  'Cliente canónico del ERP. Las ventas conservan snapshots históricos; actualizar esta fila no reescribe comprobantes previos.';

comment on column public.customers.document_type is
  'Tipo documental libre en Fase 1A para soportar CC, CE, pasaporte, NIT y documentos extranjeros sin imponer una taxonomía incompleta.';

comment on column public.customers.document_number is
  'Identificador documental opcional. Si existe, es único de forma case-insensitive y sin espacios laterales.';

comment on column public.customers.active is
  'Soft state. El ERP no expone borrado duro de clientes en Fase 1A.';

-- updated_at real, a diferencia de products.updated_at histórico.
drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.erp_set_updated_at();

-- ============================================================================
-- 2. product_units — cada computador físico
-- ============================================================================
--
-- products = producto/modelo/configuración comercial.
-- product_units = máquina física real que entra, se inspecciona, reserva,
-- vende, vuelve por garantía, se repara o se retira.

create table if not exists public.product_units (
  id                      uuid        not null default gen_random_uuid(),
  product_id              uuid        not null,
  unit_code               text        not null,
  serial_number           text,
  status                  text        not null default 'received',
  acquisition_cost_cop    bigint,
  battery_health_percent  integer,
  storage_health_percent  integer,
  spec_overrides          jsonb       not null default '{}'::jsonb,
  images                  text[]      not null default '{}'::text[],
  notes                   text,
  received_at             timestamptz not null default now(),
  sold_at                 timestamptz,
  created_by              uuid,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint product_units_pkey primary key (id),
  constraint product_units_product_id_fkey
    foreign key (product_id) references public.products(id) on delete restrict,
  constraint product_units_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null,
  constraint product_units_unit_code_key unique (unit_code),
  constraint product_units_unit_code_not_blank check (length(btrim(unit_code)) > 0),
  constraint product_units_serial_not_blank check (
    serial_number is null or length(btrim(serial_number)) > 0
  ),
  constraint product_units_status_check check (status in (
    'received',
    'inspection',
    'available',
    'reserved',
    'sold',
    'warranty',
    'repair',
    'returned',
    'retired'
  )),
  constraint product_units_acquisition_cost_non_negative check (
    acquisition_cost_cop is null or acquisition_cost_cop >= 0
  ),
  constraint product_units_battery_health_range check (
    battery_health_percent is null or battery_health_percent between 0 and 100
  ),
  constraint product_units_storage_health_range check (
    storage_health_percent is null or storage_health_percent between 0 and 100
  ),
  constraint product_units_spec_overrides_object check (
    jsonb_typeof(spec_overrides) = 'object'
  ),
  constraint product_units_sold_at_consistency check (
    (status = 'sold' and sold_at is not null)
    or (status <> 'sold')
  )
);

create unique index if not exists uq_product_units_serial_normalized
  on public.product_units (lower(btrim(serial_number)))
  where serial_number is not null and length(btrim(serial_number)) > 0;

create index if not exists idx_product_units_product_status
  on public.product_units (product_id, status);
create index if not exists idx_product_units_status
  on public.product_units (status);
create index if not exists idx_product_units_created_at
  on public.product_units (created_at desc);

comment on table public.product_units is
  'Inventario físico por máquina. No sustituye products.stock todavía; la sincronización de stock se activa solo después de migrar y verificar unidades existentes.';

comment on column public.product_units.unit_code is
  'Código interno legible del ERP (ej. STU-000123). Lo genera la capa de dominio; no depende del serial del fabricante.';

comment on column public.product_units.spec_overrides is
  'Solo diferencias verificadas de esta unidad frente al producto comercial (ej. RAM/SSD efectivamente instalados). Nunca usar para inventar especificaciones.';

comment on column public.product_units.images is
  'Fotos específicas de la unidad física. Las imágenes comerciales generales permanecen en products.images.';

drop trigger if exists product_units_set_updated_at on public.product_units;
create trigger product_units_set_updated_at
  before update on public.product_units
  for each row execute function public.erp_set_updated_at();

-- ============================================================================
-- 3. inventory_movements — historial inmutable de inventario
-- ============================================================================
--
-- En Fase 1A todavía no se expone una operación de transición de estado al
-- agente. Cuando se implemente, deberá escribir unit + movimiento dentro de
-- una única operación transaccional. Esta tabla no permite UPDATE/DELETE por
-- la aplicación: corregir un hecho se hará con un movimiento compensatorio.

create table if not exists public.inventory_movements (
  id              uuid        not null default gen_random_uuid(),
  unit_id          uuid        not null,
  product_id       uuid        not null,
  movement_type    text        not null,
  from_status      text,
  to_status        text,
  reference_type  text,
  reference_id    uuid,
  reason           text,
  source           text        not null default 'web_admin',
  actor_ref        text,
  metadata         jsonb       not null default '{}'::jsonb,
  created_by       uuid,
  created_at       timestamptz not null default now(),

  constraint inventory_movements_pkey primary key (id),
  constraint inventory_movements_unit_id_fkey
    foreign key (unit_id) references public.product_units(id) on delete restrict,
  constraint inventory_movements_product_id_fkey
    foreign key (product_id) references public.products(id) on delete restrict,
  constraint inventory_movements_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null,
  constraint inventory_movements_type_check check (movement_type in (
    'receipt',
    'inspection',
    'available',
    'reserve',
    'release_reservation',
    'sale',
    'return',
    'warranty_in',
    'warranty_out',
    'repair_in',
    'repair_out',
    'adjustment',
    'retire'
  )),
  constraint inventory_movements_from_status_check check (
    from_status is null or from_status in (
      'received','inspection','available','reserved','sold','warranty','repair','returned','retired'
    )
  ),
  constraint inventory_movements_to_status_check check (
    to_status is null or to_status in (
      'received','inspection','available','reserved','sold','warranty','repair','returned','retired'
    )
  ),
  constraint inventory_movements_source_check check (source in (
    'web_admin', 'whatsapp_admin', 'system', 'migration'
  )),
  constraint inventory_movements_metadata_object check (
    jsonb_typeof(metadata) = 'object'
  )
);

create index if not exists idx_inventory_movements_unit_created
  on public.inventory_movements (unit_id, created_at desc);
create index if not exists idx_inventory_movements_product_created
  on public.inventory_movements (product_id, created_at desc);
create index if not exists idx_inventory_movements_reference
  on public.inventory_movements (reference_type, reference_id);

comment on table public.inventory_movements is
  'Ledger inmutable de cambios físicos de inventario. No se corrigen filas: se agregan movimientos compensatorios.';

comment on column public.inventory_movements.actor_ref is
  'Referencia no secreta del actor. Para WhatsApp debe usarse un identificador seguro/pseudonimizado definido por la capa del agente; no almacenar tokens.';

-- ============================================================================
-- 4. audit_events — auditoría transversal del ERP
-- ============================================================================

create table if not exists public.audit_events (
  id                uuid        not null default gen_random_uuid(),
  actor_type        text        not null,
  actor_ref         text,
  channel           text        not null,
  operation         text        not null,
  entity_type       text        not null,
  entity_id         uuid,
  request_id        text,
  confirmation_id   text,
  before_snapshot   jsonb,
  after_snapshot    jsonb,
  metadata          jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),

  constraint audit_events_pkey primary key (id),
  constraint audit_events_actor_type_check check (actor_type in (
    'web_admin', 'whatsapp_admin', 'system', 'migration'
  )),
  constraint audit_events_channel_check check (channel in (
    'web', 'whatsapp', 'api', 'system', 'migration'
  )),
  constraint audit_events_operation_not_blank check (length(btrim(operation)) > 0),
  constraint audit_events_entity_type_not_blank check (length(btrim(entity_type)) > 0),
  constraint audit_events_before_object check (
    before_snapshot is null or jsonb_typeof(before_snapshot) = 'object'
  ),
  constraint audit_events_after_object check (
    after_snapshot is null or jsonb_typeof(after_snapshot) = 'object'
  ),
  constraint audit_events_metadata_object check (
    jsonb_typeof(metadata) = 'object'
  )
);

create index if not exists idx_audit_events_created_at
  on public.audit_events (created_at desc);
create index if not exists idx_audit_events_entity
  on public.audit_events (entity_type, entity_id, created_at desc);
create index if not exists idx_audit_events_request_id
  on public.audit_events (request_id)
  where request_id is not null;

comment on table public.audit_events is
  'Auditoría inmutable de mutaciones relevantes del ERP. No debe contener service keys, access tokens, App Secrets ni contenido secreto.';

-- ============================================================================
-- 5. RLS — todo el núcleo ERP es privado
-- ============================================================================

alter table public.customers enable row level security;
alter table public.product_units enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.audit_events enable row level security;

-- Evitar depender de defaults de grants del esquema public.
revoke all on table public.customers from anon;
revoke all on table public.product_units from anon;
revoke all on table public.inventory_movements from anon;
revoke all on table public.audit_events from anon;

grant select, insert, update on table public.customers to authenticated;
grant select, insert, update on table public.product_units to authenticated;
grant select, insert on table public.inventory_movements to authenticated;
grant select, insert on table public.audit_events to authenticated;

-- customers: sin DELETE duro en Fase 1A.
drop policy if exists "customers admin read" on public.customers;
create policy "customers admin read"
  on public.customers for select to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

drop policy if exists "customers admin insert" on public.customers;
create policy "customers admin insert"
  on public.customers for insert to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

drop policy if exists "customers admin update" on public.customers;
create policy "customers admin update"
  on public.customers for update to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- product_units: sin DELETE duro. En una fase posterior las transiciones de
-- estado se encapsulan en una operación transaccional; Fase 1A no expone
-- todavía esa mutación desde el agente.
drop policy if exists "product_units admin read" on public.product_units;
create policy "product_units admin read"
  on public.product_units for select to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

drop policy if exists "product_units admin insert" on public.product_units;
create policy "product_units admin insert"
  on public.product_units for insert to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

drop policy if exists "product_units admin update" on public.product_units;
create policy "product_units admin update"
  on public.product_units for update to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- Ledgers: lectura + append; nunca UPDATE/DELETE desde authenticated.
drop policy if exists "inventory_movements admin read" on public.inventory_movements;
create policy "inventory_movements admin read"
  on public.inventory_movements for select to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

drop policy if exists "inventory_movements admin insert" on public.inventory_movements;
create policy "inventory_movements admin insert"
  on public.inventory_movements for insert to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

drop policy if exists "audit_events admin read" on public.audit_events;
create policy "audit_events admin read"
  on public.audit_events for select to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

drop policy if exists "audit_events admin insert" on public.audit_events;
create policy "audit_events admin insert"
  on public.audit_events for insert to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- ============================================================================
-- 6. Verificaciones estructurales esperadas después de aplicar en STAGING
-- ============================================================================
--
-- select tablename, rowsecurity
-- from pg_tables
-- where schemaname='public'
--   and tablename in ('customers','product_units','inventory_movements','audit_events');
--
-- select schemaname, tablename, policyname, cmd, roles
-- from pg_policies
-- where schemaname='public'
--   and tablename in ('customers','product_units','inventory_movements','audit_events')
-- order by tablename, policyname;
--
-- STAGING también debe probar:
-- - anon no puede SELECT/INSERT/UPDATE/DELETE en ninguna tabla ERP;
-- - authenticated no-admin no puede leer ni escribir;
-- - admin puede crear/leer/actualizar customer y product_unit;
-- - admin puede append/read inventory_movements y audit_events;
-- - UPDATE/DELETE de inventory_movements/audit_events falla;
-- - serial normalizado duplicado falla;
-- - document_number normalizado duplicado falla;
-- - status inválido falla;
-- - porcentajes fuera de 0..100 fallan.

-- ============================================================================
-- 7. ROLLBACK manual — NO ejecutar junto con la migración
-- ============================================================================
--
-- drop policy if exists "audit_events admin insert" on public.audit_events;
-- drop policy if exists "audit_events admin read" on public.audit_events;
-- drop policy if exists "inventory_movements admin insert" on public.inventory_movements;
-- drop policy if exists "inventory_movements admin read" on public.inventory_movements;
-- drop policy if exists "product_units admin update" on public.product_units;
-- drop policy if exists "product_units admin insert" on public.product_units;
-- drop policy if exists "product_units admin read" on public.product_units;
-- drop policy if exists "customers admin update" on public.customers;
-- drop policy if exists "customers admin insert" on public.customers;
-- drop policy if exists "customers admin read" on public.customers;
--
-- drop table if exists public.audit_events;
-- drop table if exists public.inventory_movements;
-- drop trigger if exists product_units_set_updated_at on public.product_units;
-- drop table if exists public.product_units;
-- drop trigger if exists customers_set_updated_at on public.customers;
-- drop table if exists public.customers;
-- drop function if exists public.erp_set_updated_at();
