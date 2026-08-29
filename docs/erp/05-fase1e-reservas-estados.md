# SISTETECNI ERP — Fase 1E: reservas y estados operativos

## Objetivo

Fase 1E convierte `product_units.status` en un flujo operativo controlado. Ningún cambio relevante depende de editar la fila manualmente desde la UI: las transiciones pasan por `erp_transition_product_unit`, escriben un `inventory_movement`, generan `audit_event` y dejan que Fase 1D sincronice el stock cuando corresponde.

## Reserva

Una unidad `available` puede pasar a `reserved` con:

- nombre del cliente obligatorio;
- celular opcional;
- vencimiento opcional;
- nota opcional.

La reserva reduce el stock ERP porque una unidad `reserved` ya no cuenta como vendible pública. El vencimiento es informativo: 1E no libera reservas automáticamente. Una reserva vencida sigue bloqueada hasta que un administrador la libere o la venda.

Al liberar `reserved -> available`, la reserva vigente se limpia de `product_units`, pero su snapshot queda en `inventory_movements` y `audit_events`.

## Venta de una reserva

Nueva venta lista unidades `available` y `reserved`.

Una reservada puede pasar directamente `reserved -> sold` dentro de `erp_create_sale_with_units`. No existe una liberación previa en otra transacción.

Un trigger en `sale_items` verifica que el cliente de la venta coincida con la reserva:

1. si la reserva tiene celular utilizable, compara los dígitos del celular;
2. si no tiene celular, compara nombre normalizado.

Si no coincide, la transacción completa falla con `reservation_customer_mismatch`.

## Matriz operativa

```text
received   -> inspection | available | retired
inspection -> available | repair | retired
available  -> reserved | repair | retired
reserved   -> available | repair | retired
sold       -> warranty | returned
warranty   -> repair | sold | retired
repair     -> available | sold | retired
returned   -> repair | retired
retired    -> (terminal)
```

La matriz tiene dos reglas adicionales según `sold_at`:

- reparación preventa (`sold_at IS NULL`) puede volver a `available`, pero nunca a `sold`;
- reparación postventa (`sold_at IS NOT NULL`) puede volver a `sold` para representar devolución al dueño, pero nunca a `available`.

Esto se valida en Server Action, RPC y guard de tabla.

## Semántica de `sold`

`available -> sold` y `reserved -> sold` solo ocurren dentro de una venta real. El panel de Inventario no ofrece una transición genérica para crear una venta.

`warranty/repair -> sold` no crea otra venta: significa que un equipo ya vendido terminó servicio y fue devuelto a su dueño.

## Stock 1D

Fase 1E no añade una segunda fuente de stock. Sigue vigente:

```text
products.stock = COUNT(product_units WHERE status = 'available')
```

solo para productos con `erp_stock_enabled=true`.

Por tanto:

- `available -> reserved`: stock -1;
- `reserved -> available`: stock +1;
- `reserved -> sold`: stock no cambia (ya estaba fuera de available);
- `available -> repair`: stock -1;
- `repair preventa -> available`: stock +1;
- garantía/reparación postventa nunca suma stock.

## Auditoría

Las transiciones operativas escriben:

- `inventory_movements` con el tipo correspondiente (`reserve`, `release_reservation`, `repair_in`, `repair_out`, `warranty_in`, `warranty_out`, `return`, `retire`, etc.);
- `audit_events.operation = 'inventory.transition'`;
- la venta mantiene `inventory.sell` y `sale.create`.

Los datos de una reserva liberada o consumida se preservan en metadata histórica.

## Fuera de alcance de 1E

- liberación automática de reservas vencidas;
- reventa de una unidad ya vendida/devuelta;
- notas/tickets detallados de taller;
- costos de reparación;
- RMA/proveedor;
- notificaciones automáticas al cliente.
