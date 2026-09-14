-- P20.17B
-- Hardening del contador transaccional STU.
--
-- El contador y su generador son infraestructura interna.
-- service_role debe operar mediante las RPC públicas SECURITY DEFINER,
-- no acceder directamente al contador ni consumir consecutivos.

revoke all
on table public.product_unit_number_counter
from public, anon, authenticated, service_role;

revoke all
on function public.erp_internal_next_product_unit_number()
from public, anon, authenticated, service_role;

grant execute
on function public.erp_internal_next_product_unit_number()
to postgres;


-- Guardas: el rol interno postgres conserva acceso,
-- service_role no debe poder tocar directamente ninguna de las dos piezas.
do $verification$
begin
  if has_table_privilege(
    'service_role',
    'public.product_unit_number_counter',
    'SELECT'
  )
  or has_table_privilege(
    'service_role',
    'public.product_unit_number_counter',
    'INSERT'
  )
  or has_table_privilege(
    'service_role',
    'public.product_unit_number_counter',
    'UPDATE'
  )
  or has_table_privilege(
    'service_role',
    'public.product_unit_number_counter',
    'DELETE'
  ) then
    raise exception
      'P20_17B_service_role_counter_table_privilege_still_present';
  end if;

  if has_function_privilege(
    'service_role',
    'public.erp_internal_next_product_unit_number()',
    'EXECUTE'
  ) then
    raise exception
      'P20_17B_service_role_internal_generator_execute_still_present';
  end if;

  if not has_function_privilege(
    'postgres',
    'public.erp_internal_next_product_unit_number()',
    'EXECUTE'
  ) then
    raise exception
      'P20_17B_postgres_internal_generator_execute_missing';
  end if;
end;
$verification$;


comment on function public.erp_internal_next_product_unit_number() is
  'Generador interno transaccional STU. Acceso directo restringido a postgres; usar únicamente mediante RPC ERP autorizada.';
