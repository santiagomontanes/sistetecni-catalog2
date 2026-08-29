# ERP Fase 1F — Garantías y devoluciones formales

## Objetivo
Convertir los estados posventa de Fase 1E en expedientes formales vinculados a la venta y a la máquina física exacta.

## Modelo
`after_sales_cases` guarda el expediente vigente/histórico y congela:
- venta y número de venta;
- `sale_item_id`;
- `product_unit_id`;
- cliente (snapshot + `customer_id` cuando exista);
- producto, STU y serial;
- motivo reportado y estado al recibir;
- evidencias por URL;
- cobertura calculada al abrir;
- diagnóstico, costos y resolución.

`after_sales_case_events` es la línea de tiempo append-only.

## Números
- Garantía: `GAR-000001`
- Devolución: `DEV-000002`

La secuencia es global y puede tener huecos si una transacción falla; eso es normal y evita fabricar consecutivos manualmente.

## Invariantes
1. Un caso solo puede abrirse desde un `sale_item` que tenga `product_unit_id`.
2. La unidad debe estar `sold` al abrir.
3. Solo puede existir un caso no terminal por unidad.
4. Abrir garantía: `sold -> warranty` en la misma transacción.
5. Abrir devolución: `sold -> returned` en la misma transacción.
6. El cálculo de cobertura usa `sales.created_at + warranty_months` y queda congelado.
7. Un caso fuera del período puede registrarse, pero queda `out_of_warranty`; no se inventa cobertura.
8. Enviar a reparación exige diagnóstico desde la Server Action y cambia caso + unidad atómicamente.
9. Cerrar y devolver al cliente deja la unidad `sold`; no crea una venta nueva.
10. Cerrar y retirar deja la unidad `retired`.
11. Mientras exista un caso activo, el estado del STU está controlado por el expediente; el guard de DB bloquea cambios genéricos externos.
12. Evidencias: máximo 12 y solo `http/https`.
13. Snapshots e identidad del expediente son inmutables.
14. `after_sales_case_events` no tiene UPDATE/DELETE para `authenticated`.
15. Fase 1D sigue siendo la autoridad de stock: warranty/returned/repair/sold/retired no cuentan como `available`.

## Flujo garantía
`Venta -> GAR -> Diagnóstico -> Reparación (opcional) -> Esperando cliente (opcional) -> Devuelto al cliente -> Cerrado`

Alternativa terminal: retirar la unidad si no debe regresar al cliente.

## Flujo devolución
`Venta -> DEV -> Diagnóstico -> rechazo/devolver al cliente` o `DEV -> reparación/revisión -> retiro`.

En 1F una devolución que ya pasó a reparación no se reintroduce automáticamente a inventario vendible. La política de reacondicionamiento/reventa de equipos devueltos queda fuera de esta fase para no borrar su historial de venta.

## UI
- Menú: `/admin/garantias`
- Nueva: `/admin/garantias/nueva?saleItemId=...`
- Detalle: `/admin/garantias/[id]`
- Cada computador físico de `/admin/ventas/[id]` muestra `Abrir garantía / devolución`.

## No incluido
- carga directa de fotos a un bucket nuevo de Storage;
- reemplazo de una unidad por otra dentro de una garantía;
- notas de crédito/devoluciones contables;
- reingreso de una unidad vendida y devuelta como nuevo stock reacondicionado;
- automatizaciones de vencimiento/SLA.

Esas funciones requieren decisiones adicionales de negocio y contabilidad y no deben inferirse silenciosamente en 1F.
