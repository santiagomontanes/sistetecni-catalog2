-- SISTETECNI ERP — Fase 1E (guards adicionales)
-- 1) diferencia reparación pre-venta vs. postventa;
-- 2) una unidad reservada solo puede venderse al cliente de esa reserva.

create or replace function public.erp_guard_repair_sale_history()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.status = 'repair' and new.status = 'available' and old.sold_at is not null then
    raise exception 'sold_unit_repair_cannot_return_to_available';
  end if;

  if old.status in ('repair','warranty') and new.status = 'sold' and old.sold_at is null then
    raise exception 'sold_transition_requires_prior_sale';
  end if;

  return new;
end;
$$;

drop trigger if exists product_units_guard_repair_sale_history on public.product_units;
create trigger product_units_guard_repair_sale_history
  before update of status on public.product_units
  for each row execute function public.erp_guard_repair_sale_history();

comment on function public.erp_guard_repair_sale_history() is
  'Fase 1E: una reparación postventa solo vuelve al cliente (sold) o se retira; una reparación preventa puede volver a available pero nunca crear sold sin venta.';

create or replace function public.erp_guard_reserved_sale_customer()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_unit public.product_units%rowtype;
  v_sale public.sales%rowtype;
  v_reserved_phone text;
  v_sale_phone text;
  v_phone_matches boolean;
begin
  if new.product_unit_id is null then
    return new;
  end if;

  select * into v_unit
  from public.product_units
  where id = new.product_unit_id;

  if not found or v_unit.status <> 'reserved' then
    return new;
  end if;

  select * into v_sale
  from public.sales
  where id = new.sale_id;

  if not found then
    raise exception 'sale_not_found_for_reserved_unit';
  end if;

  v_reserved_phone := regexp_replace(coalesce(v_unit.reservation_customer_phone, ''), '[^0-9]', '', 'g');
  v_sale_phone := regexp_replace(coalesce(v_sale.customer_phone, ''), '[^0-9]', '', 'g');

  if length(v_reserved_phone) >= 7 then
    v_phone_matches := case
      when length(v_reserved_phone) >= 10 and length(v_sale_phone) >= 10
        then right(v_reserved_phone, 10) = right(v_sale_phone, 10)
      else v_reserved_phone = v_sale_phone
    end;

    if not v_phone_matches then
      raise exception 'reservation_customer_mismatch';
    end if;
  elsif lower(btrim(coalesce(v_unit.reservation_customer_name, ''))) <>
        lower(btrim(coalesce(v_sale.customer_name, ''))) then
    raise exception 'reservation_customer_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists sale_items_guard_reserved_customer on public.sale_items;
create trigger sale_items_guard_reserved_customer
  before insert on public.sale_items
  for each row execute function public.erp_guard_reserved_sale_customer();

comment on function public.erp_guard_reserved_sale_customer() is
  'Fase 1E: impide consumir una reserva en una venta cuyo cliente no coincide. Para móviles con indicativo compara los últimos 10 dígitos; sin celular compara nombre normalizado.';
