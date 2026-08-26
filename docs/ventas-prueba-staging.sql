-- Pruebas de escritura CONTROLADAS para el módulo de ventas/comprobantes,
-- SOLO PARA STAGING, SOLO MANUAL — nadie ejecuta este archivo automático
-- (no hay ningún script/CI que lo invoque).
--
-- Requisitos antes de correr esto:
--   1. Haber aplicado supabase/migrations/20260826000000_ventas_comprobantes.sql
--      en el proyecto de STAGING (gwvjubkjdkpadetypzrj / "SISTETECNI-staging").
--   2. Confirmar que estás conectado a STAGING (ver docs/ventas-verificacion-
--      staging.sql y la Fase 5 del informe — nunca correr esto si hay
--      cualquier duda sobre el proyecto activo).
--   3. Ejecutado por el SQL Editor de Supabase (rol postgres) o con
--      `supabase db execute`: corre con privilegios de superusuario,
--      así que RLS NO bloquea nada aquí — este script prueba la mecánica
--      de la base de datos (numeración, constraints), NO las policies de
--      RLS. Para probar RLS end-to-end usa la app real (login admin vs.
--      no-admin) — ver Fase 4/5 del informe.
--
-- Marcador de limpieza: TODA fila que este script crea lleva el texto
-- literal "[TEST_VENTAS_STAGING]" en customer_name — así se identifica
-- sin ambigüedad y se puede borrar por completo con el bloque de
-- LIMPIEZA al final, sin arriesgar ningún dato real de un cliente.
--
-- Corre cada sección por separado y revisa el resultado antes de seguir
-- a la siguiente. No es un script "todo o nada".

-- ============================================================================
-- SECCIÓN 1 — numeración: dos ventas secuenciales deben quedar consecutivas
-- ============================================================================
-- Ejecuta este bloque completo. Debe insertar 2 filas y devolver sus
-- sale_number — deben ser consecutivos (ej. SV-2026-000001 y
-- SV-2026-000002; el número exacto depende de cuántas ventas reales ya
-- existan en staging, lo importante es que NO se repitan y que el
-- segundo sea el primero + 1).

insert into public.sales (
  customer_name, customer_document, customer_phone,
  subtotal_cop, discount_cop, total_cop,
  payment_method, payment_status, warranty_months
) values (
  '[TEST_VENTAS_STAGING] Cliente Uno', '000000001', '3000000001',
  100000, 0, 100000, 'efectivo', 'pagado', 6
) returning id, sale_number;

insert into public.sales (
  customer_name, customer_document, customer_phone,
  subtotal_cop, discount_cop, total_cop,
  payment_method, payment_status, warranty_months
) values (
  '[TEST_VENTAS_STAGING] Cliente Dos', '000000002', '3000000002',
  200000, 0, 200000, 'efectivo', 'pagado', 6
) returning id, sale_number;

-- ============================================================================
-- SECCIÓN 2 (OPCIONAL, AVANZADA) — concurrencia real con dos transacciones
-- ============================================================================
-- Para observar el bloqueo (no solo confiar en la teoría): abre DOS
-- pestañas del SQL Editor.
--
-- Pestaña A:
--   begin;
--   insert into public.sales (customer_name, customer_document, customer_phone,
--     subtotal_cop, discount_cop, total_cop, payment_method, payment_status, warranty_months)
--   values ('[TEST_VENTAS_STAGING] Concurrencia A', '000000003', '3000000003',
--     50000, 0, 50000, 'efectivo', 'pagado', 6)
--   returning sale_number;
--   -- NO ejecutes commit todavía.
--
-- Pestaña B (mientras A sigue abierta sin commit):
--   insert into public.sales (customer_name, customer_document, customer_phone,
--     subtotal_cop, discount_cop, total_cop, payment_method, payment_status, warranty_months)
--   values ('[TEST_VENTAS_STAGING] Concurrencia B', '000000004', '3000000004',
--     60000, 0, 60000, 'efectivo', 'pagado', 6)
--   returning sale_number;
--   -- Debe quedarse ESPERANDO (colgado) — esa espera es la prueba de que
--   -- el lock funciona. NO es un error ni un cuelgue real de la base.
--
-- Vuelve a la pestaña A y ejecuta:
--   commit;
--
-- La pestaña B debe completarse inmediatamente después, con el número
-- SIGUIENTE al de A (nunca el mismo). Si B hubiera devuelto el mismo
-- número que A, sería una colisión real — repórtalo, no debería poder
-- pasar con este mecanismo.

-- ============================================================================
-- SECCIÓN 3 — snapshot con ítems (uno catálogo si hay productos, uno manual)
-- ============================================================================
-- Usa el id de la venta "Cliente Uno" de la Sección 1 (reemplaza el uuid
-- de ejemplo por el que te devolvió el returning, o usa esta subconsulta
-- que la busca por el marcador).

with venta as (
  select id from public.sales
  where customer_name = '[TEST_VENTAS_STAGING] Cliente Uno'
  limit 1
)
insert into public.sale_items (
  sale_id, item_type, product_id, product_name, unit_price_cop, quantity, subtotal_cop, sort_order
)
select venta.id, 'manual', null, '[TEST_VENTAS_STAGING] Mouse inalámbrico', 35000, 1, 35000, 0
from venta
returning id, sale_id, item_type, subtotal_cop;

-- Ítem de catálogo — SOLO si existe al menos un producto real en staging
-- (no crea ni modifica ningún producto, solo lo referencia):
with venta as (
  select id from public.sales
  where customer_name = '[TEST_VENTAS_STAGING] Cliente Uno'
  limit 1
),
producto as (
  select id, title, price from public.products limit 1
)
insert into public.sale_items (
  sale_id, item_type, product_id, product_name, original_unit_price_cop, unit_price_cop, quantity, subtotal_cop, sort_order
)
select venta.id, 'catalog', producto.id,
       '[TEST_VENTAS_STAGING] ' || producto.title,
       producto.price::bigint, producto.price::bigint, 1, producto.price::bigint, 1
from venta, producto
returning id, sale_id, item_type, product_id, subtotal_cop;

-- ============================================================================
-- SECCIÓN 4 — constraints deben RECHAZAR datos inválidos (se espera ERROR)
-- ============================================================================
-- Cada INSERT de aquí DEBE fallar con un error de constraint — si alguno
-- llegara a insertarse, es un hallazgo real que hay que corregir.

-- 4a. cantidad 0 -> debe fallar (sale_items_quantity_positive)
-- insert into public.sale_items (sale_id, item_type, product_id, product_name, unit_price_cop, quantity, subtotal_cop)
-- select id, 'manual', null, '[TEST_VENTAS_STAGING] cantidad invalida', 10000, 0, 0
-- from public.sales where customer_name = '[TEST_VENTAS_STAGING] Cliente Uno' limit 1;

-- 4b. total que no cuadra con subtotal-descuento -> debe fallar (sales_total_matches)
-- insert into public.sales (customer_name, customer_document, customer_phone, subtotal_cop, discount_cop, total_cop, payment_method, payment_status, warranty_months)
-- values ('[TEST_VENTAS_STAGING] total invalido', '000000005', '3000000005', 100000, 0, 999, 'efectivo', 'pagado', 6);

-- 4c. método de pago fuera de la lista -> debe fallar (sales_payment_method_check)
-- insert into public.sales (customer_name, customer_document, customer_phone, subtotal_cop, discount_cop, total_cop, payment_method, payment_status, warranty_months)
-- values ('[TEST_VENTAS_STAGING] metodo invalido', '000000006', '3000000006', 100000, 0, 100000, 'bitcoin', 'pagado', 6);

-- 4d. sale_number con formato manual inválido -> debe fallar (sales_sale_number_format)
-- insert into public.sales (sale_number, customer_name, customer_document, customer_phone, subtotal_cop, discount_cop, total_cop, payment_method, payment_status, warranty_months)
-- values ('FACTURA-0001', '[TEST_VENTAS_STAGING] numero invalido', '000000007', '3000000007', 100000, 0, 100000, 'efectivo', 'pagado', 6);

-- (Los 4 casos anteriores están comentados a propósito — descoméntalos
-- UNO A LA VEZ para confirmar que cada uno efectivamente falla, en vez
-- de correr los 4 de un tirón.)

-- ============================================================================
-- LIMPIEZA — borra ÚNICAMENTE lo creado por este script
-- ============================================================================
-- sale_items se borra solo por el ON DELETE CASCADE de sale_id al borrar
-- la venta — no hace falta un DELETE aparte para ellos, PERO el ítem
-- "catalog" de la Sección 3 no toca products en absoluto (solo lo
-- referenció), así que no hay nada que limpiar ahí tampoco.

delete from public.sales
where customer_name like '[TEST_VENTAS_STAGING]%';

-- Verifica que quedó en 0:
select count(*) as ventas_de_prueba_restantes
from public.sales
where customer_name like '[TEST_VENTAS_STAGING]%';

-- También puedes confirmar la limpieza completa con
-- docs/ventas-verificacion-staging.sql — el campo
-- "ventas_de_prueba_sin_limpiar" debe volver a [] (vacío).
