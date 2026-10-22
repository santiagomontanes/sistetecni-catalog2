-- ─────────────────────────────────────────────────────────────────────────────
-- ARREGLO DE CONCURRENCIA EN EL STOCK PUBLICADO (hallazgo de P20.29)
--
-- NO APLICAR SIN DECISIÓN EXPRESA: toca `erp_sync_product_stock`, que es
-- inventario central (Fase 1D). Se deja escrita, probada y lista.
--
-- ── EL DEFECTO (medido, no supuesto) ────────────────────────────────────────
-- Dos transacciones que venden una unidad cada una del MISMO producto, a la
-- vez, dejan el stock publicado en 1 cuando ya no queda ninguna disponible:
--
--   T1: begin; update product_units set status='sold' where unit_code='U1';
--   T2: begin; update product_units set status='sold' where unit_code='U2';
--   T1: commit;  T2: commit;
--   → products.stock = 1 ; unidades 'available' = 0
--
-- Cada trigger cuenta con su propia instantánea, anterior al commit de la
-- otra, así que ambas ven "queda una". La última en escribir gana y publica
-- una unidad que no existe: el bot la ofrece y el cliente la pide.
--
-- Reproducido dos veces en un Postgres aislado con filas y transacciones
-- reales. En producción quedaba tapado por accidente: el trigger de color de
-- P20.29 (`product_units_sync_colors`) ordena alfabéticamente ANTES que
-- `product_units_sync_web_stock` y su bloqueo serializaba toda la cadena.
-- Esa protección es involuntaria y frágil — basta renombrar el trigger de
-- color para que el defecto del stock vuelva. Por eso se arregla aquí, en su
-- propia función, en vez de depender del orden de los nombres.
--
-- ── EL ARREGLO ──────────────────────────────────────────────────────────────
-- Una línea: tomar el candado de la fila del producto antes de contar. En
-- READ COMMITTED cada sentencia toma una instantánea nueva, así que la
-- segunda transacción —al despertar del candado— cuenta ya con la venta de la
-- primera confirmada. Serializa por producto, no por tabla: dos productos
-- distintos siguen vendiéndose en paralelo.
--
-- No cambia la firma, ni el valor devuelto, ni `erp_stock_enabled`, ni
-- `erp_stock_synced_at`. No toca datos: ninguna fila se reescribe al aplicarla.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.erp_sync_product_stock(p_product_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_stock integer;
begin
  -- EL ARREGLO (única línea nueva frente a la Fase 1D). Sin esto, dos ventas
  -- simultáneas del mismo producto publican stock fantasma.
  perform 1 from public.products where id = p_product_id for update;

  select count(*)::integer into v_stock
  from public.product_units u
  where u.product_id = p_product_id
    and u.status = 'available';

  update public.products p
  set stock = v_stock,
      erp_stock_synced_at = now()
  where p.id = p_product_id
    and p.erp_stock_enabled = true;

  return v_stock;
end;
$$;

-- `create or replace` conserva los permisos y el comentario de la Fase 1D.
-- Se reafirman por si la función se recreara desde cero en otro entorno.
revoke all on function public.erp_sync_product_stock(uuid) from public;
grant execute on function public.erp_sync_product_stock(uuid) to authenticated;
