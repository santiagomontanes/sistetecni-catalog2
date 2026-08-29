-- SISTETECNI ERP — Fase 2D
-- Roles/permisos del panel + wrappers de compatibilidad para RPCs 1A–1G.
--
-- Principio: perfiles no-admin NO se convierten persistentemente en admins.
-- Los wrappers SECURITY DEFINER validan erp_role, elevan is_admin solo dentro
-- de la misma transacción para reutilizar RPCs legacy ya auditados, y restauran
-- el valor antes del commit. El cambio no es visible a otras transacciones.

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists erp_role text,
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

update public.profiles
set erp_role = case when is_admin=true then 'admin' else 'viewer' end
where erp_role is null;

alter table public.profiles alter column erp_role set default 'viewer';
alter table public.profiles alter column erp_role set not null;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='profiles_erp_role_check' and conrelid='public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_erp_role_check
      check (erp_role in ('admin','supervisor','vendedor','tecnico','caja','bodega','viewer'));
  end if;
end $$;

create or replace function public.erp_role_has_permission(p_role text,p_permission text)
returns boolean language sql immutable set search_path=public,pg_temp as $$
  select case
    when p_role='admin' then true
    when p_role='supervisor' then p_permission = any(array[
      'customers.manage','inventory.read','inventory.manage','inventory.reserve',
      'sales.read','sales.manage','warranties.open','warranties.manage',
      'purchases.read','purchases.manage','cash.read','cash.manage',
      'expenses.read','expenses.manage','reports.view','profitability.view','quotes.manage'
    ])
    when p_role='vendedor' then p_permission = any(array[
      'customers.manage','inventory.read','inventory.reserve','sales.read','sales.manage','warranties.open','quotes.manage'
    ])
    when p_role='tecnico' then p_permission = any(array[
      'inventory.read','inventory.manage','warranties.open','warranties.manage'
    ])
    when p_role='caja' then p_permission = any(array[
      'sales.read','cash.read','cash.manage','expenses.read','expenses.manage'
    ])
    when p_role='bodega' then p_permission = any(array[
      'inventory.read','inventory.manage','inventory.reserve','purchases.read','purchases.manage'
    ])
    else false
  end;
$$;

create or replace function public.erp_has_permission(p_permission text)
returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.active=true
      and public.erp_role_has_permission(p.erp_role,p_permission)
  );
$$;
revoke all on function public.erp_has_permission(text) from public,anon;
grant execute on function public.erp_has_permission(text) to authenticated;

create or replace function public.erp_assert_permission(p_permission text)
returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not public.erp_has_permission(p_permission) then
    raise exception 'erp_permission_denied:%',p_permission using errcode='42501';
  end if;
end;$$;
revoke all on function public.erp_assert_permission(text) from public,anon,authenticated;

-- Helpers internos: elevación legacy transaccional. Nunca exponer por API.
create or replace function public.erp_legacy_elevate()
returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_previous boolean;
begin
  if v_actor is null then raise exception 'erp_auth_required' using errcode='42501'; end if;
  select coalesce(is_admin,false) into v_previous from public.profiles where id=v_actor for update;
  if not found then raise exception 'erp_profile_required' using errcode='42501'; end if;
  if not v_previous then update public.profiles set is_admin=true where id=v_actor; end if;
  return v_previous;
end;$$;

create or replace function public.erp_legacy_restore(p_previous boolean)
returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is not null and not coalesce(p_previous,false) then
    update public.profiles set is_admin=false where id=auth.uid();
  end if;
end;$$;
revoke all on function public.erp_legacy_elevate() from public,anon,authenticated;
revoke all on function public.erp_legacy_restore(boolean) from public,anon,authenticated;

-- Administración de perfiles: solo role=admin persistente.
create or replace function public.erp_set_profile_role(
  p_profile_id uuid,p_role text,p_display_name text default null,p_active boolean default true
) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_role text:=lower(btrim(coalesce(p_role,'')));
begin
  if v_actor is null or not exists(select 1 from public.profiles p where p.id=v_actor and p.active=true and p.erp_role='admin') then
    raise exception 'erp_users_admin_required' using errcode='42501';
  end if;
  if v_role not in ('admin','supervisor','vendedor','tecnico','caja','bodega','viewer') then raise exception 'invalid_erp_role'; end if;
  update public.profiles set erp_role=v_role,display_name=nullif(btrim(coalesce(p_display_name,'')),''),active=coalesce(p_active,true),updated_at=now()
  where id=p_profile_id;
  if not found then raise exception 'profile_not_found'; end if;
  return p_profile_id;
end;$$;
revoke all on function public.erp_set_profile_role(uuid,text,text,boolean) from public,anon;
grant execute on function public.erp_set_profile_role(uuid,text,text,boolean) to authenticated;

-- Admin puede listar perfiles; cada usuario sigue pudiendo leer el propio.
drop policy if exists "profiles erp admin read all" on public.profiles;
create policy "profiles erp admin read all" on public.profiles for select to authenticated
  using (public.erp_has_permission('users.manage'));

-- ============================================================================
-- Wrappers de compatibilidad. Se renombran los RPC públicos probados y se
-- vuelve a publicar el mismo nombre/signatura con control de permiso.
-- ============================================================================

alter function public.erp_create_customer(text,text,text,text,text,text,text,text)
  rename to erp_internal_create_customer;
revoke all on function public.erp_internal_create_customer(text,text,text,text,text,text,text,text) from public,anon,authenticated;
create function public.erp_create_customer(
  p_full_name text,p_document_type text default null,p_document_number text default null,p_phone text default null,
  p_email text default null,p_address text default null,p_city text default null,p_notes text default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prev boolean; v_id uuid; begin
  perform public.erp_assert_permission('customers.manage'); v_prev:=public.erp_legacy_elevate();
  v_id:=public.erp_internal_create_customer(p_full_name,p_document_type,p_document_number,p_phone,p_email,p_address,p_city,p_notes);
  perform public.erp_legacy_restore(v_prev); return v_id;
end;$$;
grant execute on function public.erp_create_customer(text,text,text,text,text,text,text,text) to authenticated;

alter function public.erp_receive_product_unit(uuid,text,bigint,integer,integer,jsonb,text)
  rename to erp_internal_receive_product_unit;
revoke all on function public.erp_internal_receive_product_unit(uuid,text,bigint,integer,integer,jsonb,text) from public,anon,authenticated;
create function public.erp_receive_product_unit(
  p_product_id uuid,p_serial_number text default null,p_acquisition_cost_cop bigint default null,
  p_battery_health_percent integer default null,p_storage_health_percent integer default null,
  p_spec_overrides jsonb default '{}'::jsonb,p_notes text default null
) returns table(unit_id uuid,unit_code text) language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prev boolean; begin
  perform public.erp_assert_permission('inventory.manage'); v_prev:=public.erp_legacy_elevate();
  return query select * from public.erp_internal_receive_product_unit(p_product_id,p_serial_number,p_acquisition_cost_cop,p_battery_health_percent,p_storage_health_percent,p_spec_overrides,p_notes);
  perform public.erp_legacy_restore(v_prev);
end;$$;
grant execute on function public.erp_receive_product_unit(uuid,text,bigint,integer,integer,jsonb,text) to authenticated;

alter function public.erp_mark_unit_available(uuid) rename to erp_internal_mark_unit_available;
revoke all on function public.erp_internal_mark_unit_available(uuid) from public,anon,authenticated;
create function public.erp_mark_unit_available(p_unit_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prev boolean; v_id uuid; begin
  perform public.erp_assert_permission('inventory.manage'); v_prev:=public.erp_legacy_elevate();
  v_id:=public.erp_internal_mark_unit_available(p_unit_id); perform public.erp_legacy_restore(v_prev); return v_id;
end;$$;
grant execute on function public.erp_mark_unit_available(uuid) to authenticated;

alter function public.erp_transition_product_unit(uuid,text,text,text,text,timestamptz)
  rename to erp_internal_transition_product_unit;
revoke all on function public.erp_internal_transition_product_unit(uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
create function public.erp_transition_product_unit(
  p_unit_id uuid,p_to_status text,p_reason text default null,p_reservation_customer_name text default null,
  p_reservation_customer_phone text default null,p_reservation_expires_at timestamptz default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prev boolean; v_id uuid; v_current text; v_perm text; begin
  select status into v_current from public.product_units where id=p_unit_id;
  if not found then raise exception 'unit_not_found'; end if;
  v_perm:=case when lower(btrim(coalesce(p_to_status,'')))='reserved'
                    or (v_current='reserved' and lower(btrim(coalesce(p_to_status,'')))='available')
               then 'inventory.reserve' else 'inventory.manage' end;
  perform public.erp_assert_permission(v_perm); v_prev:=public.erp_legacy_elevate();
  v_id:=public.erp_internal_transition_product_unit(p_unit_id,p_to_status,p_reason,p_reservation_customer_name,p_reservation_customer_phone,p_reservation_expires_at);
  perform public.erp_legacy_restore(v_prev); return v_id;
end;$$;
grant execute on function public.erp_transition_product_unit(uuid,text,text,text,text,timestamptz) to authenticated;

alter function public.erp_create_sale_with_units(uuid,text,text,text,text,jsonb,bigint,text,text,integer,text,uuid)
  rename to erp_internal_create_sale_with_units;
revoke all on function public.erp_internal_create_sale_with_units(uuid,text,text,text,text,jsonb,bigint,text,text,integer,text,uuid) from public,anon,authenticated;
create function public.erp_create_sale_with_units(
  p_customer_id uuid,p_customer_name text,p_customer_document text,p_customer_phone text,p_customer_email text,
  p_items jsonb,p_discount_cop bigint,p_payment_method text,p_payment_status text,p_warranty_months integer,
  p_notes text,p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prev boolean; v_id uuid; begin
  perform public.erp_assert_permission('sales.manage'); v_prev:=public.erp_legacy_elevate();
  v_id:=public.erp_internal_create_sale_with_units(p_customer_id,p_customer_name,p_customer_document,p_customer_phone,p_customer_email,p_items,p_discount_cop,p_payment_method,p_payment_status,p_warranty_months,p_notes,p_idempotency_key);
  perform public.erp_legacy_restore(v_prev); return v_id;
end;$$;
grant execute on function public.erp_create_sale_with_units(uuid,text,text,text,text,jsonb,bigint,text,text,integer,text,uuid) to authenticated;

alter function public.erp_set_product_stock_mode(uuid,boolean) rename to erp_internal_set_product_stock_mode;
revoke all on function public.erp_internal_set_product_stock_mode(uuid,boolean) from public,anon,authenticated;
create function public.erp_set_product_stock_mode(p_product_id uuid,p_enabled boolean)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prev boolean; v_result integer; begin
  perform public.erp_assert_permission('inventory.manage'); v_prev:=public.erp_legacy_elevate();
  v_result:=public.erp_internal_set_product_stock_mode(p_product_id,p_enabled); perform public.erp_legacy_restore(v_prev); return v_result;
end;$$;
grant execute on function public.erp_set_product_stock_mode(uuid,boolean) to authenticated;

alter function public.erp_open_after_sales_case(uuid,text,text,text,text[]) rename to erp_internal_open_after_sales_case;
revoke all on function public.erp_internal_open_after_sales_case(uuid,text,text,text,text[]) from public,anon,authenticated;
create function public.erp_open_after_sales_case(
  p_sale_item_id uuid,p_case_type text,p_reported_issue text,p_intake_condition text default null,p_evidence_urls text[] default '{}'::text[]
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prev boolean; v_id uuid; begin
  perform public.erp_assert_permission('warranties.open'); v_prev:=public.erp_legacy_elevate();
  v_id:=public.erp_internal_open_after_sales_case(p_sale_item_id,p_case_type,p_reported_issue,p_intake_condition,p_evidence_urls);
  perform public.erp_legacy_restore(v_prev); return v_id;
end;$$;
grant execute on function public.erp_open_after_sales_case(uuid,text,text,text,text[]) to authenticated;

alter function public.erp_progress_after_sales_case(uuid,text,text,text,bigint) rename to erp_internal_progress_after_sales_case;
revoke all on function public.erp_internal_progress_after_sales_case(uuid,text,text,text,bigint) from public,anon,authenticated;
create function public.erp_progress_after_sales_case(
  p_case_id uuid,p_action text,p_note text default null,p_diagnosis text default null,p_cost_cop bigint default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prev boolean; v_id uuid; begin
  perform public.erp_assert_permission('warranties.manage'); v_prev:=public.erp_legacy_elevate();
  v_id:=public.erp_internal_progress_after_sales_case(p_case_id,p_action,p_note,p_diagnosis,p_cost_cop);
  perform public.erp_legacy_restore(v_prev); return v_id;
end;$$;
grant execute on function public.erp_progress_after_sales_case(uuid,text,text,text,bigint) to authenticated;

alter function public.erp_create_supplier(text,text,text,text,text,text,text,text,text) rename to erp_internal_create_supplier;
revoke all on function public.erp_internal_create_supplier(text,text,text,text,text,text,text,text,text) from public,anon,authenticated;
create function public.erp_create_supplier(
 p_name text,p_document_type text default null,p_document_number text default null,p_contact_name text default null,
 p_phone text default null,p_email text default null,p_address text default null,p_city text default null,p_notes text default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prev boolean; v_id uuid; begin
  perform public.erp_assert_permission('purchases.manage'); v_prev:=public.erp_legacy_elevate();
  v_id:=public.erp_internal_create_supplier(p_name,p_document_type,p_document_number,p_contact_name,p_phone,p_email,p_address,p_city,p_notes);
  perform public.erp_legacy_restore(v_prev); return v_id;
end;$$;
grant execute on function public.erp_create_supplier(text,text,text,text,text,text,text,text,text) to authenticated;

alter function public.erp_receive_purchase_batch(uuid,text,date,bigint,text,jsonb) rename to erp_internal_receive_purchase_batch;
revoke all on function public.erp_internal_receive_purchase_batch(uuid,text,date,bigint,text,jsonb) from public,anon,authenticated;
create function public.erp_receive_purchase_batch(
 p_supplier_id uuid,p_supplier_invoice_reference text,p_purchase_date date,p_shared_costs_cop bigint,p_notes text,p_units jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prev boolean; v_id uuid; begin
  perform public.erp_assert_permission('purchases.manage'); v_prev:=public.erp_legacy_elevate();
  v_id:=public.erp_internal_receive_purchase_batch(p_supplier_id,p_supplier_invoice_reference,p_purchase_date,p_shared_costs_cop,p_notes,p_units);
  perform public.erp_legacy_restore(v_prev); return v_id;
end;$$;
grant execute on function public.erp_receive_purchase_batch(uuid,text,date,bigint,text,jsonb) to authenticated;
