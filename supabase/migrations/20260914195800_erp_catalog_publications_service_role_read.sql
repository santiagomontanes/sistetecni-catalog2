-- ============================================================================
-- P20.17C hotfix — lectura server-side de publicaciones de catálogo
-- ============================================================================
-- catalog-media y catalog-finalize usan el cliente server-side service_role
-- para verificar que draftId + productId correspondan a una publicación
-- realmente completada.
--
-- La tabla continúa cerrada para public, anon y authenticated.
-- service_role recibe SOLO SELECT. Las escrituras continúan exclusivamente
-- dentro de las funciones SECURITY DEFINER de P20.17C.
-- ============================================================================

grant select
on table public.erp_catalog_draft_publications
to service_role;

revoke insert, update, delete, truncate, references, trigger
on table public.erp_catalog_draft_publications
from service_role;

do $verify$
begin
  if not has_table_privilege(
    'service_role',
    'public.erp_catalog_draft_publications',
    'SELECT'
  ) then
    raise exception 'P20_17C_service_role_select_missing';
  end if;

  if has_table_privilege(
    'service_role',
    'public.erp_catalog_draft_publications',
    'INSERT'
  ) or has_table_privilege(
    'service_role',
    'public.erp_catalog_draft_publications',
    'UPDATE'
  ) or has_table_privilege(
    'service_role',
    'public.erp_catalog_draft_publications',
    'DELETE'
  ) then
    raise exception 'P20_17C_service_role_write_privilege_detected';
  end if;
end;
$verify$;
