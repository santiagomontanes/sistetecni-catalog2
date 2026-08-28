# Fase 1D — Stock comercial sincronizado con inventario físico

## Objetivo

Mantener `products.stock` como contrato estable para catálogo, personalizador y demás consumidores actuales, pero permitir que cada producto migre de forma controlada desde stock manual hacia stock derivado del inventario físico.

## Regla de negocio

Cuando `products.erp_stock_enabled = true`:

```text
products.stock = COUNT(product_units WHERE product_id = X AND status = 'available')
```

Solo `available` cuenta como vendible. No cuentan:

- `received`
- `inspection`
- `reserved`
- `sold`
- `warranty`
- `repair`
- `returned`
- `retired`

## Migración gradual

La migración agrega `erp_stock_enabled` con `DEFAULT false`. Por tanto, aplicarla no modifica el stock actual de ningún producto.

Desde `/admin/inventario`, cada producto que ya tenga unidades físicas registradas muestra:

- stock web actual;
- unidades físicas disponibles;
- unidades físicas totales;
- fuente de stock: Manual o ERP;
- acción explícita para activar/desactivar Stock ERP.

Al activar ERP, se muestra confirmación indicando el cambio exacto, por ejemplo `3 -> 1`. La activación recalcula inmediatamente el stock.

Al desactivar ERP, se conserva el último stock sincronizado como punto de partida y desde ese momento vuelve a ser manual.

## Garantías técnicas

### Sincronización transaccional

Un trigger `AFTER` sobre `product_units` recalcula `products.stock` cuando cambia `status` o `product_id`. Por ello:

- `received -> available`: incrementa el stock;
- `available -> sold`: decrementa el stock dentro de la misma transacción de la venta Fase 1C;
- futuras reservas/garantías/reparaciones también impactarán stock automáticamente al cambiar de estado.

### Protección contra edición manual

Un trigger `BEFORE UPDATE` sobre `products.stock` fuerza el valor real si `erp_stock_enabled=true`. Aunque una pantalla antigua o un cliente intente enviar un stock manual, la base mantiene el invariante.

### Compatibilidad

Catálogo y personalizador siguen leyendo `products.stock`; no necesitan conocer `product_units` ni duplicar lógica de inventario.

## Auditoría

Activar/desactivar la fuente ERP genera:

- `inventory.stock_erp_enable`
- `inventory.stock_erp_disable`

Los movimientos de las unidades siguen auditándose en sus operaciones de inventario correspondientes.

## Protocolo STAGING

1. Aplicar migración `20260828193000_erp_fase1d_stock_sync.sql`.
2. Confirmar que todos los productos siguen inicialmente en stock manual y que sus valores no cambiaron.
3. Elegir un producto de prueba con unidades físicas ya registradas.
4. Contar cuántas están `available`.
5. Activar `Stock ERP` desde Inventario.
6. Confirmar que `products.stock` pasa exactamente a ese número.
7. Marcar una unidad recibida como disponible y confirmar `stock + 1`.
8. Vender una unidad disponible y confirmar `stock - 1`.
9. Ejecutar `docs/erp/fase1d-verificacion-staging.sql`; la consulta de divergencias debe devolver cero filas.
10. Confirmar que productos aún en modo manual conservan sus valores históricos.

## Fuera de alcance de 1D

- reservas y liberación de reservas desde UI;
- garantía/reparación desde UI;
- actualización del agente de WhatsApp para consultar stock físico directamente;
- migración masiva automática de todos los productos a ERP.

Esas funciones pueden apoyarse en la misma fuente de verdad introducida aquí sin cambiar el contrato público de `products.stock`.
