-- SISTETECNI ERP — corrección Fase 2A
-- Evita que el dashboard de Caja dependa de dos SELECT directos sujetos a RLS.
-- La autorización se comprueba dentro del RPC y se devuelve un snapshot JSON.

create or replace function public.erp_get_cash_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sessions jsonb;
  v_movements jsonb;
begin
  perform public.erp_assert_permission('cash.read');

  select coalesce(jsonb_agg(to_jsonb(s) order by s.opened_at desc), '[]'::jsonb)
  into v_sessions
  from (
    select
      cs.id,
      cs.session_number,
      cs.status,
      cs.opening_cash_cop,
      cs.expected_cash_cop,
      cs.counted_cash_cop,
      cs.difference_cop,
      cs.opened_at,
      cs.closed_at
    from public.cash_sessions cs
    order by cs.opened_at desc
    limit 30
  ) s;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc), '[]'::jsonb)
  into v_movements
  from (
    select
      cm.id,
      cm.movement_number,
      cm.session_id,
      cm.movement_type,
      cm.payment_method,
      cm.amount_cop,
      cm.description,
      cm.created_at,
      cm.reversal_of_id
    from public.cash_movements cm
    order by cm.created_at desc
    limit 100
  ) m;

  return jsonb_build_object(
    'sessions', v_sessions,
    'movements', v_movements
  );
end;
$$;

revoke all on function public.erp_get_cash_dashboard() from public, anon;
grant execute on function public.erp_get_cash_dashboard() to authenticated;

comment on function public.erp_get_cash_dashboard() is
  'Fase 2A: snapshot de caja autorizado por cash.read. Evita múltiples SELECT cliente bajo RLS y devuelve máximo 30 sesiones + 100 movimientos.';
