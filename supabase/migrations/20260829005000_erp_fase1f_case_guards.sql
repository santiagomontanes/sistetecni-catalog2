-- SISTETECNI ERP — Fase 1F guards
-- Defensa en profundidad para evidencias, snapshots y estado físico mientras
-- exista un expediente posventa activo.

create or replace function public.erp_http_urls_only(p_urls text[])
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select not exists (
    select 1 from unnest(coalesce(p_urls, '{}'::text[])) as u(url)
    where btrim(url) !~* '^https?://'
  );
$$;

alter table public.after_sales_cases
  drop constraint if exists after_sales_cases_evidence_http_only;
alter table public.after_sales_cases
  add constraint after_sales_cases_evidence_http_only
  check (public.erp_http_urls_only(evidence_urls));

comment on function public.erp_http_urls_only(text[]) is
  'Fase 1F: evidencias externas solo http/https; bloquea esquemas arbitrarios también si el RPC se invoca fuera de la UI.';

-- Los enlaces históricos y snapshots del expediente son inmutables. Solo el
-- flujo de progreso puede cambiar status, diagnóstico, costos y resolución.
create or replace function public.erp_guard_after_sales_case_identity()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.case_number is distinct from old.case_number
    or new.case_type is distinct from old.case_type
    or new.sale_id is distinct from old.sale_id
    or new.sale_item_id is distinct from old.sale_item_id
    or new.product_unit_id is distinct from old.product_unit_id
    or new.customer_id is distinct from old.customer_id
    or new.sale_number_snapshot is distinct from old.sale_number_snapshot
    or new.customer_name_snapshot is distinct from old.customer_name_snapshot
    or new.customer_document_snapshot is distinct from old.customer_document_snapshot
    or new.customer_phone_snapshot is distinct from old.customer_phone_snapshot
    or new.product_name_snapshot is distinct from old.product_name_snapshot
    or new.unit_code_snapshot is distinct from old.unit_code_snapshot
    or new.serial_number_snapshot is distinct from old.serial_number_snapshot
    or new.reported_issue is distinct from old.reported_issue
    or new.intake_condition is distinct from old.intake_condition
    or new.evidence_urls is distinct from old.evidence_urls
    or new.warranty_expires_at is distinct from old.warranty_expires_at
    or new.coverage_status is distinct from old.coverage_status
    or new.opened_at is distinct from old.opened_at
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'after_sales_case_identity_is_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists after_sales_cases_guard_identity on public.after_sales_cases;
create trigger after_sales_cases_guard_identity
  before update on public.after_sales_cases
  for each row execute function public.erp_guard_after_sales_case_identity();

-- Si una unidad tiene un caso abierto, el estado físico queda bajo control del
-- expediente. Se permiten únicamente las dos mutaciones internas que ocurren
-- mientras el caso todavía es no-terminal:
-- 1) abrir caso: sold -> warranty/returned con case.status=open;
-- 2) enviar a reparación: warranty/returned -> repair después de que el RPC
--    ya cambió case.status=repair dentro de la misma transacción.
-- Los cierres cambian primero el caso a closed/cancelled; por eso el guard deja
-- de considerarlo activo antes de la mutación final a sold/retired.
create or replace function public.erp_guard_unit_with_open_after_sales_case()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_case public.after_sales_cases%rowtype;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select * into v_case
  from public.after_sales_cases c
  where c.product_unit_id = old.id
    and c.status not in ('closed','cancelled')
  order by c.opened_at desc
  limit 1;

  if not found then
    return new;
  end if;

  if v_case.status = 'open'
     and old.status = 'sold'
     and ((v_case.case_type = 'warranty' and new.status = 'warranty')
       or (v_case.case_type = 'return' and new.status = 'returned')) then
    return new;
  end if;

  if v_case.status = 'repair'
     and old.status in ('warranty','returned')
     and new.status = 'repair' then
    return new;
  end if;

  raise exception 'unit_controlled_by_after_sales_case:%', v_case.case_number;
end;
$$;

drop trigger if exists product_units_guard_open_after_sales_case on public.product_units;
create trigger product_units_guard_open_after_sales_case
  before update of status on public.product_units
  for each row execute function public.erp_guard_unit_with_open_after_sales_case();

comment on function public.erp_guard_unit_with_open_after_sales_case() is
  'Fase 1F: con un GAR-/DEV- activo, product_units.status solo puede cambiar mediante las transiciones coordinadas por el expediente.';
