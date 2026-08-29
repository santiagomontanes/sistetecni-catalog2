-- SISTETECNI ERP — Fase 1H guards
-- Defensa en profundidad del ledger financiero.

create or replace function public.erp_guard_cost_entry_insert()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_original public.cost_entries%rowtype;
begin
  if new.entry_kind='reversal' then
    select * into v_original from public.cost_entries where id=new.reversal_of_id;
    if not found then raise exception 'reversal_original_not_found'; end if;
    if v_original.entry_kind<>'cost' then raise exception 'cannot_reverse_reversal'; end if;
    if new.amount_cop <> -v_original.amount_cop then raise exception 'reversal_amount_mismatch'; end if;
    if new.category is distinct from v_original.category
      or new.product_unit_id is distinct from v_original.product_unit_id
      or new.sale_id is distinct from v_original.sale_id
      or new.reference_type is distinct from v_original.reference_type
      or new.reference_id is distinct from v_original.reference_id then
      raise exception 'reversal_identity_mismatch';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists cost_entries_guard_insert on public.cost_entries;
create trigger cost_entries_guard_insert
  before insert on public.cost_entries
  for each row execute function public.erp_guard_cost_entry_insert();

create or replace function public.erp_forbid_cost_entry_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
begin
  raise exception 'cost_entries_are_append_only';
end;
$$;

drop trigger if exists cost_entries_forbid_update on public.cost_entries;
create trigger cost_entries_forbid_update
  before update on public.cost_entries
  for each row execute function public.erp_forbid_cost_entry_mutation();

drop trigger if exists cost_entries_forbid_delete on public.cost_entries;
create trigger cost_entries_forbid_delete
  before delete on public.cost_entries
  for each row execute function public.erp_forbid_cost_entry_mutation();

comment on function public.erp_guard_cost_entry_insert() is
  'Fase 1H: un reversal debe coincidir exactamente en importe, categoría, scope y referencia con su costo original.';
comment on function public.erp_forbid_cost_entry_mutation() is
  'Fase 1H: cost_entries es append-only incluso si en el futuro alguien concede UPDATE/DELETE accidentalmente.';
