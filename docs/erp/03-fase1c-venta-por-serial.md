# ERP Sistetecni — Fase 1C: venta transaccional por serial

## Objetivo

Convertir una venta de computador en una operación ligada a la máquina física exacta entregada.

Flujo:

`customer snapshot / customer_id opcional -> product -> product_unit available -> sale -> sale_item -> product_unit sold -> inventory_movement sale -> audit_events`

## Reglas de negocio

1. Un computador de catálogo no puede venderse sin `productUnitId`.
2. Cada unidad física de catálogo se vende con `quantity=1`.
3. Solo `product_units.status='available'` es vendible.
4. `received`, `inspection`, `reserved`, `sold`, `warranty`, `repair`, `returned` y `retired` no se consumen directamente por la venta.
5. En esta fase el panel permite `received/inspection -> available` mediante RPC atómico.
6. La venta física completa ocurre en `erp_create_sale_with_units()` dentro de una sola transacción PostgreSQL.
7. Las unidades se bloquean con `FOR UPDATE` en orden por UUID. Dos ventas concurrentes no pueden consumir la misma unidad.
8. Al vender se fija `status='sold'` y `sold_at=now()`.
9. Se escribe `inventory_movements.movement_type='sale'` con referencia a `sales.id`.
10. Se escriben `audit_events` para `inventory.sell` y `sale.create`.
11. `sale_items` conserva snapshots de `unit_code`, serial y `spec_overrides`.
12. `sales.customer_id` enlaza opcionalmente al cliente canónico; `customer_*` sigue siendo snapshot histórico.
13. Idempotencia: la clave de la venta se serializa con advisory lock; un reintento de la misma operación devuelve la venta existente.
14. Defensa adicional: índice UNIQUE parcial sobre `sale_items.product_unit_id`.
15. `products.stock` NO se modifica todavía.

## Migración

`supabase/migrations/20260828130000_erp_fase1c_sale_by_unit.sql`

Agrega:

- `sales.customer_id`
- `sale_items.product_unit_id`
- `sale_items.unit_code_snapshot`
- `sale_items.serial_number_snapshot`
- `sale_items.unit_spec_overrides_snapshot`
- `erp_mark_unit_available(uuid)`
- `erp_create_sale_with_units(...)`

## Panel

### Inventario

Las tarjetas `received` o `inspection` muestran **Marcar disponible para venta**. La acción registra movimiento y auditoría; no es un UPDATE directo desde React.

### Nueva venta

1. Buscar producto.
2. Elegir modelo.
3. El panel consulta únicamente unidades `available` de ese producto.
4. Elegir `STU-* / serial`.
5. El ítem queda fijado a esa unidad; la cantidad del computador se bloquea en 1.
6. Al confirmar, PostgreSQL vuelve a verificar que la unidad siga disponible.

Si otro vendedor la consumió entre selección y confirmación, la venta falla con mensaje de disponibilidad y no deja venta parcial.

### Detalle / PDF

El detalle muestra `STU-*` y serial congelados. El PDF agrega el mismo dato a la descripción usando el snapshot; no consulta `product_units` al descargar.

## Despliegue seguro en STAGING

1. `git pull --ff-only origin erp/fase0-core`
2. `npm run env:staging`
3. `npm run test:all`
4. `npm run build`
5. Cargar `SUPABASE_DB_PASSWORD` de STAGING.
6. `supabase migration list`
7. `supabase db push --dry-run`
8. Verificar que la única nueva migración pendiente sea `20260828130000`.
9. `supabase db push`
10. `unset SUPABASE_DB_PASSWORD`
11. Repetir `npm run test:all` y `npm run build`.
12. Prueba visual/manual de venta.

## Prueba manual mínima

1. Recibir una unidad de un producto `[SEED]` con serial único.
2. Desde Inventario marcarla Disponible.
3. Crear venta y seleccionar esa unidad.
4. Confirmar venta.
5. Verificar detalle y PDF con STU/serial.
6. Verificar en Inventario que quedó Vendido.
7. Intentar agregar/vender nuevamente esa misma unidad: ya no debe aparecer como disponible.
8. Verificar SQL con `docs/erp/fase1c-verificacion-staging.sql`.

## Fuera de alcance de 1C

- sincronizar `products.stock` desde unidades;
- reservas por cliente;
- devoluciones/garantías completas;
- tools administrativas de WhatsApp;
- permitir vender unidades `reserved` (requiere dueño de la reserva);
- alterar ventas históricas.
