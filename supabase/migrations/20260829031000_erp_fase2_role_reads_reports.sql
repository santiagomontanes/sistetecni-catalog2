-- SISTETECNI ERP — Fase 2C + soporte 2D
-- Políticas de lectura por rol. Las mutaciones continúan vía RPCs controlados.

-- Grants ya existen en la mayoría de tablas ERP; se reafirman solo SELECT.
grant select on public.customers,public.product_units,public.inventory_movements,public.audit_events to authenticated;
grant select on public.sales,public.sale_items to authenticated;
grant select on public.after_sales_cases,public.after_sales_case_events to authenticated;
grant select on public.suppliers,public.purchases,public.purchase_items to authenticated;
grant select on public.cost_entries to authenticated;

create policy "phase2 customers role read" on public.customers for select to authenticated
  using(public.erp_has_permission('customers.manage') or public.erp_has_permission('reports.view'));
create policy "phase2 units role read" on public.product_units for select to authenticated
  using(public.erp_has_permission('inventory.read') or public.erp_has_permission('reports.view') or public.erp_has_permission('profitability.view'));
create policy "phase2 movements role read" on public.inventory_movements for select to authenticated
  using(public.erp_has_permission('inventory.read') or public.erp_has_permission('reports.view'));
create policy "phase2 audit report read" on public.audit_events for select to authenticated
  using(public.erp_has_permission('reports.view'));
create policy "phase2 sales role read" on public.sales for select to authenticated
  using(public.erp_has_permission('sales.read') or public.erp_has_permission('warranties.open') or public.erp_has_permission('reports.view') or public.erp_has_permission('profitability.view'));
create policy "phase2 sale items role read" on public.sale_items for select to authenticated
  using(public.erp_has_permission('sales.read') or public.erp_has_permission('warranties.open') or public.erp_has_permission('reports.view') or public.erp_has_permission('profitability.view'));
create policy "phase2 cases role read" on public.after_sales_cases for select to authenticated
  using(public.erp_has_permission('warranties.open') or public.erp_has_permission('warranties.manage') or public.erp_has_permission('reports.view'));
create policy "phase2 case events role read" on public.after_sales_case_events for select to authenticated
  using(public.erp_has_permission('warranties.open') or public.erp_has_permission('warranties.manage') or public.erp_has_permission('reports.view'));
create policy "phase2 suppliers role read" on public.suppliers for select to authenticated
  using(public.erp_has_permission('purchases.read') or public.erp_has_permission('reports.view'));
create policy "phase2 purchases role read" on public.purchases for select to authenticated
  using(public.erp_has_permission('purchases.read') or public.erp_has_permission('reports.view') or public.erp_has_permission('profitability.view'));
create policy "phase2 purchase items role read" on public.purchase_items for select to authenticated
  using(public.erp_has_permission('purchases.read') or public.erp_has_permission('reports.view') or public.erp_has_permission('profitability.view'));
create policy "phase2 costs profitability read" on public.cost_entries for select to authenticated
  using(public.erp_has_permission('profitability.view') or public.erp_has_permission('reports.view'));

-- Resumen de negocio. SECURITY DEFINER para agregar sin exponer tablas fuera de
-- las políticas; la función exige reports.view y devuelve únicamente agregados.
create or replace function public.erp_business_report(p_from date,p_to date)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_from date:=coalesce(p_from,current_date-interval '30 days');
  v_to date:=coalesce(p_to,current_date);
  v_start timestamptz;
  v_end timestamptz;
  v_sales_count bigint;
  v_sales_revenue bigint;
  v_units_sold bigint;
  v_expenses bigint;
  v_purchases bigint;
  v_purchase_count bigint;
  v_cash_in bigint;
  v_cash_out bigint;
  v_open_cases bigint;
  v_inventory_value bigint;
  v_acquisition_sold bigint;
  v_extra_costs bigint;
  v_known_profit bigint;
  v_inventory jsonb;
  v_methods jsonb;
begin
  perform public.erp_assert_permission('reports.view');
  if v_from>v_to then raise exception 'invalid_report_range'; end if;
  if (v_to-v_from)>366 then raise exception 'report_range_too_large'; end if;
  v_start:=v_from::timestamp at time zone 'America/Bogota';
  v_end:=(v_to+1)::timestamp at time zone 'America/Bogota';

  select count(*),coalesce(sum(total_cop),0) into v_sales_count,v_sales_revenue
  from public.sales where created_at>=v_start and created_at<v_end;
  select count(*) into v_units_sold from public.sale_items si join public.sales s on s.id=si.sale_id
  where si.product_unit_id is not null and s.created_at>=v_start and s.created_at<v_end;
  select coalesce(sum(amount_cop),0) into v_expenses from public.operating_expenses
  where status='active' and occurred_on between v_from and v_to;
  select count(*),coalesce(sum(total_cost_cop),0) into v_purchase_count,v_purchases from public.purchases
  where purchase_date between v_from and v_to;
  select coalesce(sum(case when amount_cop>0 then amount_cop else 0 end),0),
         coalesce(sum(case when amount_cop<0 then -amount_cop else 0 end),0)
    into v_cash_in,v_cash_out from public.cash_movements where created_at>=v_start and created_at<v_end;
  select count(*) into v_open_cases from public.after_sales_cases where status not in ('closed','cancelled');
  select coalesce(sum(coalesce(acquisition_cost_cop,0)),0) into v_inventory_value
    from public.product_units where status not in ('sold','retired');

  select coalesce(sum(coalesce(u.acquisition_cost_cop,0)),0) into v_acquisition_sold
  from public.sale_items si join public.sales s on s.id=si.sale_id
  join public.product_units u on u.id=si.product_unit_id
  where s.created_at>=v_start and s.created_at<v_end;

  select coalesce(sum(c.amount_cop),0) into v_extra_costs
  from public.cost_entries c
  where (c.sale_id in (select id from public.sales where created_at>=v_start and created_at<v_end))
     or (c.product_unit_id in (
       select si.product_unit_id from public.sale_items si join public.sales s on s.id=si.sale_id
       where si.product_unit_id is not null and s.created_at>=v_start and s.created_at<v_end
     ));
  v_known_profit:=v_sales_revenue-v_acquisition_sold-v_extra_costs-v_expenses;

  select coalesce(jsonb_object_agg(status,cnt),'{}'::jsonb) into v_inventory
  from (select status,count(*) cnt from public.product_units group by status) x;
  select coalesce(jsonb_object_agg(payment_method,total),'{}'::jsonb) into v_methods
  from (select payment_method,sum(total_cop)::bigint total from public.sales
        where created_at>=v_start and created_at<v_end group by payment_method) x;

  return jsonb_build_object(
    'from',v_from,'to',v_to,'salesCount',v_sales_count,'salesRevenueCop',v_sales_revenue,
    'unitsSold',v_units_sold,'operatingExpensesCop',v_expenses,'purchaseCount',v_purchase_count,
    'purchasesCop',v_purchases,'cashInCop',v_cash_in,'cashOutCop',v_cash_out,
    'openAfterSalesCases',v_open_cases,'inventoryAcquisitionValueCop',v_inventory_value,
    'soldAcquisitionCostCop',v_acquisition_sold,'extraCostsCop',v_extra_costs,
    'knownNetResultCop',v_known_profit,'inventoryByStatus',v_inventory,'salesByPaymentMethod',v_methods
  );
end;$$;
revoke all on function public.erp_business_report(date,date) from public,anon;
grant execute on function public.erp_business_report(date,date) to authenticated;
