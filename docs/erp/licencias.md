# Licencias de software y su relación con Caja

Migración `20261030030000`. Pantalla `/admin/licencias` (menú «Licencias de software»). Todo el acceso pasa por `erp_license_command` (sin permisos directos sobre las tablas).

## Qué registra
- **Licencia** (`LIC-000001…`): cliente (de Clientes), software, clave opcional, plan (**mensual**, **anual** o **pago único**), valor, fecha de inicio, estado (activa, suspendida, cancelada) y hasta cuándo está pagada.
- **Pago**: valor, fecha, medio, referencia, período que cubre y el **movimiento de Caja** que generó. Cada pago crea **una** entrada `manual_in` en Caja con descripción «Licencia LIC-… · software · cliente» y metadatos `kind: software_license`.
- Estados calculados: *Al día*, *Vence pronto* (7 días), *Vencida*, *Pagada* y *Pago pendiente* (pago único), *Suspendida*, *Cancelada*. El resumen muestra activas, vencen pronto, vencidas, ingreso mensual estimado (mensual + anual/12) y lo cobrado en el mes.

## Reglas
- Planes recurrentes: el pago indica cuántos meses/años cubre (1–36); `paid_until` avanza desde el fin del período pagado. Pago único: no se puede pagar más que el saldo.
- Idempotente por clave de solicitud: repetir un pago o una creación no duplica el asiento en Caja; reutilizar la clave con otros datos se rechaza.
- **Reverso**: solo desde Licencias («Reversar pago», con motivo). Crea el movimiento de reverso en Caja (no se borra nada; el original se conserva), marca el pago como reversado y recalcula `paid_until`. Reversar el movimiento directamente desde Caja se rechaza (`license_reverse_through_license`) para que pago, licencia y Caja no se desalineen.
- Una licencia suspendida o cancelada no recibe pagos. Cancelar conserva pagos y movimientos.
- La **clave de licencia** no viaja en el listado: se consulta con «Ver clave» (queda en auditoría) y requiere `sales.manage`.

## Permisos
Leer: `sales.read` o `cash.read`. Crear/editar/estado/ver clave: `sales.manage` (administrador, supervisor, vendedor). Registrar y reversar pagos: `cash.manage` (administrador, caja).

## Caja
La pantalla de Caja añade la columna **Origen** y un resumen «De dónde viene el dinero» (Ventas, Consignaciones de transportadora, Licencias de software, Compras, Gastos, Reversos, Otros movimientos) sobre los últimos movimientos cargados (el tablero de Caja ya limita a 100). Los movimientos de licencias y de transportadora no muestran «Reversar» genérico.

## Límites
No emite factura electrónica DIAN ni genera cobros automáticos recurrentes: los vencimientos se ven en pantalla y el pago se registra manualmente. No hay avisos por WhatsApp de vencimiento.
