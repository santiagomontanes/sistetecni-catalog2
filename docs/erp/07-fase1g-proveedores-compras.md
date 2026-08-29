# Fase 1G — Proveedores, compras y recepción por lote

## Objetivo
Formalizar el origen de cada computador y congelar su costo de adquisición real antes de calcular utilidad en una fase posterior.

## Modelo
- `suppliers`: proveedor canónico, editable sin reescribir históricos.
- `purchases`: cabecera `COMP-000001`, proveedor snapshot, referencia, fecha y totales.
- `purchase_items`: una fila por máquina física, nunca una cantidad agregada.
- `product_units.purchase_id`: enlaza el STU con su compra de origen.
- `product_units.acquisition_cost_cop`: queda igual al `landed_cost_cop` de la línea.

## Costos
Cada unidad registra:

`landed_cost_cop = base_cost_cop + allocated_extra_cost_cop`

Los gastos compartidos del lote (flete, transporte u otros) se distribuyen en pesos enteros. Si el monto no divide exactamente, el remanente de $1 se asigna determinísticamente desde la primera unidad hasta agotarlo.

Ejemplo: $10 compartidos entre 3 equipos → $4 + $3 + $3.

La invariante es:

`SUM(purchase_items.landed_cost_cop) = purchases.total_cost_cop`

## Atomicidad
`erp_receive_purchase_batch` crea en una sola transacción:
1. `purchases`.
2. N `product_units` con estado `received`.
3. N `purchase_items`.
4. N movimientos `receipt` referenciando la compra.
5. Auditoría de cada STU y de la compra completa.

Si una sola unidad tiene un producto inexistente, serial duplicado o costo inválido, la transacción completa hace rollback.

## Compatibilidad
- La recepción individual de Fase 1B permanece disponible para ingresos sueltos/históricos y deja `purchase_id = null`.
- Recibir una compra no aumenta el stock vendible: los STU nacen `received`.
- Fase 1D aumenta el stock únicamente cuando cada STU pasa después a `available`.
- Fases 1E/1F siguen controlando estados operativos y posventa sin cambios.

## Inmutabilidad
Para una unidad con `purchase_id`:
- no se puede cambiar manualmente el origen de compra;
- no se puede cambiar manualmente `acquisition_cost_cop`;
- compras y líneas recibidas no exponen UPDATE/DELETE a `authenticated`.

Las correcciones contables o devoluciones a proveedor requerirán un flujo compensatorio futuro; 1G nunca reescribe un hecho histórico.

## Alcance de “costo real” en 1G
Es el costo real **de adquisición/puesta en inventario**: precio pagado por la unidad + porción exacta de costos compartidos del lote. Reparaciones, repuestos y upgrades posteriores se agregarán como costos de ciclo de vida en una fase posterior antes de calcular utilidad final.
