-- Una unidad enviada a inspección puede volver a recepción (antes quedaba sin camino de regreso).
-- Solo agrega inspection -> received a la matriz; el resto de transiciones no cambia.
begin;
create or replace function public.erp_unit_transition_allowed(p_from text, p_to text)
returns boolean language sql immutable set search_path to 'public','pg_temp' as $$
  select
       (p_from = 'received'   and p_to in ('inspection','available','retired'))
    or (p_from = 'inspection' and p_to in ('received','available','repair','retired'))
    or (p_from = 'available'  and p_to in ('reserved','repair','retired'))
    or (p_from = 'reserved'   and p_to in ('available','repair','retired'))
    or (p_from = 'sold'       and p_to in ('warranty','returned'))
    or (p_from = 'warranty'   and p_to in ('repair','sold','retired'))
    or (p_from = 'repair'     and p_to in ('available','sold','retired'))
    or (p_from = 'returned'   and p_to in ('repair','retired'));
$$;
commit;
notify pgrst, 'reload schema';
