-- SISTETECNI ERP — Fase 1H
-- Ledger inmutable de costos adicionales + base para rentabilidad real por STU/venta.
--
-- Principios:
-- - product_units.acquisition_cost_cop sigue siendo el costo de adquisición congelado (1G);
-- - los costos posteriores se agregan, nunca reescriben el costo de compra;
-- - las correcciones se hacen mediante reversos, no UPDATE/DELETE;
-- - los costos de casos posventa cerrados (1F) se reflejan automáticamente;
-- - la rentabilidad se calcula sobre snapshots de venta + costos registrados.

create sequence if not exists public.cost_entry_number_seq start with 1 increment by 1;
revoke all on sequence public.cost_entry_number_seq from public, anon;
grant usage, select on sequence public.cost_entry_number_seq to authenticated;

create table if not exists public.cost_entries (
  id                uuid        not null default gen_random_uuid(),
  cost_number       text        not null,
  entry_kind        text        not null default 'cost',
  category          text        not null,
  product_unit_id   uuid,
  sale_id           uuid,
  description       text        not null,
  amount_cop        bigint      not null,
  incurred_at       timestamptz not null default now(),
  reference_type    text,
  reference_id      uuid,
  reversal_of_id    uuid,
  created_by        uuid,
  created_at        timestamptz not null default now(),

  constraint cost_entries_pkey primary key (id),
  constraint cost_entries_number_key unique (cost_number),
  constraint cost_entries_number_format check (cost_number ~ '^CST-[0-9]{6}$'),
  constraint cost_entries_kind_check check (entry_kind in ('cost','reversal')),
  constraint cost_entries_category_check check (category in (
    'upgrade','repair','spare_part','labor','transport','after_sales','sale_fee','accessory','other'
  )),
  constraint cost_entries_scope_exactly_one check (
    (product_unit_id is not null and sale_id is null)
    or (product_unit_id is null and sale_id is not null)
  ),
  constraint cost_entries_product_unit_fkey foreign key (product_unit_id)
    references public.product_units(id) on delete restrict,
  constraint cost_entries_sale_fkey foreign key (sale_id)
    references public.sales(id) on delete restrict,
  constraint cost_entries_reversal_fkey foreign key (reversal_of_id)
    references public.cost_entries(id) on delete restrict,
  constraint cost_entries_created_by_fkey foreign key (created_by)
    references public.profiles(id) on delete set null,
  constraint cost_entries_description_not_blank check (length(btrim(description)) >= 3),
  constraint cost_entries_amount_sign check (
    (entry_kind='cost' and amount_cop > 0 and reversal_of_id is null)
    or (entry_kind='reversal' and amount_cop < 0 and reversal_of_id is not null)
  ),
  constraint cost_entries_reference_pair check (
    (reference_type is null and reference_id is null)
    or (reference_type is not null and reference_id is not null)
  )
);

create unique index if not exists uq_cost_entries_one_reversal
  on public.cost_entries(reversal_of_id)
  where reversal_of_id is not null;
create unique index if not exists uq_cost_entries_after_sales_case
  on public.cost_entries(reference_id)
  where reference_type='after_sales_case' and entry_kind='cost';
create index if not exists idx_cost_entries_unit_date
  on public.cost_entries(product_unit_id, incurred_at desc)
  where product_unit_id is not null;
create index if not exists idx_cost_entries_sale_date
  on public.cost_entries(sale_id, incurred_at desc)
  where sale_id is not null;
create index if not exists idx_cost_entries_created
  on public.cost_entries(created_at desc);

comment on table public.cost_entries is
  'Fase 1H: ledger financiero append-only. Los costos positivos se corrigen con una fila reversal negativa; nunca se editan o borran.';
comment on column public.cost_entries.product_unit_id is
  'Costo atribuible a un STU: upgrade, reparación, repuesto, mano de obra, transporte, posventa u otro.';
comment on column public.cost_entries.sale_id is
  'Costo general de una venta: comisión de pago, envío, accesorio/manual u otro. Se asigna proporcionalmente al calcular margen por ítem.';

alter table public.cost_entries enable row level security;
revoke all on table public.cost_entries from anon;
grant select, insert on table public.cost_entries to authenticated;

create policy "cost_entries admin read" on public.cost_entries for select to authenticated
  using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
create policy "cost_entries admin insert" on public.cost_entries for insert to authenticated
  with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));

-- Añadir costo. No actualiza product_units.acquisition_cost_cop.
create or replace function public.erp_add_cost_entry(
  p_scope_type text,
  p_scope_id uuid,
  p_category text,
  p_description text,
  p_amount_cop bigint,
  p_incurred_at timestamptz default now()
)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_scope text := lower(btrim(coalesce(p_scope_type,'')));
  v_category text := lower(btrim(coalesce(p_category,'')));
  v_description text := nullif(btrim(coalesce(p_description,'')),'');
  v_id uuid;
  v_number text;
  v_unit_code text;
  v_sale_number text;
begin
  if v_actor is null or not exists(select 1 from public.profiles p where p.id=v_actor and p.is_admin=true) then
    raise exception 'erp_admin_required' using errcode='42501';
  end if;
  if v_scope not in ('unit','sale') then raise exception 'invalid_cost_scope'; end if;
  if p_scope_id is null then raise exception 'cost_scope_id_required'; end if;
  if v_category not in ('upgrade','repair','spare_part','labor','transport','after_sales','sale_fee','accessory','other') then
    raise exception 'invalid_cost_category';
  end if;
  if v_description is null or length(v_description)<3 then raise exception 'cost_description_required'; end if;
  if p_amount_cop is null or p_amount_cop<=0 then raise exception 'cost_amount_must_be_positive'; end if;
  if p_incurred_at is null then raise exception 'cost_incurred_at_required'; end if;

  if v_scope='unit' then
    select unit_code into v_unit_code from public.product_units where id=p_scope_id;
    if not found then raise exception 'unit_not_found'; end if;
  else
    select sale_number into v_sale_number from public.sales where id=p_scope_id;
    if not found then raise exception 'sale_not_found'; end if;
  end if;

  v_number := 'CST-'||lpad(nextval('public.cost_entry_number_seq')::text,6,'0');
  insert into public.cost_entries(
    cost_number,entry_kind,category,product_unit_id,sale_id,description,amount_cop,incurred_at,created_by
  ) values(
    v_number,'cost',v_category,
    case when v_scope='unit' then p_scope_id else null end,
    case when v_scope='sale' then p_scope_id else null end,
    v_description,p_amount_cop,p_incurred_at,v_actor
  ) returning id into v_id;

  insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,after_snapshot,metadata)
  values('web_admin',v_actor::text,'web','cost.create','cost_entry',v_id,
    jsonb_strip_nulls(jsonb_build_object(
      'costNumber',v_number,'scopeType',v_scope,'scopeId',p_scope_id,'category',v_category,
      'amountCop',p_amount_cop,'incurredAt',p_incurred_at,'unitCode',v_unit_code,'saleNumber',v_sale_number
    )),jsonb_build_object('source','admin_panel'));

  return v_id;
end;
$$;
revoke all on function public.erp_add_cost_entry(text,uuid,text,text,bigint,timestamptz) from public;
grant execute on function public.erp_add_cost_entry(text,uuid,text,text,bigint,timestamptz) to authenticated;

-- Reversar un costo preservando historial. Solo se puede reversar una fila positiva una vez.
create or replace function public.erp_reverse_cost_entry(
  p_cost_entry_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_original public.cost_entries%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
  v_id uuid;
  v_number text;
begin
  if v_actor is null or not exists(select 1 from public.profiles p where p.id=v_actor and p.is_admin=true) then
    raise exception 'erp_admin_required' using errcode='42501';
  end if;
  if v_reason is null or length(v_reason)<3 then raise exception 'reversal_reason_required'; end if;

  select * into v_original from public.cost_entries where id=p_cost_entry_id for update;
  if not found then raise exception 'cost_entry_not_found'; end if;
  if v_original.entry_kind<>'cost' then raise exception 'only_cost_can_be_reversed'; end if;
  if exists(select 1 from public.cost_entries c where c.reversal_of_id=v_original.id) then
    raise exception 'cost_entry_already_reversed';
  end if;

  v_number := 'CST-'||lpad(nextval('public.cost_entry_number_seq')::text,6,'0');
  insert into public.cost_entries(
    cost_number,entry_kind,category,product_unit_id,sale_id,description,amount_cop,incurred_at,
    reference_type,reference_id,reversal_of_id,created_by
  ) values(
    v_number,'reversal',v_original.category,v_original.product_unit_id,v_original.sale_id,
    'Reverso: '||v_reason,-v_original.amount_cop,now(),
    v_original.reference_type,v_original.reference_id,v_original.id,v_actor
  ) returning id into v_id;

  insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,after_snapshot,metadata)
  values('web_admin',v_actor::text,'web','cost.reverse','cost_entry',v_id,
    jsonb_build_object('costNumber',v_number,'reversalOfId',v_original.id,'amountCop',-v_original.amount_cop),
    jsonb_build_object('source','admin_panel','reason',v_reason));

  return v_id;
end;
$$;
revoke all on function public.erp_reverse_cost_entry(uuid,text) from public;
grant execute on function public.erp_reverse_cost_entry(uuid,text) to authenticated;

-- 1F -> 1H: al cerrar un caso posventa con costo final, registrar ese costo una sola vez.
create or replace function public.erp_capture_after_sales_final_cost()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_number text;
begin
  if new.status='closed' and coalesce(new.final_cost_cop,0)>0
     and (old.status is distinct from new.status or old.final_cost_cop is distinct from new.final_cost_cop) then
    if not exists(
      select 1 from public.cost_entries c
      where c.reference_type='after_sales_case' and c.reference_id=new.id and c.entry_kind='cost'
    ) then
      v_number := 'CST-'||lpad(nextval('public.cost_entry_number_seq')::text,6,'0');
      insert into public.cost_entries(
        cost_number,entry_kind,category,product_unit_id,description,amount_cop,incurred_at,
        reference_type,reference_id,created_by
      ) values(
        v_number,'cost','after_sales',new.product_unit_id,
        'Costo final '||new.case_number||' · '||case when new.case_type='warranty' then 'Garantía' else 'Devolución' end,
        new.final_cost_cop,coalesce(new.closed_at,now()),'after_sales_case',new.id,coalesce(new.updated_by,new.created_by)
      );
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists after_sales_cases_capture_final_cost on public.after_sales_cases;
create trigger after_sales_cases_capture_final_cost
  after update of status,final_cost_cop on public.after_sales_cases
  for each row execute function public.erp_capture_after_sales_final_cost();

-- Backfill seguro de casos 1F ya cerrados antes de aplicar 1H.
insert into public.cost_entries(
  cost_number,entry_kind,category,product_unit_id,description,amount_cop,incurred_at,
  reference_type,reference_id,created_by
)
select
  'CST-'||lpad(nextval('public.cost_entry_number_seq')::text,6,'0'),
  'cost','after_sales',c.product_unit_id,
  'Costo final '||c.case_number||' · '||case when c.case_type='warranty' then 'Garantía' else 'Devolución' end,
  c.final_cost_cop,coalesce(c.closed_at,c.updated_at,c.created_at),'after_sales_case',c.id,coalesce(c.updated_by,c.created_by)
from public.after_sales_cases c
where c.status='closed' and coalesce(c.final_cost_cop,0)>0
  and not exists(
    select 1 from public.cost_entries e
    where e.reference_type='after_sales_case' and e.reference_id=c.id and e.entry_kind='cost'
  );

comment on function public.erp_capture_after_sales_final_cost() is
  'Fase 1H: refleja automáticamente el final_cost_cop de un GAR/DEV cerrado en el ledger de costos del STU, una sola vez.';
