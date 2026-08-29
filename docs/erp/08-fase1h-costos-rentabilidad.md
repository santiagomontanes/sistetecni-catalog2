# Fase 1H — Costos adicionales y rentabilidad

## Objetivo

Convertir la trazabilidad física/contable de 1A–1G en margen verificable por venta y por STU, sin reescribir compras ni facturas históricas.

## Fuentes de costo

1. `product_units.acquisition_cost_cop`: costo de adquisición congelado. Si viene de 1G ya incluye el reparto exacto del flete/gastos del lote.
2. `cost_entries` con scope `unit`: upgrade, reparación, repuesto, mano de obra, transporte, posventa u otro costo atribuible a un STU.
3. `cost_entries` con scope `sale`: envío, comisión de pago, accesorio/manual u otro costo general de la venta.
4. Al cerrar un GAR/DEV de 1F con `final_cost_cop > 0`, 1H crea automáticamente un costo `after_sales` para el STU. La migración hace backfill de casos cerrados anteriores.

## Ledger

Cada costo recibe `CST-000001` y es append-only. No existe UPDATE/DELETE. Una corrección crea un `reversal` exactamente igual y negativo al costo original. PostgreSQL verifica importe, scope, categoría y referencia del reverso.

## Fórmula por STU vendido

- Ingreso bruto: `sale_items.subtotal_cop`.
- Descuento asignado: parte proporcional del descuento global de la venta, en pesos enteros y con suma exacta.
- Ingreso neto STU = bruto - descuento asignado.
- Costos generales asignados: parte proporcional de los `cost_entries` de la venta usando el ingreso neto de cada ítem como peso.
- Costo conocido STU = adquisición + costos del STU + costos generales asignados.
- Utilidad actual STU = ingreso neto STU - costo conocido STU.

Los costos del STU se separan en preventa/posventa comparando `incurred_at` con `product_units.sold_at`. Por eso una garantía posterior reduce dinámicamente la utilidad actual sin alterar la factura.

## Costeo completo vs conocido

Una venta se considera `complete` solo si todos sus ítems físicos están enlazados a STU y todos esos STU tienen costo de adquisición, y además no existen ítems manuales cuyo costo no pueda inferirse automáticamente.

- `complete`: se puede mostrar como utilidad con costeo completo.
- `missing_acquisition_cost`: falta STU/costo de compra en algún ítem de catálogo.
- `manual_items_review`: hay ítems manuales; se muestra margen conocido, pero requiere revisión de costo manual.

El dashboard presenta `margen conocido` para todas las ventas y, por separado, `utilidad costeo completo` para no mezclar cifras confiables con ventas incompletas.

## Rutas

- `/admin/rentabilidad`: resumen por venta, costos generales y acceso a STU.
- `/admin/rentabilidad/unidad/[id]`: compra, ingreso asignado, extras preventa/posventa, margen, ledger y reversos.
- El dashboard permite buscar directamente `STU-000123`, incluso si aún no ha sido vendido, para cargar upgrades o reparación preventiva.

## Migraciones

- `20260829023000_erp_fase1h_costs_profitability.sql`
- `20260829023500_erp_fase1h_cost_ledger_guards.sql`

Producción no se modifica durante la validación de esta fase.
