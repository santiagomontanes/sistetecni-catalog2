-- Marcar una venta pendiente como pagada y registrar el ingreso en caja una sola vez.
-- Las ventas de un envío contraentrega siguen cerrándose con la consignación (Envíos → Recaudos).
-- Aditiva. Rollback: drop function public.erp_sale_mark_paid(uuid,text,text).
create or replace function public.erp_sale_mark_paid(p_sale_id uuid, p_payment_method text, p_reference text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid(); s public.sales%rowtype; v_number text; v_reference text:=nullif(btrim(p_reference),''); v_movement uuid;
begin
  perform public.erp_assert_permission('cash.manage');
  if p_payment_method is null or p_payment_method not in ('efectivo','transferencia','nequi','daviplata','tarjeta','otro') then raise exception 'sale_invalid_payment_method'; end if;
  if v_reference is not null and length(v_reference)>160 then raise exception 'sale_reference_too_long'; end if;
  select * into s from public.sales where id=p_sale_id for update;
  if not found then raise exception 'sale_not_found'; end if;
  if s.payment_status='pagado' then
    return jsonb_build_object('saleId',s.id,'saleNumber',s.sale_number,'paymentStatus','pagado','alreadyPaid',true);
  end if;
  if s.payment_status<>'pendiente' then raise exception 'sale_mark_paid_only_pending'; end if;
  if exists(select 1 from public.erp_shipments where sale_id=s.id and payment_mode='cod' and status<>'cancelled') then raise exception 'sale_collection_managed_by_shipping'; end if;
  if exists(select 1 from public.cash_movements where sale_id=s.id and movement_type='sale') then raise exception 'sale_cash_already_recorded'; end if;
  update public.sales set payment_status='pagado', payment_method=p_payment_method where id=s.id;
  if s.total_cop>0 then
    v_number:='MOV-'||lpad(nextval('public.cash_movement_number_seq')::text,6,'0');
    insert into public.cash_movements(movement_number,session_id,movement_type,payment_method,amount_cop,description,sale_id,created_by,metadata)
      values(v_number,public.erp_current_cash_session_id(),'sale',p_payment_method,s.total_cop,'Cobro de la venta '||s.sale_number,s.id,v_actor,
             jsonb_build_object('saleNumber',s.sale_number,'markedPaid',true,'reference',v_reference))
      returning id into v_movement;
  end if;
  insert into public.audit_events(actor_type,actor_ref,channel,operation,entity_type,entity_id,metadata)
    values('web_admin',v_actor::text,'api','sale.mark_paid','sale',s.id,jsonb_build_object('previous',s.payment_status,'paymentMethod',p_payment_method,'reference',v_reference,'cashMovementId',v_movement));
  return jsonb_build_object('saleId',s.id,'saleNumber',s.sale_number,'paymentStatus','pagado','alreadyPaid',false,'cashMovementId',v_movement);
end;$$;
revoke all on function public.erp_sale_mark_paid(uuid,text,text) from public,anon;
grant execute on function public.erp_sale_mark_paid(uuid,text,text) to authenticated;
notify pgrst, 'reload schema';
