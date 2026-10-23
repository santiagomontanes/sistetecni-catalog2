-- Sólo preparación local. Aplicación remota requiere autorización y respaldo.
-- Sin nuevo ledger: lecturas de las fuentes operativas y financieras existentes.
begin;
create index if not exists workshop_events_phase_time on public.workshop_events(created_at,unit_id)
  where after_data ? 'workshop_phase';

-- El candado debe pertenecer al sincronizador de stock, no depender del orden
-- alfabético del trigger de colores. La propuesta histórica en espera se conserva.
create or replace function public.erp_sync_product_stock(p_product_id uuid)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_stock integer;
begin
  perform 1 from public.products where id=p_product_id for update;
  select count(*)::integer into v_stock from public.product_units where product_id=p_product_id and status='available';
  update public.products set stock=v_stock,erp_stock_synced_at=now() where id=p_product_id and erp_stock_enabled=true;
  return v_stock;
end $$;
revoke all on function public.erp_sync_product_stock(uuid) from public;
grant execute on function public.erp_sync_product_stock(uuid) to authenticated;

-- Conservar el reporte original y su criterio de valoración. Una pieza instalada
-- mantiene su estado físico; al vender/retirar el padre ya no es inventario propio.
-- Ajustamos únicamente esa lectura, sin alterar ningún costo ni movimiento.
do $$ begin
 if to_regprocedure('public.erp_business_report_pre_workshop(date,date)') is null then
  alter function public.erp_business_report(date,date) rename to erp_business_report_pre_workshop;
 end if;
end $$;
revoke all on function public.erp_business_report_pre_workshop(date,date) from public,anon,authenticated;
create or replace function public.erp_business_report(p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare report jsonb; excluded_cost bigint;
begin
 perform public.erp_assert_permission('reports.view');
 report:=public.erp_business_report_pre_workshop(p_from,p_to);
 select coalesce(sum(coalesce(c.acquisition_cost_cop,0)),0) into excluded_cost
 from public.product_units c join public.product_units parent on parent.id=c.installed_in_unit_id
 where c.status not in('sold','retired') and parent.status in('sold','retired');
 return report||jsonb_build_object('inventoryAcquisitionValueCop',(report->>'inventoryAcquisitionValueCop')::bigint-excluded_cost);
end $$;
revoke all on function public.erp_business_report(date,date) from public,anon;
grant execute on function public.erp_business_report(date,date) to authenticated;

create or replace function public.erp_operational_report(p_from date,p_to date,p_stalled_days integer default 3)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_start timestamptz;v_end timestamptz;v_result jsonb;
begin
  perform public.erp_assert_permission('reports.view');
  if p_from is null or p_to is null or p_from>p_to or p_to-p_from>366 or p_stalled_days not between 1 and 365 then raise exception 'invalid_report_range'; end if;
  v_start:=p_from::timestamp at time zone 'America/Bogota';
  v_end:=(p_to+1)::timestamp at time zone 'America/Bogota';
  with phase_entries as (
    select unit_id,after_data->>'workshop_phase' phase,created_at,id
    from public.workshop_events
    where after_data->>'workshop_phase' is not null and
      (event_type='receipt' or before_data->>'workshop_phase' is distinct from after_data->>'workshop_phase')
  ), spans as (
    select *,lead(created_at,1,now()) over(partition by unit_id order by created_at,id) until from phase_entries
  ), durations as (
    select phase,round(sum(extract(epoch from least(until,v_end)-greatest(created_at,v_start)))/3600,2) hours
    from spans where created_at<v_end and until>v_start group by phase
  ), current_units as (
    select u.*,coalesce((select max(e.created_at) from phase_entries e where e.unit_id=u.id),u.created_at) phase_since
    from public.product_units u where workshop_managed and asset_kind='computer' and status not in('sold','retired')
  )
  select jsonb_build_object(
    'phaseLocations',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select coalesce(workshop_phase,'unknown') phase,coalesce(l.code,'Sin ubicación') location,count(*) units
      from current_units u left join public.workshop_locations l on l.id=u.location_id group by 1,2 order by 1,2
    ) x),'[]'::jsonb),
    'phaseHours',coalesce((select jsonb_agg(to_jsonb(d)) from durations d),'[]'::jsonb),
    'stalledCount',(select count(*) from current_units where workshop_phase not in('ready','warehouse') and phase_since<now()-make_interval(days=>p_stalled_days)),
    'stalled',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id,unit_code,workshop_phase phase,phase_since from current_units
      where workshop_phase not in('ready','warehouse') and phase_since<now()-make_interval(days=>p_stalled_days)
      order by phase_since limit 100
    ) x),'[]'::jsonb),
    'lotChecks',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select coalesce(p.purchase_number,'Sin lote asociado') lot,count(distinct c.unit_id) units,count(*) failed_checks
      from public.workshop_checks c join public.product_units u on u.id=c.unit_id left join public.purchases p on p.id=u.purchase_id
      where c.result='failed' and c.created_at>=v_start and c.created_at<v_end
        and c.note is distinct from 'Pendiente de repetir después de cambio de componentes'
      group by 1 order by 1
    ) x),'[]'::jsonb),
    'components',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select c.asset_kind kind,count(*) filter(where e.after_data->>'direction'='install') installations,
        count(*) filter(where e.after_data->>'direction'='remove') removals
      from public.workshop_events e join public.product_units c on c.id=(e.after_data->>'componentId')::uuid
      where e.event_type='component_move' and e.created_at>=v_start and e.created_at<v_end group by c.asset_kind
    ) x),'[]'::jsonb),
    'preparationCostCop',(select coalesce(sum(c.amount_cop),0)::text from public.cost_entries c join public.product_units u on u.id=c.product_unit_id
      where u.workshop_managed and c.created_at>=v_start and c.created_at<v_end),
    'finishSales',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select f.id,f.name,count(*) units,sum(si.subtotal_cop)::text gross_cop
      from public.sale_items si join public.sales s on s.id=si.sale_id join public.product_units u on u.id=si.product_unit_id
      join public.product_finishes f on f.id=u.finish_id where s.created_at>=v_start and s.created_at<v_end group by f.id,f.name
    ) x),'[]'::jsonb),
    'shipping',public.erp_shipping_command('metrics','{}'::jsonb,gen_random_uuid())
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.erp_operational_report(date,date,integer) from public,anon;
grant execute on function public.erp_operational_report(date,date,integer) to authenticated;
-- Desactivar: dejar de mostrar el panel nuevo; no borrar eventos ni fuentes.
-- Reversión lógica: DROP FUNCTION erp_operational_report(date,date,integer).
-- No se recomienda retirar la serialización del stock: reintroduce la carrera.
commit;
