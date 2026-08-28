-- SISTETECNI ERP — Fase 1E (guard adicional)
-- Protege a nivel de tabla la diferencia entre reparación pre-venta y
-- reparación de un equipo que ya tuvo una venta real.

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
