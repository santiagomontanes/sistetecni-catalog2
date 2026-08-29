-- SISTETECNI ERP — Fase 2A + 2B
-- Caja, movimientos de dinero y gastos operativos.

create sequence if not exists public.cash_session_number_seq start 1;
create sequence if not exists public.cash_movement_number_seq start 1;
create sequence if not exists public.expense_number_seq start 1;
revoke all on sequence public.cash_session_number_seq from public,anon;
revoke all on sequence public.cash_movement_number_seq from public,anon;
revoke all on sequence public.expense_number_seq from public,anon;

create table if not exists public.cash_sessions(
  id uuid primary key default gen_random_uuid(),
  session_number text not null unique,
  status text not null default 'open',
  opening_cash_cop bigint not null default 0,
  expected_cash_cop bigint,
  counted_cash_cop bigint,
  difference_cop bigint,
  notes_open text,
  notes_close text,
  opened_by uuid references public.profiles(id) on delete set null,
  closed_by uuid references public.profiles(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint cash_sessions_number_format check(session_number ~ '^CAJ-[0-9]{6}$'),
  constraint cash_sessions_status_check check(status in ('open','closed')),
  constraint cash_sessions_opening_non_negative check(opening_cash_cop>=0),
  constraint cash_sessions_close_consistency check(
    (status='open' and closed_at is null and counted_cash_cop is null and difference_cop is null)
    or (status='closed' and closed_at is not null and counted_cash_cop is not null and expected_cash_cop is not null and difference_cop is not null)
  )
);
create unique index if not exists uq_cash_sessions_single_open on public.cash_sessions((1)) where status='open';
create index if not exists idx_cash_sessions_opened_at on public.cash_sessions(opened_at desc);

create table if not exists public.operating_expenses(
  id uuid primary key default gen_random_uuid(),
  expense_number text not null unique,
  category text not null,
  description text not null,
  amount_cop bigint not null,
  payment_method text not null,
  payee text,
  receipt_url text,
  occurred_on date not null default current_date,
  status text not null default 'active',
  void_reason text,
  voided_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  voided_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint operating_expenses_number_format check(expense_number ~ '^GAS-[0-9]{6}$'),
  constraint operating_expenses_category_check check(category in ('arriendo','servicios','publicidad','nomina','transporte','hosting','software','papeleria','impuestos','mantenimiento','otro')),
  constraint operating_expenses_amount_positive check(amount_cop>0),
  constraint operating_expenses_payment_check check(payment_method in ('efectivo','transferencia','nequi','daviplata','tarjeta','otro')),
  constraint operating_expenses_status_check check(status in ('active','voided')),
  constraint operating_expenses_description_not_blank check(length(btrim(description))>=3),
  constraint operating_expenses_void_consistency check((status='active' and voided_at is null) or (status='voided' and voided_at is not null and void_reason is not null))
);
create index if not exists idx_operating_expenses_date on public.operating_expenses(occurred_on desc);
create index if not exists idx_operating_expenses_category on public.operating_expenses(category,occurred_on desc);

create table if not exists public.cash_movements(
  id uuid primary key default gen_random_uuid(),
  movement_number text not null unique,
  session_id uuid references public.cash_sessions(id) on delete restrict,
  movement_type text not null,
  payment_method text not null,
  amount_cop bigint not null,
  description text not null,
  sale_id uuid references public.sales(id) on delete restrict,
  purchase_id uuid references public.purchases(id) on delete restrict,
  expense_id uuid references public.operating_expenses(id) on delete restrict,
  reversal_of_id uuid references public.cash_movements(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint cash_movements_number_format check(movement_number ~ '^MOV-[0-9]{6}$'),
  constraint cash_movements_type_check check(movement_type in ('sale','expense','purchase_payment','manual_in','manual_out','reversal')),
  constraint cash_movements_payment_check check(payment_method in ('efectivo','transferencia','nequi','daviplata','tarjeta','otro')),
  constraint cash_movements_amount_nonzero check(amount_cop<>0),
  constraint cash_movements_sign_check check(
    (movement_type in ('sale','manual_in') and amount_cop>0)
    or (movement_type in ('expense','purchase_payment','manual_out') and amount_cop<0)
    or movement_type='reversal'
  ),
  constraint cash_movements_description_not_blank check(length(btrim(description))>=3),
  constraint cash_movements_metadata_object check(jsonb_typeof(metadata)='object')
);
create unique index if not exists uq_cash_movements_sale_once on public.cash_movements(sale_id) where movement_type='sale' and sale_id is not null;
create unique index if not exists uq_cash_movements_expense_once on public.cash_movements(expense_id) where movement_type='expense' and expense_id is not null;
create unique index if not exists uq_cash_movements_one_reversal on public.cash_movements(reversal_of_id) where reversal_of_id is not null;
create index if not exists idx_cash_movements_session_created on public.cash_movements(session_id,created_at);
create index if not exists idx_cash_movements_created on public.cash_movements(created_at desc);

alter table public.cash_sessions enable row level security;
alter table public.operating_expenses enable row level security;
alter table public.cash_movements enable row level security;
revoke all on table public.cash_sessions from anon;
revoke all on table public.operating_expenses from anon;
revoke all on table public.cash_movements from anon;
grant select on table public.cash_sessions to authenticated;
grant select on table public.operating_expenses to authenticated;
grant select on table public.cash_movements to authenticated;

create policy "phase2 cash read" on public.cash_sessions for select to authenticated using(public.erp_has_permission('cash.read') or public.erp_has_permission('reports.view'));
create policy "phase2 expenses read" on public.operating_expenses for select to authenticated using(public.erp_has_permission('expenses.read') or public.erp_has_permission('reports.view'));
create policy "phase2 movements read" on public.cash_movements for select to authenticated using(public.erp_has_permission('cash.read') or public.erp_has_permission('reports.view'));

-- Utilidad interna para enlazar movimiento a la caja abierta, si existe.
create or replace function public.erp_current_cash_session_id()
returns uuid language sql stable security definer set search_path=public,pg_temp as $$
  select id from public.cash_sessions where status='open' order by opened_at desc limit 1;
$$;
revoke all on function public.erp_current_cash_session_id() from public,anon,authenticated;

create or replace function public.erp_open_cash_session(p_opening_cash_cop bigint,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_id uuid; v_number text;
begin
  perform public.erp_assert_permission('cash.manage');
  if coalesce(p_opening_cash_cop,-1)<0 then raise exception 'opening_cash_invalid'; end if;
  if exists(select 1 from public.cash_sessions where status='open') then raise exception 'cash_session_already_open'; end if;
  v_number:='CAJ-'||lpad(nextval('public.cash_session_number_seq')::text,6,'0');
  insert into public.cash_sessions(session_number,opening_cash_cop,notes_open,opened_by)
  values(v_number,p_opening_cash_cop,nullif(btrim(coalesce(p_notes,'')),''),v_actor) returning id into v_id;
  insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,after_snapshot,metadata)
  values('web_admin',v_actor::text,'web','cash.open','cash_session',v_id,jsonb_build_object('sessionNumber',v_number,'openingCashCop',p_opening_cash_cop),jsonb_build_object('source','admin_panel'));
  return v_id;
end;$$;
revoke all on function public.erp_open_cash_session(bigint,text) from public,anon;
grant execute on function public.erp_open_cash_session(bigint,text) to authenticated;

create or replace function public.erp_close_cash_session(p_session_id uuid,p_counted_cash_cop bigint,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_s public.cash_sessions%rowtype; v_expected bigint;
begin
  perform public.erp_assert_permission('cash.manage');
  if coalesce(p_counted_cash_cop,-1)<0 then raise exception 'counted_cash_invalid'; end if;
  select * into v_s from public.cash_sessions where id=p_session_id for update;
  if not found then raise exception 'cash_session_not_found'; end if;
  if v_s.status<>'open' then raise exception 'cash_session_not_open'; end if;
  select v_s.opening_cash_cop + coalesce(sum(m.amount_cop),0) into v_expected
  from public.cash_movements m where m.session_id=v_s.id and m.payment_method='efectivo';
  update public.cash_sessions set status='closed',expected_cash_cop=v_expected,counted_cash_cop=p_counted_cash_cop,
    difference_cop=p_counted_cash_cop-v_expected,notes_close=nullif(btrim(coalesce(p_notes,'')),''),closed_by=v_actor,closed_at=now()
  where id=v_s.id;
  insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,before_snapshot,after_snapshot,metadata)
  values('web_admin',v_actor::text,'web','cash.close','cash_session',v_s.id,
    jsonb_build_object('status','open'),jsonb_build_object('status','closed','expectedCashCop',v_expected,'countedCashCop',p_counted_cash_cop,'differenceCop',p_counted_cash_cop-v_expected),jsonb_build_object('sessionNumber',v_s.session_number,'source','admin_panel'));
  return v_s.id;
end;$$;
revoke all on function public.erp_close_cash_session(uuid,bigint,text) from public,anon;
grant execute on function public.erp_close_cash_session(uuid,bigint,text) to authenticated;

create or replace function public.erp_add_cash_movement(
  p_movement_type text,p_payment_method text,p_amount_cop bigint,p_description text,p_purchase_id uuid default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_type text:=lower(btrim(coalesce(p_movement_type,''))); v_method text:=lower(btrim(coalesce(p_payment_method,''))); v_amount bigint; v_id uuid; v_number text; v_session uuid;
begin
  perform public.erp_assert_permission('cash.manage');
  if v_type not in ('purchase_payment','manual_in','manual_out') then raise exception 'invalid_manual_movement_type'; end if;
  if v_method not in ('efectivo','transferencia','nequi','daviplata','tarjeta','otro') then raise exception 'invalid_payment_method'; end if;
  if coalesce(p_amount_cop,0)<=0 then raise exception 'movement_amount_invalid'; end if;
  if nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'movement_description_required'; end if;
  if v_type='purchase_payment' and (p_purchase_id is null or not exists(select 1 from public.purchases where id=p_purchase_id)) then raise exception 'purchase_required'; end if;
  v_amount:=case when v_type='manual_in' then p_amount_cop else -p_amount_cop end;
  v_session:=public.erp_current_cash_session_id(); v_number:='MOV-'||lpad(nextval('public.cash_movement_number_seq')::text,6,'0');
  insert into public.cash_movements(movement_number,session_id,movement_type,payment_method,amount_cop,description,purchase_id,created_by)
  values(v_number,v_session,v_type,v_method,v_amount,btrim(p_description),p_purchase_id,v_actor) returning id into v_id;
  insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,after_snapshot,metadata)
  values('web_admin',v_actor::text,'web','cash.movement.create','cash_movement',v_id,jsonb_build_object('movementNumber',v_number,'type',v_type,'paymentMethod',v_method,'amountCop',v_amount),jsonb_build_object('sessionId',v_session,'source','admin_panel'));
  return v_id;
end;$$;
revoke all on function public.erp_add_cash_movement(text,text,bigint,text,uuid) from public,anon;
grant execute on function public.erp_add_cash_movement(text,text,bigint,text,uuid) to authenticated;

create or replace function public.erp_create_operating_expense(
 p_category text,p_description text,p_amount_cop bigint,p_payment_method text,p_payee text default null,p_receipt_url text default null,p_occurred_on date default current_date
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_id uuid; v_number text; v_mov_id uuid; v_mov_number text; v_session uuid; v_cat text:=lower(btrim(coalesce(p_category,''))); v_method text:=lower(btrim(coalesce(p_payment_method,'')));
begin
  perform public.erp_assert_permission('expenses.manage');
  if v_cat not in ('arriendo','servicios','publicidad','nomina','transporte','hosting','software','papeleria','impuestos','mantenimiento','otro') then raise exception 'invalid_expense_category'; end if;
  if v_method not in ('efectivo','transferencia','nequi','daviplata','tarjeta','otro') then raise exception 'invalid_payment_method'; end if;
  if coalesce(p_amount_cop,0)<=0 then raise exception 'expense_amount_invalid'; end if;
  if nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'expense_description_required'; end if;
  if p_receipt_url is not null and p_receipt_url !~ '^https?://' then raise exception 'expense_receipt_url_invalid'; end if;
  v_number:='GAS-'||lpad(nextval('public.expense_number_seq')::text,6,'0');
  insert into public.operating_expenses(expense_number,category,description,amount_cop,payment_method,payee,receipt_url,occurred_on,created_by)
  values(v_number,v_cat,btrim(p_description),p_amount_cop,v_method,nullif(btrim(coalesce(p_payee,'')),''),nullif(btrim(coalesce(p_receipt_url,'')),''),coalesce(p_occurred_on,current_date),v_actor) returning id into v_id;
  v_session:=public.erp_current_cash_session_id(); v_mov_number:='MOV-'||lpad(nextval('public.cash_movement_number_seq')::text,6,'0');
  insert into public.cash_movements(movement_number,session_id,movement_type,payment_method,amount_cop,description,expense_id,created_by)
  values(v_mov_number,v_session,'expense',v_method,-p_amount_cop,'Gasto '||v_number||': '||btrim(p_description),v_id,v_actor) returning id into v_mov_id;
  insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,after_snapshot,metadata)
  values('web_admin',v_actor::text,'web','expense.create','operating_expense',v_id,jsonb_build_object('expenseNumber',v_number,'category',v_cat,'amountCop',p_amount_cop,'paymentMethod',v_method),jsonb_build_object('cashMovementId',v_mov_id,'source','admin_panel'));
  return v_id;
end;$$;
revoke all on function public.erp_create_operating_expense(text,text,bigint,text,text,text,date) from public,anon;
grant execute on function public.erp_create_operating_expense(text,text,bigint,text,text,text,date) to authenticated;

create or replace function public.erp_void_operating_expense(p_expense_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_e public.operating_expenses%rowtype; v_m public.cash_movements%rowtype; v_rev_number text; v_session uuid;
begin
  perform public.erp_assert_permission('expenses.manage');
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'void_reason_required'; end if;
  select * into v_e from public.operating_expenses where id=p_expense_id for update;
  if not found then raise exception 'expense_not_found'; end if;
  if v_e.status='voided' then raise exception 'expense_already_voided'; end if;
  select * into v_m from public.cash_movements where expense_id=v_e.id and movement_type='expense' for update;
  if not found then raise exception 'expense_cash_movement_missing'; end if;
  if exists(select 1 from public.cash_movements where reversal_of_id=v_m.id) then raise exception 'movement_already_reversed'; end if;
  update public.operating_expenses set status='voided',void_reason=btrim(p_reason),voided_at=now(),voided_by=v_actor where id=v_e.id;
  v_session:=public.erp_current_cash_session_id(); v_rev_number:='MOV-'||lpad(nextval('public.cash_movement_number_seq')::text,6,'0');
  insert into public.cash_movements(movement_number,session_id,movement_type,payment_method,amount_cop,description,expense_id,reversal_of_id,metadata,created_by)
  values(v_rev_number,v_session,'reversal',v_m.payment_method,-v_m.amount_cop,'Reverso '||v_e.expense_number||': '||btrim(p_reason),v_e.id,v_m.id,jsonb_build_object('originalMovementNumber',v_m.movement_number),v_actor);
  insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,before_snapshot,after_snapshot,metadata)
  values('web_admin',v_actor::text,'web','expense.void','operating_expense',v_e.id,jsonb_build_object('status','active'),jsonb_build_object('status','voided','reason',btrim(p_reason)),jsonb_build_object('source','admin_panel'));
  return v_e.id;
end;$$;
revoke all on function public.erp_void_operating_expense(uuid,text) from public,anon;
grant execute on function public.erp_void_operating_expense(uuid,text) to authenticated;

create or replace function public.erp_reverse_cash_movement(p_movement_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_m public.cash_movements%rowtype; v_id uuid; v_number text; v_session uuid;
begin
  perform public.erp_assert_permission('cash.manage');
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'reversal_reason_required'; end if;
  select * into v_m from public.cash_movements where id=p_movement_id for update;
  if not found then raise exception 'cash_movement_not_found'; end if;
  if v_m.movement_type in ('sale','expense','reversal') then raise exception 'movement_not_manually_reversible'; end if;
  if exists(select 1 from public.cash_movements where reversal_of_id=v_m.id) then raise exception 'movement_already_reversed'; end if;
  v_session:=public.erp_current_cash_session_id(); v_number:='MOV-'||lpad(nextval('public.cash_movement_number_seq')::text,6,'0');
  insert into public.cash_movements(movement_number,session_id,movement_type,payment_method,amount_cop,description,purchase_id,reversal_of_id,metadata,created_by)
  values(v_number,v_session,'reversal',v_m.payment_method,-v_m.amount_cop,'Reverso '||v_m.movement_number||': '||btrim(p_reason),v_m.purchase_id,v_m.id,jsonb_build_object('originalType',v_m.movement_type),v_actor) returning id into v_id;
  return v_id;
end;$$;
revoke all on function public.erp_reverse_cash_movement(uuid,text) from public,anon;
grant execute on function public.erp_reverse_cash_movement(uuid,text) to authenticated;

-- Ventas pagadas crean flujo automáticamente. No bloquea ventas si no hay caja abierta.
create or replace function public.erp_cash_from_paid_sale()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_number text; v_session uuid;
begin
  if new.payment_status='pagado' and new.total_cop>0 and not exists(select 1 from public.cash_movements where sale_id=new.id and movement_type='sale') then
    v_session:=public.erp_current_cash_session_id(); v_number:='MOV-'||lpad(nextval('public.cash_movement_number_seq')::text,6,'0');
    insert into public.cash_movements(movement_number,session_id,movement_type,payment_method,amount_cop,description,sale_id,created_by,metadata)
    values(v_number,v_session,'sale',new.payment_method,new.total_cop,'Venta '||new.sale_number,new.id,new.created_by,jsonb_build_object('saleNumber',new.sale_number));
  end if;
  return new;
end;$$;
drop trigger if exists sales_cash_movement_after_insert on public.sales;
create trigger sales_cash_movement_after_insert after insert on public.sales for each row execute function public.erp_cash_from_paid_sale();

-- Backfill de ventas pagadas anteriores a Fase 2, fuera de sesión de caja.
insert into public.cash_movements(movement_number,session_id,movement_type,payment_method,amount_cop,description,sale_id,created_by,created_at,metadata)
select 'MOV-'||lpad(nextval('public.cash_movement_number_seq')::text,6,'0'),null,'sale',s.payment_method,s.total_cop,'Venta histórica '||s.sale_number,s.id,s.created_by,s.created_at,jsonb_build_object('backfill',true,'saleNumber',s.sale_number)
from public.sales s
where s.payment_status='pagado' and s.total_cop>0
  and not exists(select 1 from public.cash_movements m where m.sale_id=s.id and m.movement_type='sale');
