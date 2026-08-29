-- Fase 2D: Caja puede leer compras para registrar pagos a proveedor, sin permiso de crearlas/modificarlas.
create or replace function public.erp_role_has_permission(p_role text,p_permission text)
returns boolean language sql immutable set search_path=public,pg_temp as $$
  select case
    when p_role='admin' then true
    when p_role='supervisor' then p_permission = any(array[
      'customers.manage','inventory.read','inventory.manage','inventory.reserve','sales.read','sales.manage',
      'warranties.open','warranties.manage','purchases.read','purchases.manage','cash.read','cash.manage',
      'expenses.read','expenses.manage','reports.view','profitability.view','quotes.manage'])
    when p_role='vendedor' then p_permission = any(array['customers.manage','inventory.read','inventory.reserve','sales.read','sales.manage','warranties.open','quotes.manage'])
    when p_role='tecnico' then p_permission = any(array['inventory.read','inventory.manage','warranties.open','warranties.manage'])
    when p_role='caja' then p_permission = any(array['sales.read','purchases.read','cash.read','cash.manage','expenses.read','expenses.manage'])
    when p_role='bodega' then p_permission = any(array['inventory.read','inventory.manage','inventory.reserve','purchases.read','purchases.manage'])
    else false end;
$$;
