# Envíos, entrega y recaudo

Estado de trabajo: implementado y probado en PostgreSQL y navegador locales; incluido en la suite E2E conjunta aprobada. No se aplicó ninguna migración remota, no se enviaron mensajes ni se emitieron facturas.

## Decisiones e integración

- Se reutilizan `sales`, `sale_items.product_unit_id`, `product_units`, perfiles/roles, `inventory_movements`, `audit_events` y `cash_movements`. No hay un segundo inventario ni una contabilidad paralela.
- Un envío activo contiene **todas las unidades físicas de una venta**. Se crea después de venderlas; deben seguir `sold`. Dividir una misma venta en varios paquetes no está implementado.
- Guía es texto y conserva ceros. Estado logístico y estado de recaudo son independientes. `version` evita sobrescrituras entre sesiones; cada mutación requiere UUID idempotente y contenido idéntico en reintentos.
- El ERP valora en **COP enteros bigint**. Contratos JSON usan cadenas de dígitos; cálculos de búsqueda usan `BigInt`. No se aceptan decimales, separadores, exponenciales, negativos ni importes mayores que 999999999999 COP. No se redondea.
- Contraentrega sólo se inicia sobre una venta pendiente sin cobros previos y por el valor completo de esa venta. Una venta histórica `parcial` puede carecer de detalle monetario suficiente: se rechaza para evitar inventar el saldo. Se admiten abonos parciales **de consignaciones** después de la entrega y reversos de consignaciones.
- Prepagado requiere venta ya pagada y valor por cobrar cero. Se conserva el movimiento de caja de esa venta.
- Neto esperado COD = valor por cobrar − **conceptos descontados del recaudo**. Flete anticipado, pago separado o pagado directamente por cliente no se descuentan otra vez. Cada concepto registra responsable, modo, cargo al cliente y provisionalidad. No se modifica el descuento comercial congelado en `sales`. Se confirma el neto al entregar; COD con neto cero se rechaza para revisión.
- La consignación crea **una** entrada `manual_in/transferencia` en la caja existente por el efectivo neto recibido. Sus asignaciones a envíos no crean nuevas entradas. Al completar el saldo, la venta pasa a `pagado`; esto no vuelve a disparar el trigger histórico de caja, que se ejecuta sólo al insertar ventas. Flete y descuentos quedan separados como conciliación entre bruto y neto; no se inserta una salida adicional de caja que descontaría el flete dos veces.
- El costo de transporte asumido por Sistetecni se incorpora una vez al ledger existente al confirmar entrega, o al confirmar que se causó en novedad/retorno. Importes no confirmados quedan provisionales; desconocidos no se inventan. No genera salida de caja por retención. Anticipos y costos previos se vinculan sin duplicar gastos; conciliación sólo registra efectivo y diferencias. [Reglas y ejemplo700.000/30.000/670.000](transporte-rentabilidad.md).
- Reversar una consignación utiliza el RPC de reversos de caja y reabre los saldos en la misma transacción. Un trigger impide revertir sólo su movimiento desde la pantalla antigua de caja. La referencia es única por cuenta, incluso tras un reverso; corregir usa una referencia nueva y mantiene la anterior auditada.
- Cancelar envío sólo se permite antes del despacho. Conserva venta, dinero y estado `sold`; permite crear otro envío para la misma venta. Devolver requiere que no queden consignaciones aplicadas, lleva las unidades a `returned`, sin volverlas disponibles ni devolver dinero. Resolver la venta/devolución comercial sigue el procedimiento existente; no hay notas crédito fiscales ni reembolsos automáticos.
- El documento existente es **comprobante interno**, no factura electrónica DIAN. La entrega enlaza ese comprobante y nunca genera uno nuevo ni altera `dian_status`.

## Uso por estación

1. Ventas: crear la venta habitual por unidades. En `/admin/envios`, “Nuevo envío”, buscar venta, completar destinatario, ciudad/departamento, domicilio u oficina y transportadora. Importe de venta y modalidad se derivan de la venta revisada.
2. Despacho: abrir ficha, registrar guía y flete exactos, separar descuentos y su concepto; indicar quién asume cada concepto y si se retiene, se anticipó, se pagará aparte o lo paga directo el cliente. Revisar cargos incluidos en venta y provisionalidad. Registrar despacho. Ante una novedad registrar motivo y, si corresponde, transporte ya causado. El control a tres días es sólo un aviso.
3. Entrega: introducir fecha/hora de Bogotá, responsable o referencia verificable y confirmar neto esperado. No registra efectivo recibido.
4. Caja: en “Recaudos” buscar por importe exacto, fecha de entrega, transportadora o guía. Revisar y seleccionar la combinación. También se puede seleccionar un saldo e introducir un abono parcial. Registrar fecha de consignación, cuenta, referencia y evidencia; confirmar explícitamente antes de guardar.
5. Corrección: transporte desde su ficha con versión, confirmación y motivo; diferencias desconocidas permanecen para revisión, no se gastan automáticamente. Abono parcial no equivale a liquidación final. Exceso de consignación queda como crédito sin asignar, aplicable sin otra entrada de caja. Para deshacer una consignación usar “Revertir” con motivo, sin borrar filas.

La UI muestra lectura, guardado/error, estados vacíos, paginación de envíos y recarga tras conflictos. Los permisos se comprueban también en SQL: `sales.read/manage`, `cash.read/manage`, `profitability.view/manage`, `users.manage`. Corrección de costo requiere `profitability.manage`; la configuración es administrativa. Tablas nuevas con RLS y sin escrituras directas autenticadas.

## Activación y recuperación

Migraciones del módulo:020000 (envíos/recaudos),070000 (transporte/diferencias) y080000 (bot/notificaciones), dentro del orden global010000–080000. Aditivas e idempotentes, con recuperación comentada. Primero aplicar **sólo en entorno autorizado** con esquema ERP previo; nunca aplicar toda la baseline a producción.

Variables sin secretos:

```dotenv
ERP_SHIPPING_ENABLED=false
ERP_SHIPPING_CRON_SECRET=<secreto-aleatorio-de-al-menos-32-caracteres>
# Ya existentes, sólo si se habilita el endpoint bot:
ERP_AGENT_CONTROL_ENABLED=false
ERP_AGENT_SHARED_SECRET=<secreto-compartido-existente-de-al-menos-32-caracteres>
ERP_AGENT_MAX_CLOCK_SKEW_SECONDS=300
```

La web sigue usando `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y JWT del empleado. El cron/bot usan el cliente de servidor existente (`SUPABASE_SERVICE_ROLE_KEY`), nunca exponerlo al navegador.

Activación gradual: subir código con `ERP_SHIPPING_ENABLED=false`; aplicar migración revisada en entorno autorizado; habilitar variable en un entorno de ensayo; activar `erp_shipping_settings.enabled` desde la UI con administrador; probar una venta ficticia; configurar hora/destinatarios y consumidor de avisos; promover a producción únicamente con autorización explícita. Al desactivar el ajuste de base de datos, las lecturas siguen disponibles y las escrituras se bloquean. Al desactivar la variable de servidor, las rutas se cierran. Ambos conservan datos. Revertir aplicación no exige borrar tablas ni revertir la migración; conservar el guard de caja para no deshacer parcialmente un recaudo.

## Avisos persistentes y tareas

- `erp_shipping_jobs`: clave única por guía y por fecha de resumen, estado, intentos, lease de cinco minutos, token de lease, error y fecha de finalización.
- Guía crea `verify_delivery` a tres días laborables de su registro, manteniendo hora de `America/Bogota`. **Se excluyen sábados y domingos, no festivos.** Entrega, cancelación o devolución cancelan avisos todavía pendientes.
- Cron autorizado: `POST /api/admin/shipments/jobs`, `Authorization: Bearer <ERP_SHIPPING_CRON_SECRET>`. Cada cinco minutos prepara jobs y publica notificaciones privadas persistentes. Esta ruta **no envía mensajes**. No reconstruye resúmenes de todos los días omitidos.
- El bot integrado consume `POST /api/internal/erp-agent/shipping-jobs`, misma HMAC existente, acciones `claim/begin/finish/ack`. El servidor vincula operador/perfil activo y destinatarios autorizados; sólo devuelve mensajes actuales, sin PII de clientes. Reserva `FOR UPDATE SKIP LOCKED`, lease/token, envío persistido antes del proveedor y ACK posterior.
- La aceptación sin ACK queda `uncertain`: no se reenvía automáticamente al reiniciar. Administrador revisa evidencia del proveedor desde Envíos y declara enviado/no enviado con motivo tras vencer el lease. Un token viejo no modifica un intento nuevo. No se promete entrega exactly-once de Meta sin idempotencia de proveedor.
- Conversación/worker sí integrados en `/home/sistetecni/proyectos/sistetecni-bot-operativo`. Preparación, envío sintético y reinicio fueron probados con API/BD reales locales; no hay mensajes reales. [Configuración/jobs e instalación pendiente](jobs-operativos.md).

Evidencias de entrega/consignación se guardan como referencia textual privada o constancia, no binario/base64. Este módulo no habilita un bucket público ni implementa un nuevo sistema de carga de documentos. Si se desea adjuntar archivos, usar el almacenamiento privado autorizado del ERP; no pegar URLs públicas con información personal.

## API web y contrato bot

Web: `POST /api/admin/shipments` con `Authorization: Bearer <JWT ERP>` y JSON:

```json
{"action":"guide","requestId":"550e8400-e29b-41d4-a716-446655440001","arguments":{"id":"550e8400-e29b-41d4-a716-446655440002","version":1,"guide":"000012345","freightCop":"18000","deductionsCop":"0"}}
```

Acciones web: `sales`, `references`, `list`, `detail`, `settings`, `jobs`, `metrics`, `deposits`, `pending_collections`, `search`, `configure`, `create`, `guide`, `dispatch`, `deliver`, `incident`, `cancel`, `return`, `reconcile`, `reverse_deposit`, `transport_save`, `difference_review`, `apply_deposit_credit`. Contrato validado estricto: `src/lib/shipping/contracts.ts`. Respuesta `{ok:true,data:...}`; conflicto de versión exige recargar/revisar. UUID con contenido diferente se rechaza. Cuerpo máximo32768 bytes, incluso sin Content-Length. El ejemplo mínimo anterior permanece compatible como transporte no clasificado/provisional; clientes nuevos deben enviar la clasificación:

```json
{"transport":[{"code":"freight","kind":"freight","description":"Flete de la guía","amountCop":"30000","costBearer":"sistetecni","settlement":"withheld","provisional":false,"customerChargeCop":"0","customerChargeMode":"none"}]}
```

Agregarlo a `arguments` de `guide`, con `freightCop:"30000"`. Otros modos/responsables y fuente opcional MOV/CST están en el contrato; no se deducen por el nombre del concepto.

Bot: `POST /api/internal/erp-agent/shipments`, además de los flags, firma HMAC existente:

```text
x-erp-agent-timestamp: <segundos Unix>
x-erp-agent-signature: sha256=<HMAC-SHA256(secret,timestamp + "." + cuerpo-JSON-exacto)>
```

```json
{"kind":"command","waId":"573000000000","metaMessageId":"mensaje-unico","requestId":"550e8400-e29b-41d4-a716-446655440003","action":"guide","arguments":{"id":"550e8400-e29b-41d4-a716-446655440002","version":1,"guide":"000012345","freightCop":"18000","deductionsCop":"0"}}
```

`waId` solo identifica al operador vinculado; el remitente no basta para autorizar. Se reutiliza `whatsapp_erp_operators`, perfiles activos, permisos y confirmación del ledger existente. Las escrituras responden `pending_confirmation` con código y vencen a diez minutos. El adaptador debe mostrar datos concretos al empleado y enviar un segundo sobre firmado:

```json
{"kind":"confirm","waId":"573000000000","requestId":"550e8400-e29b-41d4-a716-446655440003","confirmationCode":"123456"}
```

Acciones bot permitidas: `sales`, `references`, `create`, `list`, `detail`, `guide`, `dispatch`, `deliver`, `pending_collections`; cancelación confirma solicitudes pendientes sólo del namespace envíos. Pendientes de guía: `list` con `arguments:{"status":"pending_guide"}`. Crear comparte el contrato web. Entrega requiere `deliveredAt` ISO con zona, `expectedNetCop` cadena y `evidence`. Conciliación queda en web con confirmación contextual. Bot usa un ID estable de mensaje por acción para que una lectura auxiliar y un despacho del mismo mensaje no colisionen. Reintentos no duplican; identidad/contenido distintos se rechazan.

## Búsqueda y métricas

La búsqueda utiliza sólo saldos de envíos `delivered` en `pending/partial`. No incluye importes ya aplicados, devueltos, cancelados ni aproximaciones. Consulta hasta 101 filas para detectar truncación; analiza como máximo 30 candidatos, 100000 nodos y 25 resultados. Devuelve `limited` y exige confirmación incluso con una sola coincidencia. Fecha filtra fecha local de entrega; referencia filtra guía. Un saldo puede haber cambiado después de buscar: locks y versión se revalidan al aplicar.

`pendingGuide`: envíos sin guía. `verifyDue`: envíos con guía cuyo plazo de tres días ya venció y continúan listos, despachados o con novedad; **enviar/confirmar el aviso no los elimina de esta métrica**. `netPendingCop`: suma de neto esperado menos consignaciones vigentes en entregados con saldo. `receivedCop`: dinero efectivamente asignado, descontando reversos. `differenceCop`: neto esperado menos recibido de todos los entregados; es **saldo abierto**, no una pérdida o ajuste contable aprobado. Ninguna de estas cifras es utilidad. Venta e ingreso efectivo se reportan por separado.

## Evidencia y pendientes

- `node --test scripts/operational/shipping.integration.mjs`: **13/13 pasan**, repetido tras revisión de seguridad, en PostgreSQL local con migraciones ERP reales y fixtures sintéticos. Incluye concurrencia en dos conexiones independientes, locks/idempotencia, doble consignación, rollbacks reales, permisos SQL/RLS, flujo bot con confirmación y detección de sobre reutilizado, recaudos parciales/reversos y regresión comprobantes/caja. Además valida devolución prepagada sin reembolso, descuentos sin concepto rechazados, neto negativo rechazado, recuperación de jobs tras lease vencido y rechazo del ACK antiguo sin modificar entrega. No usa mocks de transacciones.
- `npx tsc -p tsconfig.test.json && node --test .tmp-test/lib/shipping/domain.test.js`: **6/6 pasan**: COP exactos, coincidencias única/múltiple/ninguna, límites, calendario, contratos y tamaño HTTP.
- `npx tsc --noEmit --incremental false`: aprobado en integración final. El error temporal de fixture de acabados fue corregido; runner global 514/514 aprobado.
- Lint de archivos del módulo pasó con `ESLINT_USE_FLAT_CONFIG=false npx eslint ...`. El repositorio usa `.eslintrc.json`; ESLint 9 sin ese ajuste falla por configuración anterior, no por este módulo.
- `tests/e2e/shipping.spec.ts`: **2/2 aprobados** con700.000/30.000/670.000; Auth/PostgREST/BD reales locales, selección explícita, permisos y tamaño. Fechas de consignación en Bogotá.
- Transporte: **11/11 PG** aprobados; notificaciones **5/5 PG**; bot **2.776/2.776** unitarias; **4/4 HTTP entre repositorios** con persistencia real y emisor Meta sintético. Logs/resultados finales en [verificacion-local.md](verificacion-local.md).
- Falta validar dispositivos físicos, Meta/plantilla real y calendario instalado en hosting. No existe integración fiscal DIAN; no se emiten documentos oficiales.
