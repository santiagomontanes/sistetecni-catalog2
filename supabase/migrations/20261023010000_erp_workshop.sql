-- Taller: extensión del inventario canónico. NO aplicar a producción sin autorización.
-- Compatible con unidades anteriores, activación explícita y desactivación sin pérdida.
begin;
create table if not exists public.erp_workshop_settings (
  id boolean primary key default true check(id), enabled boolean not null default false
);
insert into public.erp_workshop_settings(id) values(true) on conflict do nothing;

create table if not exists public.workshop_locations (
  id uuid primary key default gen_random_uuid(), code text not null unique check(code ~ '^[A-Z0-9_-]{1,32}$'),
  name text not null check(length(btrim(name)) between 1 and 120),
  parent_id uuid references public.workshop_locations(id) on delete restrict,
  active boolean not null default true, created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), check(parent_id is distinct from id)
);

alter table public.product_units alter column product_id drop not null;
alter table public.inventory_movements alter column product_id drop not null;
alter table public.product_units
  add column if not exists asset_kind text not null default 'computer' check(asset_kind in('computer','ram','storage','charger')),
  add column if not exists installed_in_unit_id uuid references public.product_units(id) on delete restrict,
  add column if not exists workshop_managed boolean not null default false,
  add column if not exists workshop_phase text check(workshop_phase in('reception','diagnosis','technical','aesthetic','final_check','ready','warehouse')),
  add column if not exists preliminary_condition text check(preliminary_condition in('good','fair','bad')),
  add column if not exists location_id uuid references public.workshop_locations(id) on delete restrict,
  add column if not exists row_version bigint not null default 0,
  add column if not exists component_condition text check(component_condition in('untested','functional','defective')),
  add column if not exists component_attributes jsonb not null default '{}' check(jsonb_typeof(component_attributes)='object'),
  add column if not exists component_cost_entry_id uuid references public.cost_entries(id),
  add column if not exists final_battery jsonb not null default '{}' check(jsonb_typeof(final_battery)='object');
create index if not exists workshop_units_phase on public.product_units(workshop_phase,location_id) where workshop_managed;
create index if not exists workshop_units_installed on public.product_units(installed_in_unit_id) where installed_in_unit_id is not null;
create index if not exists workshop_components_available on public.product_units(asset_kind,component_condition,location_id) where installed_in_unit_id is null and asset_kind<>'computer';

create table if not exists public.workshop_qr_labels (
  id uuid primary key default gen_random_uuid(), batch_id uuid not null,
  code text not null unique check(code ~ '^STQ-[A-F0-9]{12}$'),
  state text not null default 'free' check(state in('free','assigned','void')),
  unit_id uuid unique references public.product_units(id) on delete restrict,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  assigned_at timestamptz, void_reason text,
  check((state='assigned' and unit_id is not null) or (state<>'assigned' and unit_id is null))
);
create index if not exists workshop_qr_batch on public.workshop_qr_labels(batch_id,created_at);
create table if not exists public.workshop_receipts (
  id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.product_units(id),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  correction_of uuid unique references public.workshop_receipts(id), reason text,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  check(correction_of is null or length(btrim(reason))>=3)
);
create index if not exists workshop_receipts_unit on public.workshop_receipts(unit_id,created_at);
create table if not exists public.workshop_operations (
  id uuid primary key, actor_id uuid not null references public.profiles(id), action text not null,
  payload jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.workshop_events (
  id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.product_units(id),
  event_type text not null, before_data jsonb, after_data jsonb, reason text,
  reversal_of uuid unique references public.workshop_events(id), operation_id uuid not null,
  actor_id uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create index if not exists workshop_events_unit on public.workshop_events(unit_id,created_at desc);
create table if not exists public.workshop_check_definitions (
  code text primary key check(code ~ '^[a-z0-9_]{1,50}$'), label text not null,
  required boolean not null default true, active boolean not null default true
);
insert into public.workshop_check_definitions(code,label) values
 ('screen','Pantalla'),('keyboard','Teclado'),('ports','Puertos'),('wifi','Wi-Fi'),
 ('audio','Audio'),('storage','Disco'),('battery','Batería') on conflict do nothing;
create table if not exists public.workshop_checks (
  id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.product_units(id),
  code text not null references public.workshop_check_definitions(code),
  result text not null check(result in('passed','failed','not_applicable')), note text,
  actor_id uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  check(result<>'not_applicable' or length(btrim(note))>=3)
);
create index if not exists workshop_checks_unit on public.workshop_checks(unit_id,code,created_at desc);
create table if not exists public.workshop_software (
  id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.product_units(id),
  name text not null check(length(btrim(name)) between 1 and 100), edition text, version text,
  installed boolean not null, tested boolean not null default false, notes text,
  actor_id uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  check(not tested or installed)
);
create index if not exists workshop_software_unit on public.workshop_software(unit_id,created_at desc);
create table if not exists public.workshop_usb_tools (
  id uuid primary key default gen_random_uuid(), code text unique not null check(length(btrim(code)) between 1 and 50),
  location_id uuid references public.workshop_locations(id), content text not null, version text,
  boot_modes text[] not null default '{}', active boolean not null default true,
  updated_by uuid not null references public.profiles(id), updated_at timestamptz not null default now(),
  check(boot_modes <@ array['UEFI','Legacy'])
);

-- Todas las escrituras pasan por funciones autorizadas; ni admin puede mutar evidencia histórica.
create or replace function public.erp_workshop_immutable() returns trigger language plpgsql as $$
begin raise exception 'workshop_history_append_only'; end; $$;
do $$ declare t text; begin
  foreach t in array array['erp_workshop_settings','workshop_locations','workshop_qr_labels','workshop_receipts','workshop_operations','workshop_events','workshop_check_definitions','workshop_checks','workshop_software','workshop_usb_tools'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
    execute format('grant select on table public.%I to authenticated',t);
    execute format('drop policy if exists workshop_read on public.%I',t);
    execute format('create policy workshop_read on public.%I for select to authenticated using(public.erp_has_permission(''inventory.read''))',t);
  end loop;
  foreach t in array array['workshop_receipts','workshop_operations','workshop_events','workshop_checks','workshop_software'] loop
    execute format('drop trigger if exists workshop_immutable on public.%I',t);
    execute format('create trigger workshop_immutable before update or delete on public.%I for each row execute function public.erp_workshop_immutable()',t);
  end loop;
end $$;

create or replace function public.erp_workshop_guard_unit() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='UPDATE' then new.row_version:=old.row_version+1; end if;
  if current_setting('erp.workshop_write',true) is distinct from 'on' then
    if tg_op='INSERT' and (new.workshop_managed or new.asset_kind<>'computer' or new.installed_in_unit_id is not null) then raise exception 'workshop_use_command'; end if;
    if tg_op='UPDATE' and (new.asset_kind is distinct from old.asset_kind or new.installed_in_unit_id is distinct from old.installed_in_unit_id
      or new.workshop_managed is distinct from old.workshop_managed or new.workshop_phase is distinct from old.workshop_phase
      or new.location_id is distinct from old.location_id or new.component_condition is distinct from old.component_condition
      or new.component_attributes is distinct from old.component_attributes or new.component_cost_entry_id is distinct from old.component_cost_entry_id
      or new.final_battery is distinct from old.final_battery or new.preliminary_condition is distinct from old.preliminary_condition
      or (old.workshop_managed and new.spec_overrides is distinct from old.spec_overrides)) then raise exception 'workshop_use_command'; end if;
  end if;
  if new.asset_kind<>'computer' then
    if new.status in('available','reserved','sold') or new.product_id is not null then
      raise exception 'workshop_component_not_commercial';
    end if;
    if new.installed_in_unit_id is not null and not exists(select 1 from public.product_units where id=new.installed_in_unit_id and asset_kind='computer') then
      raise exception 'workshop_invalid_component_parent';
    end if;
  elsif new.installed_in_unit_id is not null then raise exception 'workshop_computer_cannot_be_installed'; end if;
  if new.status in('available','reserved','sold') and new.product_id is null then raise exception 'workshop_product_required'; end if;
  if new.component_attributes ? 'capacityGb' and jsonb_typeof(new.component_attributes->'capacityGb')<>'null' then
    if jsonb_typeof(new.component_attributes->'capacityGb')<>'number' or (new.component_attributes->>'capacityGb')::numeric<=0 or (new.component_attributes->>'capacityGb')::numeric>100000 then raise exception 'workshop_capacity_invalid'; end if;
  end if;
  if new.asset_kind='ram' and new.component_attributes->>'generation' is not null and new.component_attributes->>'generation' not in('DDR2','DDR3','DDR3L','DDR4','DDR5') then raise exception 'workshop_generation_invalid'; end if;
  if new.workshop_managed and (new.status in('available','reserved') or (new.status='sold' and (tg_op='INSERT' or old.status is distinct from 'sold'))) then
    if new.workshop_phase<>'ready' or new.workshop_phase is null then raise exception 'workshop_not_ready'; end if;
    if exists(select 1 from public.workshop_check_definitions d where d.active and d.required and not exists(
      select 1 from (select c.result from public.workshop_checks c where c.unit_id=new.id and c.code=d.code order by c.created_at desc,c.id desc limit 1) c
      where c.result in('passed','not_applicable'))) then raise exception 'workshop_required_checks_missing'; end if;
  end if;
  return new;
end $$;
drop trigger if exists product_units_workshop_guard on public.product_units;
create trigger product_units_workshop_guard before insert or update on public.product_units for each row execute function public.erp_workshop_guard_unit();

create or replace function public.erp_workshop_command(p_action text,p_payload jsonb,p_key uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_previous public.workshop_operations%rowtype;
  v_unit public.product_units%rowtype; v_component public.product_units%rowtype;
  v_label public.workshop_qr_labels%rowtype; v_event public.workshop_events%rowtype;
  v_result jsonb; v_id uuid; v_location uuid; v_batch uuid; v_item jsonb; v_target uuid;
  v_snapshot jsonb; v_code text; v_count integer; v_cost uuid; v_old_cost public.cost_entries%rowtype;
  v_reason text:=nullif(btrim(p_payload->>'reason'),''); v_phase text; v_before jsonb;
begin
  perform public.erp_assert_permission('inventory.manage');
  perform set_config('erp.workshop_write','on',true);
  if p_key is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>80000 then raise exception 'workshop_invalid_request'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_key::text,719));
  select * into v_previous from public.workshop_operations where id=p_key;
  if found then
    if v_previous.actor_id<>v_actor or v_previous.action<>p_action or v_previous.payload<>p_payload then raise exception 'workshop_idempotency_conflict'; end if;
    perform set_config('erp.workshop_write','off',true);
    return v_previous.result;
  end if;
  if p_action='configure' then
    perform public.erp_assert_permission('users.manage');
    update public.erp_workshop_settings set enabled=(p_payload->>'enabled')::boolean where id;
    v_result:=jsonb_build_object('enabled',(p_payload->>'enabled')::boolean);
  else
    if not exists(select 1 from public.erp_workshop_settings where id and enabled) then raise exception 'workshop_disabled'; end if;
    if p_action='qr_batch' then
      v_count:=(p_payload->>'count')::integer;
      if v_count is null or v_count not between 1 and 200 then raise exception 'workshop_batch_1_to_200'; end if;
      v_batch:=gen_random_uuid();
      insert into public.workshop_qr_labels(batch_id,code,created_by)
        select v_batch,'STQ-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),v_actor from generate_series(1,v_count);
      select jsonb_build_object('batchId',v_batch,'labels',jsonb_agg(jsonb_build_object('id',id,'code',code))) into v_result from public.workshop_qr_labels where batch_id=v_batch;
    elsif p_action='qr_void' then
      if v_reason is null or length(v_reason)<3 then raise exception 'workshop_reason_required'; end if;
      select * into v_label from public.workshop_qr_labels where code=upper(btrim(p_payload->>'code')) for update;
      if not found or v_label.state<>'free' then raise exception 'workshop_qr_not_free'; end if;
      update public.workshop_qr_labels set state='void',void_reason=v_reason where id=v_label.id;
      v_result:=jsonb_build_object('code',v_label.code,'state','void');
    elsif p_action='location' then
      v_id:=nullif(p_payload->>'id','')::uuid;
      v_location:=nullif(p_payload->>'parentId','')::uuid;
      if v_location is not null and not exists(select 1 from public.workshop_locations where id=v_location and active) then raise exception 'workshop_location_inactive'; end if;
      if v_id is null then
        insert into public.workshop_locations(code,name,parent_id,created_by) values(upper(btrim(p_payload->>'code')),btrim(p_payload->>'name'),v_location,v_actor) returning id into v_id;
      else
        -- La jerarquía se define al crear; no se reparenta una ubicación con historial.
        update public.workshop_locations set active=(p_payload->>'active')::boolean where id=v_id;
        if not found then raise exception 'workshop_location_missing'; end if;
      end if;
      v_result:=jsonb_build_object('id',v_id);
    elsif p_action='receive' or p_action='component_receive' then
      v_location:=nullif(p_payload->>'locationId','')::uuid;
      if v_location is null or not exists(select 1 from public.workshop_locations where id=v_location and active) then raise exception 'workshop_location_required'; end if;
      v_snapshot:=p_payload->'snapshot';
      if v_snapshot is null or jsonb_typeof(v_snapshot)<>'object' or octet_length(v_snapshot::text)>40000 then raise exception 'workshop_snapshot_invalid'; end if;
      if p_action='receive' and (jsonb_typeof(coalesce(v_snapshot->'components','[]'))<>'array' or jsonb_array_length(coalesce(v_snapshot->'components','[]'))>30) then raise exception 'workshop_components_invalid'; end if;
      if p_action='receive' then
        select * into v_label from public.workshop_qr_labels where code=upper(btrim(p_payload->>'qrCode')) for update;
        if not found then raise exception 'workshop_qr_missing'; end if;
        if v_label.state<>'free' then raise exception 'workshop_qr_not_free'; end if;
        v_id:=nullif(p_payload->>'existingUnitId','')::uuid;
        if v_id is not null then
          -- Una compra ya recibida conserva su STU y su costo de lote, sin doble recepción.
          select * into v_unit from public.product_units where id=v_id for update;
          if not found or v_unit.asset_kind<>'computer' or v_unit.workshop_managed or v_unit.status not in('received','inspection') then raise exception 'workshop_existing_unit_invalid'; end if;
          update public.product_units set workshop_managed=true,workshop_phase=case when p_payload->>'condition'='bad' then 'warehouse' else 'reception' end,location_id=v_location,
            preliminary_condition=p_payload->>'condition' where id=v_id;
        else
          v_code:='STU-'||lpad(public.erp_internal_next_product_unit_number()::text,6,'0');
          insert into public.product_units(unit_code,product_id,serial_number,acquisition_cost_cop,status,workshop_managed,workshop_phase,preliminary_condition,location_id,created_by,notes)
          values(v_code,nullif(p_payload->>'productId','')::uuid,nullif(btrim(v_snapshot->>'serial'),''),nullif(p_payload->>'costCop','')::bigint,'received',true,
            case when p_payload->>'condition'='bad' then 'warehouse' else 'reception' end,p_payload->>'condition',v_location,v_actor,v_snapshot->>'notes') returning id into v_id;
        end if;
        select * into v_unit from public.product_units where id=v_id;
        v_snapshot:=v_snapshot||jsonb_build_object('unitCode',v_unit.unit_code,'receivedLocationId',v_location,
          'preliminaryCondition',v_unit.preliminary_condition,'acquisitionCostCop',v_unit.acquisition_cost_cop::text,'purchaseId',v_unit.purchase_id);
        insert into public.workshop_receipts(unit_id,snapshot,created_by) values(v_id,v_snapshot,v_actor);
        update public.workshop_qr_labels set state='assigned',unit_id=v_id,assigned_at=now() where id=v_label.id;
        for v_item in select value from jsonb_array_elements(coalesce(v_snapshot->'components','[]')) loop
          if v_item->>'kind' not in('ram','storage','charger') then raise exception 'workshop_component_kind_invalid'; end if;
          insert into public.product_units(unit_code,asset_kind,installed_in_unit_id,component_attributes,component_condition,acquisition_cost_cop,location_id,workshop_managed,created_by)
          values('STU-'||lpad(public.erp_internal_next_product_unit_number()::text,6,'0'),v_item->>'kind',v_id,v_item-'kind','untested',0,v_location,true,v_actor) returning id into v_target;
          insert into public.inventory_movements(unit_id,movement_type,to_status,created_by,metadata)
          values(v_target,'receipt','received',v_actor,jsonb_build_object('receivedInstalledIn',v_id,'costIncludedInParent',true,'operationId',p_key));
        end loop;
        update public.product_units set spec_overrides=spec_overrides||jsonb_build_object('ramGb',(
          select case when count(*)=0 or count(*) filter(where component_attributes->>'capacityGb' is null)>0 then null else sum((component_attributes->>'capacityGb')::numeric) end
          from public.product_units where installed_in_unit_id=v_id and asset_kind='ram')) where id=v_id;
      else
        if p_payload->>'kind' not in('ram','storage','charger') then raise exception 'workshop_component_kind_invalid'; end if;
        insert into public.product_units(unit_code,asset_kind,component_attributes,component_condition,acquisition_cost_cop,location_id,workshop_managed,created_by)
        values('STU-'||lpad(public.erp_internal_next_product_unit_number()::text,6,'0'),p_payload->>'kind',v_snapshot,coalesce(p_payload->>'componentCondition','untested'),nullif(p_payload->>'costCop','')::bigint,v_location,true,v_actor) returning id into v_id;
      end if;
      select * into v_unit from public.product_units where id=v_id;
      insert into public.inventory_movements(unit_id,product_id,movement_type,to_status,created_by,metadata)
      values(v_id,v_unit.product_id,'receipt',v_unit.status,v_actor,jsonb_build_object('workshopOperation',p_key));
      insert into public.workshop_events(unit_id,event_type,after_data,operation_id,actor_id)
      values(v_id,'receipt',v_snapshot||jsonb_build_object('workshop_phase',v_unit.workshop_phase,'location_id',v_unit.location_id),p_key,v_actor);
      v_result:=jsonb_build_object('unitId',v_id,'unitCode',v_unit.unit_code);
    elsif p_action='check_definition' then
      perform public.erp_assert_permission('users.manage');
      insert into public.workshop_check_definitions(code,label,required,active) values(p_payload->>'code',p_payload->>'label',(p_payload->>'required')::boolean,(p_payload->>'active')::boolean)
      on conflict(code) do update set label=excluded.label,required=excluded.required,active=excluded.active;
      if (p_payload->>'required')::boolean and (p_payload->>'active')::boolean then
        update public.product_units set status='inspection',workshop_phase='final_check' where workshop_managed and status='available';
      end if;
      v_result:=jsonb_build_object('code',p_payload->>'code');
    elsif p_action='usb' then
      insert into public.workshop_usb_tools(code,location_id,content,version,boot_modes,active,updated_by)
      values(btrim(p_payload->>'code'),nullif(p_payload->>'locationId','')::uuid,p_payload->>'content',p_payload->>'version',array(select jsonb_array_elements_text(coalesce(p_payload->'bootModes','[]'))),coalesce((p_payload->>'active')::boolean,true),v_actor)
      on conflict(code) do update set location_id=excluded.location_id,content=excluded.content,version=excluded.version,boot_modes=excluded.boot_modes,active=excluded.active,updated_by=v_actor,updated_at=now() returning id into v_id;
      v_result:=jsonb_build_object('id',v_id);
    else
      v_id:=nullif(p_payload->>'unitId','')::uuid;
      -- Orden estable de bloqueos: dos técnicos jamás consumen la misma pieza.
      perform 1 from public.product_units where id in(v_id,nullif(p_payload->>'componentId','')::uuid) order by id for update;
      select * into v_unit from public.product_units where id=v_id;
      if not found then raise exception 'workshop_unit_missing'; end if;
      if not v_unit.workshop_managed then raise exception 'workshop_receive_existing_first'; end if;
      if (p_payload->>'version') is null or (p_payload->>'version')::bigint<>v_unit.row_version then raise exception 'workshop_version_conflict'; end if;
      if v_unit.status in('sold','reserved','retired') then raise exception 'workshop_unit_locked_commercially'; end if;
      v_before:=to_jsonb(v_unit);
      if p_action='move' then
        v_location:=nullif(p_payload->>'locationId','')::uuid;
        if not exists(select 1 from public.workshop_locations where id=v_location and active) then raise exception 'workshop_location_inactive'; end if;
        if v_unit.installed_in_unit_id is not null then raise exception 'workshop_move_parent_instead'; end if;
        update public.product_units set location_id=v_location where id=v_id or installed_in_unit_id=v_id;
      elsif p_action='phase' then
        v_phase:=p_payload->>'phase';
        update public.product_units set workshop_phase=v_phase,
          status=case when v_phase='ready' then 'available' when status='available' then 'inspection' else status end
        where id=v_id and asset_kind='computer';
        if not found then raise exception 'workshop_computer_required'; end if;
      elsif p_action='correct_receipt' then
        perform public.erp_assert_permission('users.manage');
        if length(coalesce(v_reason,''))<3 then raise exception 'workshop_reason_required'; end if;
        select id into v_target from public.workshop_receipts where unit_id=v_id order by created_at desc,id desc limit 1;
        if not found then raise exception 'workshop_receipt_missing'; end if;
        insert into public.workshop_receipts(unit_id,snapshot,correction_of,reason,created_by) values(v_id,p_payload->'snapshot',v_target,v_reason,v_actor);
        update public.product_units set notes=notes where id=v_id;
      elsif p_action='configuration' then
        if v_unit.asset_kind<>'computer' or jsonb_typeof(p_payload->'configuration')<>'object' then raise exception 'workshop_configuration_invalid'; end if;
        if exists(select 1 from jsonb_object_keys(p_payload->'configuration') k where k not in('cpu','screen','ramGeneration','ramFormFactor','storageInterfaces','chargerVoltage','chargerConnector')) then raise exception 'workshop_configuration_key_invalid'; end if;
        update public.product_units set spec_overrides=spec_overrides||(p_payload->'configuration'),status=case when status='available' then 'inspection' else status end,
          workshop_phase=case when workshop_phase='ready' then 'final_check' else workshop_phase end where id=v_id;
      elsif p_action='check' then
        insert into public.workshop_checks(unit_id,code,result,note,actor_id) values(v_id,p_payload->>'code',p_payload->>'result',p_payload->>'note',v_actor);
        update public.product_units set status=case when status='available' then 'inspection' else status end,
          workshop_phase=case when workshop_phase='ready' then 'final_check' else workshop_phase end,
          final_battery=case when p_payload->>'code'='battery' then jsonb_build_object('result',p_payload->>'result','note',p_payload->>'note','testedAt',now()) else final_battery end where id=v_id;
      elsif p_action='software' then
        insert into public.workshop_software(unit_id,name,edition,version,installed,tested,notes,actor_id)
        values(v_id,p_payload->>'name',p_payload->>'edition',p_payload->>'softwareVersion',(p_payload->>'installed')::boolean,coalesce((p_payload->>'tested')::boolean,false),p_payload->>'notes',v_actor);
        update public.product_units set notes=notes where id=v_id;
      elsif p_action='component_test' then
        if v_unit.asset_kind='computer' or v_unit.installed_in_unit_id is not null then raise exception 'workshop_loose_component_required'; end if;
        update public.product_units set component_condition=p_payload->>'condition' where id=v_id;
      elsif p_action='component_move' then
        if v_unit.asset_kind<>'computer' then raise exception 'workshop_computer_required'; end if;
        select * into v_component from public.product_units where id=(p_payload->>'componentId')::uuid;
        if not found or v_component.asset_kind='computer' then raise exception 'workshop_component_missing'; end if;
        if v_component.row_version<>coalesce((p_payload->>'componentVersion')::bigint,-1) then raise exception 'workshop_version_conflict'; end if;
        if length(coalesce(v_reason,''))<3 then raise exception 'workshop_reason_required'; end if;
        if p_payload->>'reversalOf' is not null then
          select * into v_event from public.workshop_events where id=(p_payload->>'reversalOf')::uuid;
          if not found or v_event.unit_id<>v_id or v_event.event_type<>'component_move' or v_event.after_data->>'componentId'<>v_component.id::text or v_event.after_data->>'direction'=p_payload->>'direction' then raise exception 'workshop_invalid_reversal'; end if;
        end if;
        if p_payload->>'direction'='install' then
          if v_component.installed_in_unit_id is not null or v_component.component_condition<>'functional' or v_component.status='retired' then raise exception 'workshop_component_unavailable'; end if;
          if v_component.asset_kind='ram' and v_unit.spec_overrides->>'ramGeneration' is not null and v_component.component_attributes->>'generation' is not null and v_unit.spec_overrides->>'ramGeneration'<>v_component.component_attributes->>'generation' then raise exception 'workshop_incompatible_ram'; end if;
          if v_component.asset_kind='ram' and nullif(btrim(v_unit.spec_overrides->>'ramFormFactor'),'') is not null and nullif(btrim(v_component.component_attributes->>'formFactor'),'') is not null and lower(btrim(v_unit.spec_overrides->>'ramFormFactor'))<>lower(btrim(v_component.component_attributes->>'formFactor')) then raise exception 'workshop_incompatible_ram_format'; end if;
          if v_component.asset_kind='storage' and jsonb_typeof(v_unit.spec_overrides->'storageInterfaces')='array' and jsonb_array_length(v_unit.spec_overrides->'storageInterfaces')>0 and v_component.component_attributes->>'interface' is not null and v_component.component_attributes->>'interface'<>'unknown' and not (v_unit.spec_overrides->'storageInterfaces' ? (v_component.component_attributes->>'interface')) then raise exception 'workshop_incompatible_storage_interface'; end if;
          if v_component.asset_kind='charger' and nullif(v_unit.spec_overrides->>'chargerConnector','') is not null and nullif(v_component.component_attributes->>'connector','') is not null and v_unit.spec_overrides->>'chargerConnector'<>v_component.component_attributes->>'connector' then raise exception 'workshop_incompatible_charger_connector'; end if;
          if v_component.asset_kind='charger' and v_unit.spec_overrides->>'chargerVoltage' is not null and v_component.component_attributes->>'voltage' is not null and (v_unit.spec_overrides->>'chargerVoltage')::numeric<>(v_component.component_attributes->>'voltage')::numeric then raise exception 'workshop_incompatible_charger_voltage'; end if;
          v_cost:=null;
          if coalesce(v_component.acquisition_cost_cop,0)>0 then
            insert into public.cost_entries(cost_number,entry_kind,category,product_unit_id,description,amount_cop,reference_type,reference_id,created_by)
            values('CST-'||lpad(nextval('public.cost_entry_number_seq')::text,6,'0'),'cost','spare_part',v_id,'Instalación componente '||v_component.unit_code,v_component.acquisition_cost_cop,'workshop_component',v_component.id,v_actor) returning id into v_cost;
          end if;
          update public.product_units set installed_in_unit_id=v_id,location_id=v_unit.location_id,component_cost_entry_id=v_cost where id=v_component.id;
        elsif p_payload->>'direction'='remove' then
          if v_component.installed_in_unit_id is distinct from v_id then raise exception 'workshop_component_not_installed'; end if;
          v_location:=nullif(p_payload->>'locationId','')::uuid;
          if not exists(select 1 from public.workshop_locations where id=v_location and active) then raise exception 'workshop_location_required'; end if;
          if v_component.component_cost_entry_id is not null then
            select * into v_old_cost from public.cost_entries where id=v_component.component_cost_entry_id;
            insert into public.cost_entries(cost_number,entry_kind,category,product_unit_id,description,amount_cop,reference_type,reference_id,reversal_of_id,created_by)
            values('CST-'||lpad(nextval('public.cost_entry_number_seq')::text,6,'0'),'reversal',v_old_cost.category,v_id,'Retiro componente '||v_component.unit_code,-v_old_cost.amount_cop,v_old_cost.reference_type,v_old_cost.reference_id,v_old_cost.id,v_actor);
          end if;
          update public.product_units set installed_in_unit_id=null,location_id=v_location,component_condition=coalesce(p_payload->>'condition','untested'),component_cost_entry_id=null where id=v_component.id;
        else raise exception 'workshop_direction_invalid'; end if;
        -- Cambiar hardware invalida los controles anteriores: se exige comprobar otra vez.
        insert into public.workshop_checks(unit_id,code,result,note,actor_id)
          select v_id,code,'failed','Pendiente de repetir después de cambio de componentes',v_actor from public.workshop_check_definitions where active and required;
        update public.product_units set status=case when status='available' then 'inspection' else status end,workshop_phase='technical',
          spec_overrides=spec_overrides || jsonb_build_object('ramGb',(select case when count(*) filter(where component_attributes->>'capacityGb' is null)>0 then null else coalesce(sum((component_attributes->>'capacityGb')::numeric),0) end from public.product_units where installed_in_unit_id=v_id and asset_kind='ram')) where id=v_id;
        insert into public.inventory_movements(unit_id,product_id,movement_type,from_status,to_status,created_by,reason,metadata)
        values(v_component.id,v_component.product_id,'adjustment',v_component.status,v_component.status,v_actor,v_reason,
          jsonb_build_object('direction',p_payload->>'direction','computerId',v_id,'fromInstalledIn',v_component.installed_in_unit_id,'fromLocation',v_component.location_id,'operationId',p_key));
      else raise exception 'workshop_action_unknown'; end if;
      select to_jsonb(u) into v_snapshot from public.product_units u where id=v_id;
      insert into public.workshop_events(unit_id,event_type,before_data,after_data,reason,reversal_of,operation_id,actor_id)
      values(v_id,p_action,v_before,v_snapshot||p_payload,v_reason,nullif(p_payload->>'reversalOf','')::uuid,p_key,v_actor);
      v_result:=jsonb_build_object('unitId',v_id,'version',v_snapshot->'row_version');
    end if;
  end if;
  insert into public.workshop_operations(id,actor_id,action,payload,result) values(p_key,v_actor,p_action,p_payload,v_result);
  insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,metadata)
    values('web_admin',v_actor::text,'web','workshop.'||p_action,'workshop_operation',p_key,jsonb_build_object('operationId',p_key));
  perform set_config('erp.workshop_write','off',true);
  return v_result;
end $$;
revoke all on function public.erp_workshop_command(text,jsonb,uuid) from public,anon;
grant execute on function public.erp_workshop_command(text,jsonb,uuid) to authenticated;

create or replace function public.erp_workshop_read(p_unit_id uuid default null,p_search text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_unit jsonb; v_result jsonb; begin
  perform public.erp_assert_permission('inventory.read');
  if p_offset<0 or p_offset>100000 then raise exception 'workshop_offset_invalid'; end if;
  select to_jsonb(u) into v_unit from public.product_units u where id=p_unit_id;
  select jsonb_build_object(
    'enabled',(select enabled from public.erp_workshop_settings where id),
    'unit',v_unit,
    'locations',coalesce((select jsonb_agg(to_jsonb(l) order by code) from public.workshop_locations l),'[]'),
    'definitions',coalesce((select jsonb_agg(to_jsonb(d) order by code) from public.workshop_check_definitions d),'[]'),
    'units',coalesce((select jsonb_agg(to_jsonb(u)) from (select * from public.product_units where workshop_managed and (coalesce(p_search,'')='' or unit_code ilike '%'||p_search||'%' or serial_number ilike '%'||p_search||'%') order by received_at desc,id limit 50 offset p_offset) u),'[]'),
    'components',coalesce((select jsonb_agg(to_jsonb(c)) from(select * from public.product_units where asset_kind<>'computer' and (installed_in_unit_id=p_unit_id or installed_in_unit_id is null) order by installed_in_unit_id nulls last,unit_code limit 200) c),'[]'),
    'receipts',coalesce((select jsonb_agg(to_jsonb(r) order by created_at) from public.workshop_receipts r where unit_id=p_unit_id),'[]'),
    'events',coalesce((select jsonb_agg(to_jsonb(e)) from(select * from public.workshop_events where unit_id=p_unit_id order by created_at desc limit 100) e),'[]'),
    'checks',coalesce((select jsonb_agg(to_jsonb(c)) from(select distinct on(code) * from public.workshop_checks where unit_id=p_unit_id order by code,created_at desc,id desc) c),'[]'),
    'software',coalesce((select jsonb_agg(to_jsonb(s)) from(select * from public.workshop_software where unit_id=p_unit_id order by created_at desc limit 100) s),'[]'),
    'usb',coalesce((select jsonb_agg(to_jsonb(t) order by code) from public.workshop_usb_tools t),'[]'),
    'qr',case when p_search like 'STQ-%' then (select to_jsonb(q) from public.workshop_qr_labels q where code=upper(btrim(p_search))) else null end
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.erp_workshop_read(uuid,text,integer) from public,anon;
grant execute on function public.erp_workshop_read(uuid,text,integer) to authenticated;

create or replace function public.erp_workshop_components(p_query text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_result jsonb; begin
  perform public.erp_assert_permission('inventory.read');
  if p_offset<0 or p_offset>100000 or length(coalesce(p_query,''))>150 then raise exception 'workshop_query_invalid'; end if;
  select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(c)),'[]'),'offset',p_offset,'pageSize',50) into v_result
  from (select * from public.product_units where asset_kind<>'computer' and installed_in_unit_id is null and status<>'retired'
    and (coalesce(p_query,'')='' or unit_code ilike '%'||p_query||'%' or component_attributes::text ilike '%'||p_query||'%')
    order by unit_code limit 50 offset p_offset) c;
  return v_result;
end $$;
revoke all on function public.erp_workshop_components(text,integer) from public,anon;
grant execute on function public.erp_workshop_components(text,integer) to authenticated;

-- Rollback operativo no destructivo: update public.erp_workshop_settings set enabled=false;
-- Conservar tablas, evidencia, FK y guardas para no perder identidad ni permitir ventas inseguras.
-- El rollback estructural requiere exportación y revisión de referencias; NO eliminar tablas con datos.
commit;
