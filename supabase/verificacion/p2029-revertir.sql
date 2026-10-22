-- P20.29 — reversión. Solo si hace falta deshacer el color en la base.
--
-- Quita lo que P20.29 AÑADIÓ y nada más. El resto de `erp_agent_dispatch`
-- vuelve a su definición previa restaurando el respaldo
-- `~/respaldos-p2029/dispatch-prod-<fecha>.sql`, que es la definición EXACTA
-- que tenía producción antes.
--
-- Nota: no hace falta revertir para que el código viejo funcione. La
-- migración es ADITIVA: si el agente vuelve a una versión anterior, nadie
-- lee `color` ni `colores_disponibles` y las columnas quedan inertes.

drop trigger if exists products_sync_colors on public.products;
drop trigger if exists product_units_sync_colors on public.product_units;
drop function if exists public.erp_sync_colors_from_product_change();
drop function if exists public.erp_sync_colors_from_unit_change();
drop function if exists public.erp_sync_product_colors(uuid);
drop function if exists public.erp_unit_color(uuid);

-- Las columnas se dejan por defecto: borrarlas destruye el color que el
-- administrador haya escrito ya. Descomenta solo si de verdad quieres perderlo.
-- alter table public.products drop column if exists colores_disponibles;
-- alter table public.products drop column if exists color;

delete from supabase_migrations.schema_migrations
 where version in ('20261021200000','20261021220000');
