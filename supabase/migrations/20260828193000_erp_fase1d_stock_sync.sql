-- SISTETECNI ERP — Fase 1D
-- Sincronización controlada del stock comercial con el inventario físico.
--
-- Objetivos:
-- - mantener products.stock como contrato estable para catálogo/personalizador;
-- - permitir migración gradual: cada producto decide si su stock sigue manual
--   o pasa a estar gestionado por product_units;
-- - cuando ERP gestiona el producto, stock = COUNT(product_units status='available');
-- - cualquier cambio de estado físico relevante recalcula stock en la MISMA
--   transacción que originó el cambio;
-- - impedir que una edición manual sobrescriba stock de un producto gestionado;
-- - no cambiar automáticamente ningún producto existente al aplicar la migración.
--
-- Dependencias:
--   20260827183000_erp_core_fase1a.sql
--   20260828130000_erp_fase1c_sale_by_unit.sql

-- ============================================================================
-- 1. Modo de fuente de stock por producto
-- ============================================================================

alter table public.products
  add column if not exists erp_stock_enabled boolean not null default false,
  add column if not exists erp_stock_synced_at timestamptz;

comment on column public.products.erp_stock_enabled is
  'false = stock manual histórico; true = products.stock se deriva exclusivamente de product_units con status=available.';

comment on column public.products.erp_stock_synced_at is
  'Último recálculo automático del stock ERP. Null mientras el producto use stock manual.';

-- Ningún UPDATE masivo aquí: todos los productos existentes continúan en modo
-- manual hasta que un administrador active explícitamente el modo ERP.

-- ============================================================================
-- 2. Cálculo y sincronización central
-- ============================================================================

create or replace function public.erp_available_stock(p_product_id uuid)
returns integer
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select count(*)::integer
  from public.product_units u
  where u.product_id = p_product_id
    and u.status = 'available';
$$;

revoke all on function public.erp_available_stock(uuid) from public;
grant execute on function public.erp_available_stock(uuid) to authenticated;

comment on function public.erp_available_stock(uuid) is
  'Fase 1D: cantidad vendible real de un producto = unidades físicas status=available.';

create or replace function public.erp_sync_product_stock(p_product_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_stock integer;
begin
  select count(*)::integer into v_stock
  from public.product_units u
  where u.product_id = p_product_id
    and u.status = 'available';

  update public.products p
  set stock = v_stock,
      erp_stock_synced_at = now()
  where p.id = p_product_id
    and p.erp_stock_enabled = true;

  return v_stock;
end;
$$;

revoke all on function public.erp_sync_product_stock(uuid) from public;
grant execute on function public.erp_sync_product_stock(uuid) to authenticated;

comment on function public.erp_sync_product_stock(uuid) is
  'Fase 1D: recalcula products.stock solo si el producto tiene erp_stock_enabled=true.';

-- ============================================================================
-- 3. Protección contra edición manual de stock gestionado
-- ============================================================================

create or replace function public.erp_guard_managed_product_stock()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_expected integer;
begin
  if new.erp_stock_enabled = true then
    select count(*)::integer into v_expected
    from public.product_units u
    where u.product_id = new.id
      and u.status = 'available';

    new.stock := v_expected;
    new.erp_stock_synced_at := now();
  elsif old.erp_stock_enabled = true and new.erp_stock_enabled = false then
    -- Al volver a modo manual se conserva el último valor sincronizado como
    -- punto de partida. A partir de ahí el administrador podrá editarlo.
    new.erp_stock_synced_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists products_guard_managed_stock on public.products;
create trigger products_guard_managed_stock
  before update of stock, erp_stock_enabled on public.products
  for each row execute function public.erp_guard_managed_product_stock();

comment on function public.erp_guard_managed_product_stock() is
  'Fase 1D: impide que products.stock diverja del conteo available mientras erp_stock_enabled=true.';

-- ============================================================================
-- 4. Sincronización automática ante cambios de product_units
-- ============================================================================

create or replace function public.erp_sync_stock_from_unit_change()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.erp_sync_product_stock(old.product_id);
    return old;
  end if;

  if tg_op = 'INSERT' then
    perform public.erp_sync_product_stock(new.product_id);
    return new;
  end if;

  -- UPDATE: si cambió de producto (caso extraordinario), sincronizar ambos.
  if old.product_id is distinct from new.product_id then
    perform public.erp_sync_product_stock(old.product_id);
    perform public.erp_sync_product_stock(new.product_id);
  elsif old.status is distinct from new.status then
    perform public.erp_sync_product_stock(new.product_id);
  end if;

  return new;
end;
$$;

drop trigger if exists product_units_sync_web_stock on public.product_units;
create trigger product_units_sync_web_stock
  after insert or delete or update of status, product_id on public.product_units
  for each row execute function public.erp_sync_stock_from_unit_change();

comment on function public.erp_sync_stock_from_unit_change() is
  'Fase 1D: mantiene el stock comercial sincronizado dentro de la transacción de cada cambio físico.';

-- ============================================================================
-- 5. Activación/desactivación explícita por producto
-- ============================================================================

create or replace function public.erp_set_product_stock_mode(
  p_product_id uuid,
  p_enabled boolean
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_product public.products%rowtype;
  v_available integer;
  v_final_stock integer;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p where p.id = v_actor and p.is_admin = true
  ) then
    raise exception 'erp_admin_required' using errcode = '42501';
  end if;

  if p_enabled is null then
    raise exception 'stock_mode_required';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'product_not_found';
  end if;

  select count(*)::integer into v_available
  from public.product_units u
  where u.product_id = p_product_id
    and u.status = 'available';

  -- Idempotente: si ya está en el modo solicitado, solo fuerza una
  -- resincronización cuando está gestionado por ERP.
  if v_product.erp_stock_enabled = p_enabled then
    if p_enabled then
      update public.products
      set stock = v_available,
          erp_stock_synced_at = now()
      where id = p_product_id;
      return v_available;
    end if;
    return v_product.stock;
  end if;

  if p_enabled then
    update public.products
    set erp_stock_enabled = true,
        stock = v_available,
        erp_stock_synced_at = now()
    where id = p_product_id;
    v_final_stock := v_available;
  else
    update public.products
    set erp_stock_enabled = false,
        erp_stock_synced_at = null
    where id = p_product_id;
    v_final_stock := v_product.stock;
  end if;

  insert into public.audit_events (
    actor_type, actor_ref, channel, operation, entity_type, entity_id,
    before_snapshot, after_snapshot, metadata
  ) values (
    'web_admin', v_actor::text, 'web',
    case when p_enabled then 'inventory.stock_erp_enable' else 'inventory.stock_erp_disable' end,
    'product', p_product_id,
    jsonb_build_object(
      'erpStockEnabled', v_product.erp_stock_enabled,
      'stock', v_product.stock
    ),
    jsonb_build_object(
      'erpStockEnabled', p_enabled,
      'stock', v_final_stock,
      'availableUnits', v_available
    ),
    jsonb_build_object('source', 'admin_panel')
  );

  return v_final_stock;
end;
$$;

revoke all on function public.erp_set_product_stock_mode(uuid, boolean) from public;
grant execute on function public.erp_set_product_stock_mode(uuid, boolean) to authenticated;

comment on function public.erp_set_product_stock_mode(uuid, boolean) is
  'Fase 1D: activa/desactiva de forma explícita la fuente ERP de products.stock. Al activar recalcula inmediatamente desde status=available.';

-- ============================================================================
-- 6. Invariantes de Fase 1D
-- ============================================================================
-- - aplicar esta migración NO altera stock de productos existentes porque
--   erp_stock_enabled inicia false;
-- - modo manual: products.stock conserva comportamiento histórico;
-- - modo ERP: products.stock = count(product_units where status=available);
-- - received/inspection/reserved/sold/warranty/repair/returned/retired NO cuentan;
-- - available sí cuenta;
-- - venta Fase 1C available->sold decrementa stock dentro de la misma transacción;
-- - mark available incrementa stock dentro de la misma transacción;
-- - una edición manual de products.stock no puede romper el invariante ERP;
-- - catálogo/personalizador siguen leyendo products.stock sin cambios de contrato.
