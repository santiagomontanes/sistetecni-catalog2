# Transporte, rentabilidad y efectivo

Implementación: migración aditiva `20261023070000_shipping_transport_costs.sql`, servicio común `src/lib/shipping`, pantalla Envíos y reporte de rentabilidad existente. No se creó otro ledger. Importes COP enteros exactos, contratos JSON en cadenas, sin redondeo.

## Momento y concepto

| Evento | Persistencia y efecto |
| --- | --- |
| Registrar guía | Conserva guía como texto, flete exacto y conceptos conocidos. Cada concepto identifica responsable del costo, forma de pago/descuento, cargo al cliente y provisionalidad. Todavía no reconoce automáticamente costo de una entrega futura. |
| Confirmar entrega | Reconoce en `cost_entries` el transporte asumido por Sistetecni; actualiza margen de la venta existente. Un importe conocido pero pendiente de confirmación se reconoce como provisional y se señala para revisión. Un importe desconocido no se inventa. |
| Novedad, retorno, cancelación | El operador puede confirmar transporte ya causado, con motivo. No exige entrega exitosa. No devuelve stock disponible, no devuelve dinero y no anula automáticamente la venta. |
| Conciliar | Una entrada real de caja por consignación, asignaciones bloqueadas transaccionalmente, sin volver a registrar el flete. La venta conserva su valor. |
| Diferencia final sin causa | Registro separado pendiente de revisión; nunca gasto automático. Un abono no marcado como liquidación final conserva un saldo normal. |
| Corrección posterior de concepto | UUID, versión, confirmación y motivo. El ledger se ajusta por la diferencia neta; no genera caja. |

## Formas que no deben confundirse

- **Descontado del recaudo**: sólo este modo disminuye el neto COD esperado. Si Sistetecni asume el costo, se reconoce una vez; no se inserta `manual_out`.
- **Pagado anticipadamente**: vincular un MOV de salida existente. No repetir el pago. Si ese MOV pertenece a un gasto ya contabilizado, se asigna ese gasto a la venta sin crear otro `cost_entry`; el reporte global ya lo incluía. Si era una salida manual sin gasto, reconocer el costo en el ledger no vuelve a mover caja. La asignación no puede superar el pago disponible.
- **Pendiente de pago separado**: reconoce el costo propio causado, no un pago ficticio. El pago posterior usa el procedimiento de caja existente y debe vincularse/revisarse para evitar registrar además otro gasto por el mismo concepto.
- **Cliente paga directo a transportadora**: no es costo de Sistetecni ni descuento de su consignación.
- **Cobrado al cliente dentro de la venta**: importe informativo que debe estar incluido en el total de la venta; no crea ingreso adicional. No se aumenta una venta ya confirmada para acomodar ese campo.
- **Sin clasificación o importe desconocido**: permanece provisional/pendiente. Los registros antiguos mantienen su comportamiento y no reciben gastos retroactivos automáticos.

El transporte pagado por el cliente puede coexistir con un costo asumido por Sistetecni: responsable del costo y cargo al cliente son campos independientes. El formulario no deduce uno del otro.

## Ejemplo obligatorio verificado

Venta **700.000**, flete propio descontado **30.000**, sin otros conceptos, consignación **670.000**:

| Registro | Resultado |
| --- | --- |
| Venta existente | 700.000, sin modificación del total |
| Transporte en ledger de costos | 30.000 una sola vez |
| Consignación / caja | Una entrada de 670.000 |
| Salida adicional por flete retenido | Ninguna |
| Diferencia / saldo de recaudo | 0 |

Prueba PostgreSQL en `scripts/operational/transport.integration.mjs`, recorrido de navegador en `tests/e2e/shipping.spec.ts` y recorrido real bot→HTTP→ERP en `scripts/operational/cross-repo.integration.mjs`. Este último usa emisor Meta sintético y persistencia real local, sin mensajes reales.

## Diferencias, abonos y reversos

La liquidación final menor al neto crea una diferencia identificada y deja el saldo abierto. Un exceso conserva el dinero real completo y un crédito de consignación sin asignar; aplicarlo posteriormente no crea otra entrada de caja. Hay bloqueo de saldo y de consignación en concurrencia. Revisar una diferencia exige motivo; sólo se marca resuelta si el operador confirma que verificó su causa. La revisión no crea ningún asiento de gasto.

Para una causa conocida, corregir el concepto explícito de transporte y luego revisar la diferencia. No convertir una aproximación de búsqueda en coincidencia exacta. Reversar una consignación revierte una vez el movimiento de caja completo y sus asignaciones/crédito; conserva el historial de diferencias. Los costos de transporte realmente causados siguen vigentes aunque se reverse el cobro.

## Compatibilidad con el criterio contable previo

El ERP existente permite reversos completos de costos, no un importe negativo parcial. Por ello, reducir 30.000 a 25.000 revierte íntegramente el costo vigente y registra 25.000: efecto neto −5.000, con auditoría, sin caja. Aumentarlo registra sólo el incremento. Confirmar un importe provisional sin cambiarlo no duplica costos. No se cambió el criterio de valoración de compras ni el reconocimiento anterior de gastos pagados.

Se detectó que el reverso anterior era `SECURITY INVOKER` y hacía `FOR UPDATE` sin política UPDATE sobre costos: podía responder «no encontrado» incluso al administrador. Se conserva su algoritmo en una función interna y un wrapper comprueba `profitability.manage`. Los costos gestionados por envíos no se revierten desde un flujo aislado que dejaría desajustado el concepto.

Si ya existe un CST manual de transporte de esa venta, se exige vincularlo o revisar el conflicto; no se agrega otro automáticamente. La interfaz permite consultar referencias MOV/CST autorizadas. Los históricos se migran únicamente como metadatos provisionales sin nuevos gastos. Antes de activar sobre ventas antiguas, revisar costos/gastos ya contabilizados y vincular la fuente correspondiente. No se modificó ningún asiento de producción ni se inventó una integración fiscal.

## Límites explícitos

Los reportes muestran costos efectivamente registrados y advertencias de transporte pendiente; un margen provisional no es margen confirmado. La imputación de un gasto anticipado a la venta es operativa y no vuelve a modificar el gasto global. No existe un motor nuevo de cuentas por pagar, nota crédito ni factura oficial. La referencia de evidencia de consignación/entrega es textual privada: no se añadió un cargador nuevo de documentos financieros.
