# SISTETECNI ERP — Fase 2 administrativa

## Alcance
La Fase 2 se entrega como un bloque único pero conserva cuatro submódulos:

- **2A Caja:** sesiones `CAJ-*`, movimientos `MOV-*`, apertura/cierre y diferencia de efectivo.
- **2B Gastos:** gastos `GAS-*`, categorías operativas, comprobante opcional y anulación compensatoria.
- **2C Reportes:** KPIs por periodo con ventas, STU vendidos, compras, gastos, flujo, garantías e inventario valorizado.
- **2D Roles:** `admin`, `supervisor`, `vendedor`, `tecnico`, `caja`, `bodega`, `viewer`.

## Caja
Las ventas con `payment_status=pagado` generan un movimiento positivo automáticamente. Las ventas históricas pagadas se incorporan mediante backfill con `session_id=null`; por eso aparecen en reportes sin alterar cierres de caja futuros.

Solo movimientos `payment_method=efectivo` vinculados a una sesión forman el efectivo esperado del cierre:

`esperado = apertura + entradas efectivo - salidas efectivo`

Transferencia, Nequi, Daviplata y tarjeta forman parte del flujo financiero pero no del efectivo contado.

Los movimientos manuales admitidos son `manual_in`, `manual_out` y `purchase_payment`. Las correcciones se hacen mediante `reversal`; no se borran filas.

## Gastos
Categorías: arriendo, servicios, publicidad, nómina, transporte, hosting, software, papelería, impuestos, mantenimiento y otro.

Crear un gasto crea en la misma transacción una salida de `cash_movements`. Anularlo conserva el gasto, lo marca `voided` y crea el movimiento contrario.

## Reportes
`erp_business_report(from,to)` permite máximo 367 días por consulta y solo lo ejecutan roles con `reports.view`.

`knownNetResultCop` es una medida administrativa conocida:

`ventas del periodo - costo adquisición STU vendidos - cost_entries asociados - gastos operativos del periodo`

No sustituye contabilidad fiscal/DIAN.

## Roles
- **Administrador:** todo, incluidos módulos web históricos, costos y usuarios.
- **Supervisor:** operación ERP, caja, gastos, reportes y lectura de rentabilidad; no usuarios ni configuración web.
- **Vendedor:** clientes, ventas, reservas y apertura de garantía/devolución.
- **Técnico:** inventario operativo y gestión de garantías/reparaciones.
- **Caja:** lectura de ventas, caja y gastos.
- **Bodega:** inventario, proveedores y compras.
- **Viewer:** sin acceso operativo.

Los RPC 1A–1G no se duplican: se renombran como implementación interna y se publican wrappers del mismo nombre. El wrapper valida el permiso y usa una elevación legacy transaccional de `is_admin` solo para reutilizar la función ya probada. La elevación se revierte antes del commit y no es visible a otras transacciones.

El rol `admin` sí mantiene `is_admin=true` para compatibilidad con Productos, Configuración, Galería y RPCs administrativos históricos. El sistema impide desactivar/degradar al último administrador activo.

## Usuarios
Fase 2 administra roles de perfiles que **ya existen** en Supabase Auth. No crea contraseñas, no genera usuarios con claves temporales y no usa service-role desde el navegador.

## Fuera de alcance
- conciliación bancaria real;
- cuentas por cobrar parciales detalladas (sales solo conserva el modelo actual pagado/pendiente/parcial);
- nómina laboral completa;
- contabilidad fiscal o DIAN;
- creación/invitación automática de cuentas de Auth.
