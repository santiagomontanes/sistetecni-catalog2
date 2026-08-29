-- SISTETECNI ERP — Fase 1G
-- Proveedores + compras + recepción atómica por lote + costo de adquisición real por STU.
--
-- Una compra recibida es inmutable en 1G. Cada computador físico es una línea
-- individual de purchase_items y queda ligado a su product_unit. Los costos
-- compartidos del lote se distribuyen en pesos enteros, sin floats, de modo que
-- la suma de landed_cost_cop coincide exactamente con purchases.total_cost_cop.

-- ============================================================================
-- 1. Proveedores canónicos
-- ============================================================================
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document_type text,
  document_number text,
  contact_name text,
  phone text,
  email text,
  address text,
  city text,
  notes text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_name_not_blank check (length(btrim(name)) > 0),
  constraint suppliers_document_not_blank check (document_number is null or length(btrim(document_number)) > 0),
  constraint suppliers_phone_not_blank check (phone is null or length(btrim(phone)) > 0),
  constraint suppliers_email_not_blank check (email is null or length(btrim(email)) > 0)
);

create unique index if not exists uq_suppliers_document_normalized
  on public.suppliers(lower(btrim(document_number)))
  where document_number is not null and length(btrim(document_number)) > 0;
create index if not exists idx_suppliers_name on public.suppliers(lower(name));
create index if not exists idx_suppliers_active on public.suppliers(active, name);

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.erp_set_updated_at();

-- ============================================================================
-- 2. Compras y líneas serializadas
-- ============================================================================
create sequence if not exists public.purchase_number_seq start with 1 increment by 1;
grant usage, select on sequence public.purchase_number_seq to authenticated;

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_number text not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  supplier_name_snapshot text not null,
  supplier_document_snapshot text,
  supplier_phone_snapshot text,
  supplier_invoice_reference text,
  purchase_date date not null default current_date,
  status text not null default 'received',
  item_count integer not null,
  merchandise_subtotal_cop bigint not null,
  shared_costs_cop bigint not null default 0,
  total_cost_cop bigint not null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchases_number_format check (purchase_number ~ '^COMP-[0-9]{6}$'),
  constraint purchases_status_check check (status in ('received')),
  constraint purchases_item_count_positive check (item_count between 1 and 100),
  constraint purchases_money_non_negative check (
    merchandise_subtotal_cop >= 0 and shared_costs_cop >= 0 and total_cost_cop >= 0
  ),
  constraint purchases_total_consistency check (
    total_cost_cop = merchandise_subtotal_cop + shared_costs_cop
  )
);
create index if not exists idx_purchases_supplier_date on public.purchases(supplier_id, purchase_date desc);
create index if not exists idx_purchases_created_at on public.purchases(created_at desc);
create index if not exists idx_purchases_invoice_ref on public.purchases(supplier_invoice_reference)
  where supplier_invoice_reference is not null;

drop trigger if exists purchases_set_updated_at on public.purchases;
create trigger purchases_set_updated_at
  before update on public.purchases
  for each row execute function public.erp_set_updated_at();

alter table public.product_units
  add column if not exists purchase_id uuid references public.purchases(id) on delete restrict;
create index if not exists idx_product_units_purchase on public.product_units(purchase_id)
  where purchase_id is not null;

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_unit_id uuid not null unique references public.product_units(id) on delete restrict,
  product_name_snapshot text not null,
  unit_code_snapshot text not null,
  serial_number_snapshot text,
  base_cost_cop bigint not null,
  allocated_extra_cost_cop bigint not null default 0,
  landed_cost_cop bigint not null,
  sort_order integer not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint purchase_items_money_non_negative check (
    base_cost_cop >= 0 and allocated_extra_cost_cop >= 0 and landed_cost_cop >= 0
  ),
  constraint purchase_items_landed_consistency check (
    landed_cost_cop = base_cost_cop + allocated_extra_cost_cop
  ),
  constraint purchase_items_sort_non_negative check (sort_order >= 0),
  constraint purchase_items_purchase_sort_unique unique (purchase_id, sort_order)
);
create index if not exists idx_purchase_items_purchase_order on public.purchase_items(purchase_id, sort_order);
create index if not exists idx_purchase_items_product on public.purchase_items(product_id);

comment on table public.suppliers is 'Fase 1G: proveedor canónico. Las compras conservan snapshots para que el histórico no cambie al editar el proveedor.';
comment on table public.purchases is 'Fase 1G: compra/lote recibido. En 1G no se edita ni cancela una compra recibida; una corrección requerirá flujo compensatorio posterior.';
comment on table public.purchase_items is 'Fase 1G: una línea por computador físico. landed_cost_cop es el costo de adquisición del STU después de distribuir costos compartidos del lote.';
comment on column public.product_units.purchase_id is 'Compra 1G que originó esta unidad. NULL identifica recepciones históricas/sueltas anteriores a 1G.';

-- ============================================================================
-- 3. RLS privado, admin-only
-- ============================================================================
alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

revoke all on table public.suppliers from anon;
revoke all on table public.purchases from anon;
revoke all on table public.purchase_items from anon;

grant select, insert, update on table public.suppliers to authenticated;
grant select, insert on table public.purchases to authenticated;
grant select, insert on table public.purchase_items to authenticated;

create policy "suppliers admin read" on public.suppliers for select to authenticated
  using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
create policy "suppliers admin insert" on public.suppliers for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
create policy "suppliers admin update" on public.suppliers for update to authenticated
  using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true))
  with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));

create policy "purchases admin read" on public.purchases for select to authenticated
  using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
create policy "purchases admin insert" on public.purchases for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
create policy "purchase_items admin read" on public.purchase_items for select to authenticated
  using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
create policy "purchase_items admin insert" on public.purchase_items for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));

-- ============================================================================
-- 4. Crear proveedor + auditoría
-- ============================================================================
create or replace function public.erp_create_supplier(
  p_name text,
  p_document_type text default null,
  p_document_number text default null,
  p_contact_name text default null,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_city text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null or not exists(select 1 from public.profiles p where p.id=v_actor and p.is_admin=true) then
    raise exception 'erp_admin_required' using errcode='42501';
  end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null then raise exception 'supplier_name_required'; end if;

  insert into public.suppliers(name,document_type,document_number,contact_name,phone,email,address,city,notes,created_by)
  values(
    btrim(p_name),nullif(btrim(coalesce(p_document_type,'')),''),nullif(btrim(coalesce(p_document_number,'')),''),
    nullif(btrim(coalesce(p_contact_name,'')),''),nullif(btrim(coalesce(p_phone,'')),''),nullif(btrim(coalesce(p_email,'')),''),
    nullif(btrim(coalesce(p_address,'')),''),nullif(btrim(coalesce(p_city,'')),''),nullif(btrim(coalesce(p_notes,'')),''),v_actor
  ) returning id into v_id;

  insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,after_snapshot,metadata)
  values('web_admin',v_actor::text,'web','supplier.create','supplier',v_id,
    jsonb_strip_nulls(jsonb_build_object('name',btrim(p_name),'documentNumber',nullif(btrim(coalesce(p_document_number,'')),''),'phonePresent',nullif(btrim(coalesce(p_phone,'')),'') is not null,'city',nullif(btrim(coalesce(p_city,'')),''))),
    jsonb_build_object('source','admin_panel'));
  return v_id;
end;
$$;
revoke all on function public.erp_create_supplier(text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.erp_create_supplier(text,text,text,text,text,text,text,text,text) to authenticated;

-- ============================================================================
-- 5. Recibir compra/lote completa en una sola transacción
-- p_units: array de objetos con productId, serialNumber?, baseCostCop,
-- batteryHealthPercent?, storageHealthPercent?, specOverrides?, notes?.
-- ============================================================================
create or replace function public.erp_receive_purchase_batch(
  p_supplier_id uuid,
  p_supplier_invoice_reference text,
  p_purchase_date date,
  p_shared_costs_cop bigint,
  p_notes text,
  p_units jsonb
)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_supplier public.suppliers%rowtype;
  v_purchase_id uuid;
  v_purchase_number text;
  v_count integer;
  v_subtotal bigint := 0;
  v_shared bigint := coalesce(p_shared_costs_cop,0);
  v_share_base bigint;
  v_share_remainder bigint;
  v_entry jsonb;
  v_ord bigint;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_serial text;
  v_base_cost bigint;
  v_allocated bigint;
  v_landed bigint;
  v_battery integer;
  v_storage_health integer;
  v_specs jsonb;
  v_unit_notes text;
  v_unit_id uuid;
  v_unit_code text;
begin
  if v_actor is null or not exists(select 1 from public.profiles p where p.id=v_actor and p.is_admin=true) then
    raise exception 'erp_admin_required' using errcode='42501';
  end if;
  if p_supplier_id is null then raise exception 'supplier_required'; end if;
  if v_shared < 0 then raise exception 'shared_cost_invalid'; end if;
  if p_purchase_date is null then raise exception 'purchase_date_required'; end if;
  if p_units is null or jsonb_typeof(p_units) <> 'array' then raise exception 'purchase_units_must_be_array'; end if;

  v_count := jsonb_array_length(p_units);
  if v_count < 1 or v_count > 100 then raise exception 'purchase_unit_count_invalid'; end if;

  select * into v_supplier from public.suppliers where id=p_supplier_id and active=true;
  if not found then raise exception 'supplier_not_found_or_inactive'; end if;

  -- Prevalidar y sumar antes de crear cabecera. Un error aborta todo el lote.
  for v_entry, v_ord in select value, ordinality from jsonb_array_elements(p_units) with ordinality loop
    begin
      v_product_id := (v_entry->>'productId')::uuid;
    exception when others then
      raise exception 'invalid_product_id_at:%',v_ord;
    end;
    if not exists(select 1 from public.products p where p.id=v_product_id) then raise exception 'product_not_found_at:%',v_ord; end if;
    if coalesce(v_entry->>'baseCostCop','') !~ '^[0-9]+$' then raise exception 'invalid_base_cost_at:%',v_ord; end if;
    v_base_cost := (v_entry->>'baseCostCop')::bigint;
    v_subtotal := v_subtotal + v_base_cost;
    v_specs := coalesce(v_entry->'specOverrides','{}'::jsonb);
    if jsonb_typeof(v_specs) <> 'object' then raise exception 'invalid_spec_overrides_at:%',v_ord; end if;
    if v_entry ? 'batteryHealthPercent' and v_entry->>'batteryHealthPercent' is not null and v_entry->>'batteryHealthPercent' <> '' then
      v_battery := (v_entry->>'batteryHealthPercent')::integer;
      if v_battery not between 0 and 100 then raise exception 'invalid_battery_at:%',v_ord; end if;
    end if;
    if v_entry ? 'storageHealthPercent' and v_entry->>'storageHealthPercent' is not null and v_entry->>'storageHealthPercent' <> '' then
      v_storage_health := (v_entry->>'storageHealthPercent')::integer;
      if v_storage_health not between 0 and 100 then raise exception 'invalid_storage_health_at:%',v_ord; end if;
    end if;
  end loop;

  v_purchase_number := 'COMP-'||lpad(nextval('public.purchase_number_seq')::text,6,'0');
  insert into public.purchases(
    purchase_number,supplier_id,supplier_name_snapshot,supplier_document_snapshot,supplier_phone_snapshot,
    supplier_invoice_reference,purchase_date,status,item_count,merchandise_subtotal_cop,shared_costs_cop,total_cost_cop,notes,created_by
  ) values(
    v_purchase_number,v_supplier.id,v_supplier.name,v_supplier.document_number,v_supplier.phone,
    nullif(btrim(coalesce(p_supplier_invoice_reference,'')),''),p_purchase_date,'received',v_count,v_subtotal,v_shared,v_subtotal+v_shared,
    nullif(btrim(coalesce(p_notes,'')),''),v_actor
  ) returning id into v_purchase_id;

  v_share_base := v_shared / v_count;
  v_share_remainder := mod(v_shared,v_count);

  for v_entry, v_ord in select value, ordinality from jsonb_array_elements(p_units) with ordinality loop
    v_product_id := (v_entry->>'productId')::uuid;
    select * into v_product from public.products where id=v_product_id;
    v_serial := nullif(btrim(coalesce(v_entry->>'serialNumber','')),'');
    v_base_cost := (v_entry->>'baseCostCop')::bigint;
    v_allocated := v_share_base + case when v_ord <= v_share_remainder then 1 else 0 end;
    v_landed := v_base_cost + v_allocated;
    v_battery := case when coalesce(v_entry->>'batteryHealthPercent','')='' then null else (v_entry->>'batteryHealthPercent')::integer end;
    v_storage_health := case when coalesce(v_entry->>'storageHealthPercent','')='' then null else (v_entry->>'storageHealthPercent')::integer end;
    v_specs := coalesce(v_entry->'specOverrides','{}'::jsonb);
    v_unit_notes := nullif(btrim(coalesce(v_entry->>'notes','')),'');
    v_unit_code := 'STU-'||lpad(nextval('public.product_unit_code_seq')::text,6,'0');

    insert into public.product_units(
      product_id,unit_code,serial_number,status,acquisition_cost_cop,battery_health_percent,storage_health_percent,
      spec_overrides,notes,purchase_id,created_by
    ) values(
      v_product_id,v_unit_code,v_serial,'received',v_landed,v_battery,v_storage_health,v_specs,v_unit_notes,v_purchase_id,v_actor
    ) returning id into v_unit_id;

    insert into public.purchase_items(
      purchase_id,product_id,product_unit_id,product_name_snapshot,unit_code_snapshot,serial_number_snapshot,
      base_cost_cop,allocated_extra_cost_cop,landed_cost_cop,sort_order,notes
    ) values(
      v_purchase_id,v_product_id,v_unit_id,v_product.title,v_unit_code,v_serial,
      v_base_cost,v_allocated,v_landed,(v_ord-1)::integer,v_unit_notes
    );

    insert into public.inventory_movements(
      unit_id,product_id,movement_type,from_status,to_status,reference_type,reference_id,reason,source,actor_ref,metadata,created_by
    ) values(
      v_unit_id,v_product_id,'receipt',null,'received','purchase',v_purchase_id,'Recepción por compra '||v_purchase_number,
      'web_admin',v_actor::text,jsonb_strip_nulls(jsonb_build_object(
        'purchaseNumber',v_purchase_number,'unitCode',v_unit_code,'baseCostCop',v_base_cost,
        'allocatedExtraCostCop',v_allocated,'landedCostCop',v_landed,'supplierId',v_supplier.id
      )),v_actor
    );

    insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,after_snapshot,metadata)
    values('web_admin',v_actor::text,'web','inventory.receive_purchase','product_unit',v_unit_id,
      jsonb_strip_nulls(jsonb_build_object('unitCode',v_unit_code,'productId',v_product_id,'purchaseId',v_purchase_id,'status','received','acquisitionCostCop',v_landed,'serialPresent',v_serial is not null)),
      jsonb_build_object('purchaseNumber',v_purchase_number,'source','admin_panel'));
  end loop;

  insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,after_snapshot,metadata)
  values('web_admin',v_actor::text,'web','purchase.receive','purchase',v_purchase_id,
    jsonb_build_object('purchaseNumber',v_purchase_number,'supplierId',v_supplier.id,'itemCount',v_count,'merchandiseSubtotalCop',v_subtotal,'sharedCostsCop',v_shared,'totalCostCop',v_subtotal+v_shared,'status','received'),
    jsonb_build_object('source','admin_panel'));

  return v_purchase_id;
end;
$$;
revoke all on function public.erp_receive_purchase_batch(uuid,text,date,bigint,text,jsonb) from public;
grant execute on function public.erp_receive_purchase_batch(uuid,text,date,bigint,text,jsonb) to authenticated;

-- ============================================================================
-- 6. Inmutabilidad del origen/costo de una unidad recibida por compra
-- ============================================================================
create or replace function public.erp_guard_purchase_unit_cost_identity()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
begin
  if old.purchase_id is not null and (
    new.purchase_id is distinct from old.purchase_id
    or new.acquisition_cost_cop is distinct from old.acquisition_cost_cop
  ) then
    raise exception 'purchase_linked_unit_cost_is_immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists product_units_guard_purchase_cost_identity on public.product_units;
create trigger product_units_guard_purchase_cost_identity
  before update on public.product_units
  for each row execute function public.erp_guard_purchase_unit_cost_identity();

comment on function public.erp_receive_purchase_batch(uuid,text,date,bigint,text,jsonb) is
  'Fase 1G: crea COMP + STU + purchase_items + receipt movements + auditoría de un lote en una sola transacción. Distribuye shared_costs_cop exactamente entre las unidades.';
