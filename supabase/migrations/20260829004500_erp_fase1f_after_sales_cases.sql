-- SISTETECNI ERP — Fase 1F
-- Casos formales de garantía y devolución vinculados a venta + unidad física.
--
-- Objetivos:
-- - un caso posventa siempre nace desde un sale_item con product_unit_id;
-- - congelar snapshots de venta/cliente/unidad para trazabilidad;
-- - abrir el caso y mover la unidad a warranty/returned en UNA transacción;
-- - una sola incidencia abierta por unidad física a la vez;
-- - mantener línea de tiempo append-only;
-- - cerrar el caso y resolver el estado físico de forma atómica;
-- - reutilizar Fase 1D para stock y respetar guards de Fase 1E.

create sequence if not exists public.after_sales_case_number_seq start 1;
revoke all on sequence public.after_sales_case_number_seq from public, anon;
grant usage, select on sequence public.after_sales_case_number_seq to authenticated;

create table if not exists public.after_sales_cases (
  id                         uuid        not null default gen_random_uuid(),
  case_number                text        not null,
  case_type                  text        not null,
  status                     text        not null default 'open',
  sale_id                    uuid        not null,
  sale_item_id               uuid        not null,
  product_unit_id            uuid        not null,
  customer_id                uuid,

  sale_number_snapshot       text        not null,
  customer_name_snapshot     text        not null,
  customer_document_snapshot text        not null,
  customer_phone_snapshot    text        not null,
  product_name_snapshot      text        not null,
  unit_code_snapshot         text        not null,
  serial_number_snapshot     text,

  reported_issue             text        not null,
  intake_condition           text,
  evidence_urls              text[]      not null default '{}'::text[],
  diagnosis                  text,
  resolution                 text,
  resolution_type            text,
  estimated_cost_cop         bigint,
  final_cost_cop             bigint,

  warranty_expires_at        timestamptz,
  coverage_status            text        not null,

  opened_at                  timestamptz not null default now(),
  closed_at                  timestamptz,
  created_by                 uuid,
  updated_by                 uuid,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  constraint after_sales_cases_pkey primary key (id),
  constraint after_sales_cases_case_number_key unique (case_number),
  constraint after_sales_cases_sale_id_fkey foreign key (sale_id) references public.sales(id) on delete restrict,
  constraint after_sales_cases_sale_item_id_fkey foreign key (sale_item_id) references public.sale_items(id) on delete restrict,
  constraint after_sales_cases_product_unit_id_fkey foreign key (product_unit_id) references public.product_units(id) on delete restrict,
  constraint after_sales_cases_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete set null,
  constraint after_sales_cases_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null,
  constraint after_sales_cases_updated_by_fkey foreign key (updated_by) references public.profiles(id) on delete set null,
  constraint after_sales_cases_case_type_check check (case_type in ('warranty','return')),
  constraint after_sales_cases_status_check check (status in ('open','diagnosing','repair','waiting_customer','closed','cancelled')),
  constraint after_sales_cases_coverage_check check (coverage_status in ('in_warranty','out_of_warranty','not_applicable')),
  constraint after_sales_cases_resolution_type_check check (
    resolution_type is null or resolution_type in ('repaired_returned','no_fault_found','return_rejected','retired','other')
  ),
  constraint after_sales_cases_issue_not_blank check (length(btrim(reported_issue)) >= 3),
  constraint after_sales_cases_evidence_limit check (cardinality(evidence_urls) <= 12),
  constraint after_sales_cases_estimated_cost_non_negative check (estimated_cost_cop is null or estimated_cost_cop >= 0),
  constraint after_sales_cases_final_cost_non_negative check (final_cost_cop is null or final_cost_cop >= 0),
  constraint after_sales_cases_close_consistency check (
    (status in ('closed','cancelled') and closed_at is not null)
    or (status not in ('closed','cancelled') and closed_at is null)
  )
);

create unique index if not exists uq_after_sales_cases_one_open_per_unit
  on public.after_sales_cases(product_unit_id)
  where status not in ('closed','cancelled');
create index if not exists idx_after_sales_cases_created_at on public.after_sales_cases(created_at desc);
create index if not exists idx_after_sales_cases_sale on public.after_sales_cases(sale_id, created_at desc);
create index if not exists idx_after_sales_cases_status on public.after_sales_cases(status, created_at desc);

comment on table public.after_sales_cases is
  'Fase 1F: expediente posventa formal. Congela venta/cliente/STU/serial y coordina el estado físico mediante RPCs transaccionales.';

drop trigger if exists after_sales_cases_set_updated_at on public.after_sales_cases;
create trigger after_sales_cases_set_updated_at
  before update on public.after_sales_cases
  for each row execute function public.erp_set_updated_at();

create table if not exists public.after_sales_case_events (
  id              uuid        not null default gen_random_uuid(),
  case_id          uuid        not null,
  event_type       text        not null,
  from_status      text,
  to_status        text,
  note             text,
  cost_cop         bigint,
  metadata         jsonb       not null default '{}'::jsonb,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  constraint after_sales_case_events_pkey primary key (id),
  constraint after_sales_case_events_case_id_fkey foreign key (case_id) references public.after_sales_cases(id) on delete restrict,
  constraint after_sales_case_events_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null,
  constraint after_sales_case_events_cost_non_negative check (cost_cop is null or cost_cop >= 0),
  constraint after_sales_case_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);
create index if not exists idx_after_sales_case_events_case_created
  on public.after_sales_case_events(case_id, created_at asc);

comment on table public.after_sales_case_events is
  'Línea de tiempo append-only de cada caso posventa. La aplicación no actualiza ni borra eventos.';

alter table public.after_sales_cases enable row level security;
alter table public.after_sales_case_events enable row level security;
revoke all on table public.after_sales_cases from anon;
revoke all on table public.after_sales_case_events from anon;
grant select, insert, update on table public.after_sales_cases to authenticated;
grant select, insert on table public.after_sales_case_events to authenticated;

drop policy if exists "after_sales_cases admin read" on public.after_sales_cases;
create policy "after_sales_cases admin read" on public.after_sales_cases for select to authenticated
  using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
drop policy if exists "after_sales_cases admin insert" on public.after_sales_cases;
create policy "after_sales_cases admin insert" on public.after_sales_cases for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
drop policy if exists "after_sales_cases admin update" on public.after_sales_cases;
create policy "after_sales_cases admin update" on public.after_sales_cases for update to authenticated
  using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true))
  with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));

drop policy if exists "after_sales_case_events admin read" on public.after_sales_case_events;
create policy "after_sales_case_events admin read" on public.after_sales_case_events for select to authenticated
  using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
drop policy if exists "after_sales_case_events admin insert" on public.after_sales_case_events;
create policy "after_sales_case_events admin insert" on public.after_sales_case_events for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));

-- Abrir caso: valida vínculo sale_item -> sale -> unit, congela snapshots y
-- mueve la unidad sold -> warranty/returned dentro de la misma transacción.
create or replace function public.erp_open_after_sales_case(
  p_sale_item_id uuid,
  p_case_type text,
  p_reported_issue text,
  p_intake_condition text default null,
  p_evidence_urls text[] default '{}'::text[]
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_item public.sale_items%rowtype;
  v_sale public.sales%rowtype;
  v_unit public.product_units%rowtype;
  v_case_id uuid;
  v_type text := lower(btrim(coalesce(p_case_type,'')));
  v_issue text := nullif(btrim(coalesce(p_reported_issue,'')), '');
  v_intake text := nullif(btrim(coalesce(p_intake_condition,'')), '');
  v_case_number text;
  v_seq bigint;
  v_to_status text;
  v_movement text;
  v_warranty_expires timestamptz;
  v_coverage text;
begin
  if v_actor is null or not exists (select 1 from public.profiles p where p.id=v_actor and p.is_admin=true) then
    raise exception 'erp_admin_required' using errcode='42501';
  end if;
  if v_type not in ('warranty','return') then raise exception 'invalid_case_type'; end if;
  if v_issue is null or length(v_issue) < 3 then raise exception 'reported_issue_required'; end if;
  if cardinality(coalesce(p_evidence_urls,'{}'::text[])) > 12 then raise exception 'too_many_evidence_urls'; end if;

  select * into v_item from public.sale_items where id=p_sale_item_id for update;
  if not found or v_item.product_unit_id is null then raise exception 'sale_item_unit_required'; end if;
  select * into v_sale from public.sales where id=v_item.sale_id;
  if not found then raise exception 'sale_not_found'; end if;
  select * into v_unit from public.product_units where id=v_item.product_unit_id for update;
  if not found then raise exception 'unit_not_found'; end if;
  if v_unit.status <> 'sold' then raise exception 'unit_must_be_sold_to_open_case:%', v_unit.status; end if;
  if exists (select 1 from public.after_sales_cases c where c.product_unit_id=v_unit.id and c.status not in ('closed','cancelled')) then
    raise exception 'open_case_already_exists';
  end if;

  v_seq := nextval('public.after_sales_case_number_seq');
  v_case_number := (case when v_type='warranty' then 'GAR-' else 'DEV-' end) || lpad(v_seq::text, 6, '0');
  v_warranty_expires := case when v_sale.warranty_months > 0 then v_sale.created_at + make_interval(months => v_sale.warranty_months) else null end;
  v_coverage := case
    when v_type='return' then 'not_applicable'
    when v_warranty_expires is not null and now() <= v_warranty_expires then 'in_warranty'
    else 'out_of_warranty'
  end;
  v_to_status := case when v_type='warranty' then 'warranty' else 'returned' end;
  v_movement := case when v_type='warranty' then 'warranty_in' else 'return' end;

  insert into public.after_sales_cases(
    case_number,case_type,status,sale_id,sale_item_id,product_unit_id,customer_id,
    sale_number_snapshot,customer_name_snapshot,customer_document_snapshot,customer_phone_snapshot,
    product_name_snapshot,unit_code_snapshot,serial_number_snapshot,
    reported_issue,intake_condition,evidence_urls,warranty_expires_at,coverage_status,
    created_by,updated_by
  ) values (
    v_case_number,v_type,'open',v_sale.id,v_item.id,v_unit.id,v_sale.customer_id,
    v_sale.sale_number,v_sale.customer_name,v_sale.customer_document,v_sale.customer_phone,
    v_item.product_name,v_unit.unit_code,v_unit.serial_number,
    v_issue,v_intake,coalesce(p_evidence_urls,'{}'::text[]),v_warranty_expires,v_coverage,
    v_actor,v_actor
  ) returning id into v_case_id;

  update public.product_units set status=v_to_status where id=v_unit.id;

  insert into public.inventory_movements(
    unit_id,product_id,movement_type,from_status,to_status,reference_type,reference_id,
    reason,source,actor_ref,metadata,created_by
  ) values (
    v_unit.id,v_unit.product_id,v_movement,'sold',v_to_status,'after_sales_case',v_case_id,
    v_issue,'web_admin',v_actor::text,jsonb_build_object('caseNumber',v_case_number,'caseType',v_type),v_actor
  );

  insert into public.after_sales_case_events(case_id,event_type,from_status,to_status,note,metadata,created_by)
  values (v_case_id,'opened',null,'open',v_issue,jsonb_build_object('unitStatus','sold->'||v_to_status,'coverageStatus',v_coverage),v_actor);

  insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,before_snapshot,after_snapshot,metadata)
  values ('web_admin',v_actor::text,'web','after_sales.open','after_sales_case',v_case_id,
    jsonb_build_object('unitStatus','sold','unitCode',v_unit.unit_code),
    jsonb_build_object('caseNumber',v_case_number,'caseType',v_type,'caseStatus','open','unitStatus',v_to_status),
    jsonb_build_object('saleId',v_sale.id,'saleItemId',v_item.id,'source','admin_panel'));

  return v_case_id;
end;
$$;
revoke all on function public.erp_open_after_sales_case(uuid,text,text,text,text[]) from public;
grant execute on function public.erp_open_after_sales_case(uuid,text,text,text,text[]) to authenticated;

-- Progresar/cerrar caso. Las únicas salidas físicas a sold ocurren al devolver
-- el mismo equipo al cliente dentro de este caso; nunca crean una venta nueva.
create or replace function public.erp_progress_after_sales_case(
  p_case_id uuid,
  p_action text,
  p_note text default null,
  p_diagnosis text default null,
  p_cost_cop bigint default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_case public.after_sales_cases%rowtype;
  v_unit public.product_units%rowtype;
  v_action text := lower(btrim(coalesce(p_action,'')));
  v_note text := nullif(btrim(coalesce(p_note,'')), '');
  v_diag text := nullif(btrim(coalesce(p_diagnosis,'')), '');
  v_from_case text;
  v_to_case text;
  v_from_unit text;
  v_to_unit text;
  v_event text;
  v_movement text;
  v_resolution_type text;
begin
  if v_actor is null or not exists (select 1 from public.profiles p where p.id=v_actor and p.is_admin=true) then
    raise exception 'erp_admin_required' using errcode='42501';
  end if;
  if p_cost_cop is not null and p_cost_cop < 0 then raise exception 'invalid_cost'; end if;

  select * into v_case from public.after_sales_cases where id=p_case_id for update;
  if not found then raise exception 'case_not_found'; end if;
  if v_case.status in ('closed','cancelled') then raise exception 'case_already_terminal'; end if;
  select * into v_unit from public.product_units where id=v_case.product_unit_id for update;
  if not found then raise exception 'unit_not_found'; end if;

  v_from_case := v_case.status;
  v_from_unit := v_unit.status;

  if v_action='start_diagnosis' then
    if v_case.status not in ('open','waiting_customer') then raise exception 'invalid_case_action'; end if;
    v_to_case := 'diagnosing'; v_to_unit := v_from_unit; v_event := 'diagnosis_started';
  elsif v_action='send_repair' then
    if v_case.status not in ('open','diagnosing','waiting_customer') then raise exception 'invalid_case_action'; end if;
    if v_unit.status not in ('warranty','returned') then raise exception 'unit_not_ready_for_repair:%',v_unit.status; end if;
    v_to_case := 'repair'; v_to_unit := 'repair'; v_event := 'sent_to_repair'; v_movement := 'repair_in';
  elsif v_action='waiting_customer' then
    if v_case.status not in ('open','diagnosing','repair') then raise exception 'invalid_case_action'; end if;
    v_to_case := 'waiting_customer'; v_to_unit := v_from_unit; v_event := 'waiting_customer';
  elsif v_action='close_returned' then
    if v_case.case_type='warranty' then
      if v_unit.status not in ('warranty','repair') then raise exception 'unit_not_returnable_to_customer:%',v_unit.status; end if;
      v_resolution_type := case when v_unit.status='repair' then 'repaired_returned' else 'no_fault_found' end;
    else
      if v_unit.status <> 'returned' then raise exception 'return_case_must_be_returned_to_reject'; end if;
      v_resolution_type := 'return_rejected';
    end if;
    v_to_case := 'closed'; v_to_unit := 'sold'; v_event := 'closed_returned_to_customer';
    v_movement := case when v_from_unit='repair' then 'repair_out' when v_from_unit='warranty' then 'warranty_out' else 'adjustment' end;
  elsif v_action='close_retired' then
    if v_unit.status not in ('warranty','returned','repair') then raise exception 'unit_not_retirable_from_case:%',v_unit.status; end if;
    if v_note is null then raise exception 'resolution_note_required'; end if;
    v_to_case := 'closed'; v_to_unit := 'retired'; v_event := 'closed_retired'; v_movement := 'retire'; v_resolution_type := 'retired';
  elsif v_action='cancel' then
    if v_case.status not in ('open','diagnosing','waiting_customer') then raise exception 'case_cannot_cancel_after_repair'; end if;
    if v_unit.status not in ('warranty','returned') then raise exception 'unit_not_cancelable:%',v_unit.status; end if;
    if v_note is null then raise exception 'cancel_note_required'; end if;
    v_to_case := 'cancelled'; v_to_unit := 'sold'; v_event := 'cancelled'; v_movement := 'adjustment';
  else
    raise exception 'invalid_case_action';
  end if;

  update public.after_sales_cases set
    status=v_to_case,
    diagnosis=coalesce(v_diag,diagnosis),
    estimated_cost_cop=case when p_cost_cop is not null and v_to_case not in ('closed','cancelled') then p_cost_cop else estimated_cost_cop end,
    final_cost_cop=case when p_cost_cop is not null and v_to_case='closed' then p_cost_cop else final_cost_cop end,
    resolution=case when v_to_case='closed' then coalesce(v_note,resolution) else resolution end,
    resolution_type=case when v_to_case='closed' then coalesce(v_resolution_type,'other') else resolution_type end,
    closed_at=case when v_to_case in ('closed','cancelled') then now() else null end,
    updated_by=v_actor
  where id=v_case.id;

  if v_to_unit is distinct from v_from_unit then
    update public.product_units set status=v_to_unit where id=v_unit.id;
    insert into public.inventory_movements(
      unit_id,product_id,movement_type,from_status,to_status,reference_type,reference_id,
      reason,source,actor_ref,metadata,created_by
    ) values (
      v_unit.id,v_unit.product_id,coalesce(v_movement,'adjustment'),v_from_unit,v_to_unit,'after_sales_case',v_case.id,
      coalesce(v_note,v_diag,'Caso posventa '||v_case.case_number),'web_admin',v_actor::text,
      jsonb_build_object('caseNumber',v_case.case_number,'action',v_action),v_actor
    );
  end if;

  insert into public.after_sales_case_events(case_id,event_type,from_status,to_status,note,cost_cop,metadata,created_by)
  values (v_case.id,v_event,v_from_case,v_to_case,coalesce(v_note,v_diag),p_cost_cop,
    jsonb_build_object('unitStatusBefore',v_from_unit,'unitStatusAfter',v_to_unit,'action',v_action),v_actor);

  insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,before_snapshot,after_snapshot,metadata)
  values ('web_admin',v_actor::text,'web','after_sales.progress','after_sales_case',v_case.id,
    jsonb_build_object('caseStatus',v_from_case,'unitStatus',v_from_unit),
    jsonb_build_object('caseStatus',v_to_case,'unitStatus',v_to_unit),
    jsonb_build_object('caseNumber',v_case.case_number,'action',v_action,'source','admin_panel'));

  return v_case.id;
end;
$$;
revoke all on function public.erp_progress_after_sales_case(uuid,text,text,text,bigint) from public;
grant execute on function public.erp_progress_after_sales_case(uuid,text,text,text,bigint) to authenticated;
