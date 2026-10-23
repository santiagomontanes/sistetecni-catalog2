# Matriz completa del alcance operativo

Revisión: 2026-10-23. Corresponde a las secciones 1–14 del pedido original y la ampliación de transporte. Código revisable en ERP `erp/flujo-operativo-20261022` y bot `erp/operacion-envios-20261023`. **Implementado localmente no significa activado en destino.** Resultados y logs consolidados: [verificación](verificacion-local.md); pasos físicos: [piloto](piloto-operativo.md).

Pruebas referidas: **UT** = `npm run test:unit` (514); **ENV** = `npm run test:env` (17); **PG** = `npm run test:operational` (47 pruebas Node/PostgreSQL, 25 aserciones SQL y cuatro escenarios concurrentes adicionales); **WEB** = Playwright (11 aprobadas) contra Auth/REST/Storage/PostgreSQL locales; **BOT** =2.776 unitarias del checkout aislado; **HTTP** =cuatro integraciones reales bot→ERP→BD. Los emisores Meta y cámaras de pruebas son sintéticos. No son mocks de transacciones. El estado final de cada ejecución está en el documento de verificación; no se ejecutaron pruebas fiscales ni mensajes reales.

## 1. Trabajo, integridad y compatibilidad

| Requisito | Implementación existente | Prueba ejecutada y resultado | Pendiente real |
| --- | --- | --- | --- |
| 1.1 Instrucciones y repositorios | Leído README de migraciones; no hay AGENTS aplicable. ERP/backend/catálogo comparten repo. Bot localizado fuera de `proyectos`; checkout aislado desde `24c3354`. | Inspección Git/rutas/procesos y recuperación de baseline BOT; sin cambios en worktrees fuente. | Fusionar/revisar ambos checkouts antes de activación; el trabajo no está publicado. |
| 1.2 Auth, roles, datos e integraciones | Reutiliza Supabase Auth, `profiles`, permisos ERP, compras, inventario, ventas, costos, caja, Storage y HMAC/OTP del agente. | UT/PG/WEB/HTTP: lecturas y escrituras autorizadas, denegaciones y sesiones reales. | Verificar mismas políticas/roles en destino autorizado. |
| 1.3 Fuente única | Equipos/piezas en `product_units`; productos en `products`; costos/caja/gastos y usuarios existentes. | PG instalación/venta/valoración y transporte verifican tablas originales. | No se creó ledger ni stock paralelos. |
| 1.4 Framework/dependencias | Mantiene Next/React/Supabase; nuevos QR y herramientas de prueba, sin renovación general. | Build, tipos y lint; línea base registrada. | 27 avisos de auditoría previos requieren una revisión separada antes de exposición; no se alteraron dependencias ajenas. |
| 1.5 Git y cambios del usuario | Ramas aisladas; Meta/coexistencia y documentos previos conservados; sin reset/limpieza. | `git status`, diff y archivo de respaldo de ambos árboles de fuente. | Revisión de diff/commit/merge por entrega; no sobrescribir WIP fuente del bot. |
| 1.6–1.8 Baseline, continuidad y decisiones | Documento de progreso con baseline y fallos encontrados; implementación en módulos, decisiones reversibles ejecutadas. | 454 UT de baseline ERP, 514 actuales; BOT baseline recuperada 2.770, actuales 2.776. | Revisión de reglas de negocio de piloto; no hay una pregunta rutinaria bloqueando implementación. |
| 1.9–1.10 Producción/privacidad | Fixtures limitados a Docker/loopback; sin migraciones, mensajes, facturas o cobros reales; logs sin secretos. | ENV y guardas de scripts; HTTP HMAC inválido rechazado. | Activación requiere autorización explícita; no se ha realizado. |
| 1.11 Migraciones compatibles | Ocho migraciones aditivas nuevas; históricos con campos opcionales/backfill sólo metadatos. | Aplicación/reaplicación local, PG y regresiones. | Comparar historial/esquema del destino antes de aplicar; no reaplicar baselines. |
| 1.12 Flags/desactivación | Ajustes taller/envíos/asistencia; acabados por producto, desactivados por defecto. Conserva guardas/historial. | PG desactivar conserva lecturas/bloquea comandos. | Configuración gradual en destino y revisión de productos seleccionados. |
| 1.13 Accesos faltantes | Bot sí encontrado e integrado; proveedor, hosting y dispositivos separados de código local. | BOT + HTTP, sin conexión de envío Meta real. | Credenciales/plantilla/autorización de mensajes y hosting; dispositivos. |
| 1.14 Progreso persistente | `15-flujo-operativo-progreso.md`, esta matriz y guías con decisiones, pruebas y límites. | Archivos presentes/revisables y respaldo local del código. | Mantener registro de resultados del piloto físico y activación futura. |

## 2–4. Identidad, QR, dispositivos y recepción

| Requisito | Implementación existente | Prueba ejecutada y resultado | Pendiente real |
| --- | --- | --- | --- |
| 2 Unidad/producto/acabado/configuración | Campos separados; unidad STU persiste; producto comercial puede desconocerse. Configuración física por piezas y overrides verificados. | PG y WEB unidad sin producto en inventario/rentabilidad; snapshot comercial por unidad. | Completar sólo especificaciones realmente conocidas en taller. |
| 2 Estados independientes | Fase taller, condición preliminar, ubicación, comercial, envío y recaudo separados; recepción original inmutable. | PG transiciones y WEB recorridos. | Ningún estado único reemplaza todos. |
| 3 QR limpios/libres/asignados/anulados | RPC lote, SVG QR imprimible con STQ; resolución autenticada y anulación motivada. | PG/WEB lote, resolución, anulado rechazado. | Impresión/material/lectura física. |
| 3 Asignación atómica y privacidad | Lock etiqueta + unidad, petición idempotente; QR sólo código, no PII ni credencial. | PG dos conexiones: una gana y perdedora revierte; permisos de lectura denegados. | Probar escaneo con sesión cerrada en dispositivos. |
| 3 Cámara y manual | `BarcodeDetector` con permisos/contexto seguro y alternativa manual. | WEB ingreso manual y QR SVG real. | Cámara QR Android/iOS/HTTPS físico. Si no hay BarcodeDetector se usa manual; no se añadió decoder alternativo. |
| 3 Ubicación agregar/código/jerarquía | Ubicaciones únicas padre/hijo, activar/desactivar; sin borrado ordinario. | PG unicidad, historial y bloqueo de borrado ocupado; WEB agregar/mover. | Cargar códigos físicos reales durante piloto autorizado. |
| 3 Historial de movimiento | Origen/destino/empleado/hora servidor + motivo auditado. | PG y WEB verifican evento persistido. | Ninguno de código para movimiento básico. |
| 3 Enlace celular a pestaña | Código cinco minutos, canje único, vínculo ocho horas revocable por sesión Auth+secreto de pestaña. | PG sesión ajena/misma cuenta no vinculada, vencimiento y revocación; WEB dos contextos. | Ensayo físico de dos dispositivos y red. |
| 3 Ficha/fotos sincronizadas | Polling autorizado selección 2 s, unidad 5 s, fotos 15 s; servidor es fuente persistida. | WEB misma unidad en ambos, foto real Storage de contexto móvil visible en escritorio. | No se implementó WebSocket/offline; latencias explícitas. |
| 3 Concurrencia/estados/reconexión | UUID + row_version; no reemplaza campos sucios. Guardando/guardado/error; online vuelve a leer; recarga confirmada reinicia formulario. | PG versión vieja rechazada; WEB conflicto dos contextos, borrador conservado y recarga: aprobado. | Ensayar pérdida/recuperación de Wi-Fi físico. |
| 4 QR, marca/modelo/serial, lote/costo | Formulario recepción opcional en desconocidos; enlaza STU recibido en Compras sin duplicarlo y conserva costo/lote. | PG recepción y WEB reuso de STU con costo 200.000. | Para conservar compra, recibir/enlazar mediante flujo de Compras existente; no se inventan lotes desde texto libre. |
| 4 Estado físico/pantalla/prende/video | Perfecto/bueno/malo/desconocido, pulgadas/tipo/observación; sí/no/sin comprobar. | UT validación + PG snapshot + WEB recepción. | Inspección humana real. |
| 4 RAM por módulo y discos físicos | Capacidad/generación/formato; HDD/SSD, M.2 como formato, SATA/NVMe como interfaz y conector cuando conocido. | UT + PG piezas y total; desconocidos admitidos. | Identificar interfaz/conectores físicamente; no deduce por ranuras. |
| 4 Batería aparente/cargador/fotos/notas | Aparente provisional en snapshot; cargador recibido e instalado con atributos; fotos privadas posteriores enlazadas a unidad/recepción. | PG batería independiente + WEB fotos reales y atributos de cargador. | Cámara física/evidencia legible. |
| 4 Condición/ubicación y equipos malos | Bueno/regular/malo separado de estado comercial; malos a bodega, sin disponibilidad automática. | PG control de fase/stock; formulario manual. | Decidir reparación/despiece por unidad, no eliminación automática. |
| 4 Instantánea/corrección auditada | Trigger inmutable, correcciones nuevas con motivo/autor/fecha; configuración posterior no reescribe ingreso. | PG UPDATE del original rechazado y snapshot RAM1GB sigue tras retiro. | Ninguno de persistencia; editor de corrección es JSON administrativo explícito. |

## 5–6. Componentes, herramientas y diagnóstico

| Requisito | Implementación existente | Prueba ejecutada y resultado | Pendiente real |
| --- | --- | --- | --- |
| 5 RAM DDR2/3/3L/4/5, capacidad, estado | Atributos de misma unidad física; capacidades numéricas extensibles, pendiente/funcional/defectuosa. | UT contratos y PG pruebas/instalación. | Capturar atributos faltantes, sin inferir compatibilidad. |
| 5 Discos/cargadores | Capacidad/tecnología/formato/interfaz/estado/ubicación; cargador conector, V/A/W conocidos. | PG piezas serializadas; WEB 19,5V/3,33A/65W persistidos: aprobado. | Probar compatibilidad eléctrica/conector físicamente. |
| 5 Retirar/instalar/asignar y destino | Lock equipo y pieza; ubicación al retirar, resultado de prueba, motivo. Un único `installed_in_unit_id`. | PG/WEB retirar RAM; PG instalar, probar y mover cargador/disco. | No hay consumo paralelo por contador independiente. |
| 5 Caso 1GB → dos de 4GB | Original instalado no disponible; retiro suelto, dos instalaciones y total8GB. | PG transacción real con auditoría/snapshot; piloto preparado con dos piezas4GB. | Ejecutar recorrido humano físico. |
| 5 Atomicidad/concurrencia/idempotencia | Petición persistida, locks ordenados, sin stock negativo/doble instalación. | PG dos conexiones por última pieza y reintento: una instalación/costo. | Prueba de carga a volumen de destino no realizada. |
| 5 Reversos/origen/destino/costos | Movimientos compensatorios y ledger existente, jamás DELETE. | PG costo/reverso y reporte de inventario al vender padre con piezas. | Costo de piezas originales permanece incluido en adquisición del equipo; cambiar su reparto requiere criterio explícito adicional. |
| 5 Compatibilidad verificable | Rechaza contradicción conocida RAM/formato/interfaz/conector/voltaje; desconocido exige inspección. UI guarda interfaces SATA/NVMe/IDE/SAS y voltaje/conector compatibles verificados. | PG/UT compatibilidad y validadores; WEB guarda SATA+NVMe,19,5V y conector y verifica persistencia: aprobado. | Inspección/documentación humana de compatibilidad; no se implementó detector automático ni se infiere por ranuras. |
| 6 USB reutilizables | Registro herramienta código/ubicación/contenido/versión/UEFI-Legacy real, sin consumir stock. | PG USB y comandos validados UT. | Registrar imágenes reales autorizadas; no se proporcionan software ni claves. |
| 6 Windows/programas/instalado vs probado | Nombre configurable, edición/versión, actor/fecha; Windows, Office, Brave, Driver Booster, PDF, WinRAR sugeridos. | PG software: instalado no habilita controles. | Validar instalaciones reales y sus licencias. |
| 6 Controles y batería final | Definiciones obligatorias/configurables, resultados/no aplica motivado; cambiar hardware invalida. | PG no disponible si faltan controles, nueva definición invalida; batería final separada. | Medición real de pantalla/puertos/batería, no sólo marcar casillas. |
| 6 Asistente automático opcional | No implementado; flujo manual disponible; QR no ejecuta nada en Windows. | WEB flujo manual y PG guardas. | Recolector automático fuera de entrega; no bloquea operación manual ni promete especificaciones detectadas. |

## 7. Estética y catálogo

| Requisito | Implementación existente | Prueba ejecutada y resultado | Pendiente real |
| --- | --- | --- | --- |
| 7 Buscar/crear producto/asociar | Búsqueda desde estética y enlace al catálogo existente para crear producto; misma unidad asociada. | WEB producto seleccionado y snapshot final. | Creación usa formulario habitual, no catálogo duplicado. |
| 7 Acabado distinto de color | `product_finishes`: base/texture/name/photos; Gris3D y Gris chinas independientes. | WEB dos acabados/fotos reales distintas y selección. | Fotos comerciales reales validadas, sin PII. |
| 7 Borrador desde configuración final | Resumen por unidad, precio y confirmación humana; publica con controles/fotos. | PG/WEB snapshots y guardas. | No hay reconocimiento por foto; selección manual completa. |
| 7 Selector/imágenes/stock/precio | Opciones públicas por acabado+configuración+precio, sólo unidades vendibles. | WEB no expone RAM64 genérica, muestra4/8 por unidad, elimina acabado vendido; PDF usa opciones reales. | Validación visual en teléfonos físicos. |
| 7 URLs/pedidos históricos | Misma URL producto; flag por producto, venta y comprobante existentes. | UT regresiones y WEB venta/comprobante dos descargas sin duplicación. | Personalizador heredado excluye productos con acabados activados: no permite elegir unidad/acabado todavía. El catálogo y venta manual sí. |
| 7 No generalizar una unidad | Fingerprint/configuración por unidad y snapshot venta. | WEB dos configuraciones/stock/precio coherentes. | Completar sólo atributos de esa unidad. |

## 8. Envíos y WhatsApp

| Requisito | Implementación existente | Prueba ejecutada y resultado | Pendiente real |
| --- | --- | --- | --- |
| 8 Servicio único web/bot | `erp_shipping_command` con validación, permisos y peticiones idempotentes, API JWT/HMAC. | PG, WEB, HTTP pasan sobre mismo RPC. | Activar flags sólo en destino autorizado. |
| 8 Destinatario/documento/celular/ciudad/depto | Formulario web y guiado bot; oficina/dirección, venta/unidades, modo/valores, transportadora/notas. | WEB crear y HTTP formulario bot hasta entrega/consulta. | Datos reales no usados en pruebas; un envío contiene todas las unidades de una venta. |
| 8 Guía/flete/otros/fechas/evidencia | Texto conserva ceros, conceptos separados y fecha servidor/ISO Bogotá; referencia privada de evidencia. | PG/WEB/HTTP exactitud30.000; contratos estrictos. | Adjuntos financieros binarios no tienen nuevo cargador; evidencia es referencia/constancia textual. |
| 8 Estados/novedades/retornos/cancelación | Estado logístico separado de cobro, efectos explícitos; retorno→returned, cancelación no cancela venta. | PG parciales/reversos/retorno/cancelación y transporte fallido. | No reintegra a venta ni devuelve efectivo automáticamente. |
| 8 Bot operaciones solicitadas | Checkout aislado con Nuevo envío, pendientes guía, guía/flete, detalle, despacho, entrega, pendientes recaudo. | BOT 2.776 pasan; HTTP4 crea guía30k/entrega670k, roles y recordatorios. | Meta real y despliegue del bot no autorizados; no se enviaron mensajes. |
| 8 Número no autoriza | `whatsapp_erp_operators`, perfil activo, permisos, firma, confirmación OTP de escrituras. | HTTP remitente no vinculado/firma mala rechazados; PG doble confirmación. | Vincular operadores reales sólo al activar. |
| 8 Resumen nocturno/hora/destinatarios | Configuración ERP, outbox único por fecha y notificaciones privadas. | PG notificaciones idempotentes/RLS; scheduler local temporal dos ejecuciones. | Timer permanente de destino/plantilla/destinatarios sin instalar. |
| 8 Tres días laborables/Bogotá | Suma lunes-viernes manteniendo hora, no excluye festivos; sólo aviso. | UT/PG calendario y no cambia entrega. | Regla de festivos distinta requeriría calendario nuevo explícito. |
| 8 Jobs reinicio/retry/duplicados | Leases persistentes/tokens; ACK; emisor incierto a revisión, sin reenviar ciegamente. | PG5 y HTTP reinicio/ACK perdido/emisor sintético una vez. | Meta no ofrece aquí prueba de exactly-once; aceptación incierta requiere revisión humana. |

## 9–10. Recaudo, contabilidad y métricas

| Requisito | Implementación existente | Prueba ejecutada y resultado | Pendiente real |
| --- | --- | --- | --- |
| 9 Entrega/fecha/responsable/neto | Confirmación neto y evidencia; no registra efectivo. | PG/WEB/HTTP entrega exacta. | Verificar constancia real sólo en operación autorizada. |
| 9 Venta/flete/descuentos/neto/recibido | Campos separados, ledger transporte y caja existentes; revisión provisional visible. | PG transporte11 casos y HTTP ejemplo700/30/670. | Revisión de costos manuales previos antes de activar históricos. |
| 9 Consignación cuenta/ref/evidencia | Registro persistido, referencia única incluso reversada, fecha válida y asignaciones. | PG/WEB una sola caja y bloqueo concurrente. | Evidencia textual; no nuevo sistema de documentos financieros. |
| 9 Buscador exacto/combinaciones | BigInt, sólo saldo entregado abierto, guías y filtros fecha/carrier/ref. | UT única/múltiple/ninguna; PG saldos reales excluidos. | Confirma siempre operador, nunca aproximaciones automáticas. |
| 9 Límites de búsqueda | Hasta30 candidatos,100.000 nodos,25 resultados; detecta truncación de consulta. | UT límites/exactitud. | Búsquedas limitadas lo indican; filtrar para reducir. |
| 9 Pagos parciales/reversos/concurrencia | Abonos consignación, liquidación final opcional, crédito no asignado de exceso; reverso completo existente. | PG saldos, doble referencia, dos sesiones, crédito y reversos. | COD inicial sólo venta totalmente pendiente; venta parcialmente pagada previa se rechaza, no inventa saldo. |
| 10 Comprobante/factura/fiscal | Reutiliza PDF interno existente; entrega enlaza documento, no emite factura nueva ni cambia DIAN. | PG y WEB venta única, dos PDFs sin duplicación. | ERP no tiene integración fiscal; emitir factura oficial/nota crédito requiere proveedor y alcance real. |
| 10 Sin doble ingreso/costo/caja | Costos sobre ledger; consignación sobre caja; marcación pagado no reinserta venta ni cobra bruto. | PG ejemplo obligatorio y adopción de gasto anticipado ya contabilizado. | Pago separado futuro usa caja existente con revisión para no duplicar gasto. |
| 10 Fases/ubicación/tiempos/detenidos | `erp_operational_report` dentro de Reportes; horas calendario por fase y lista limitada con total. | PG reporte y WEB «Consultar operación». | No son horas laboradas; tiempos previos a adopción no se reconstruyen. |
| 10 Fallas por lote/consumo/preparación | Compras asociadas, controles fallidos manuales, instalaciones/retiros/reversos, costos realmente registrados. | PG lotes/movimientos/reportes. | No se inventa mano de obra ni reparto de compra donante; sin compra muestra sin lote. |
| 10 Margen/ventas acabado/logística/recaudo | Venta por acabado subtotal; margen por costos efectivos + gastos anticipados asignados; guías/neto/diferencias separados. | PG valoración al vender y transporte; WEB acabados/reportes; UT repositorios. | No interpretar subtotal como utilidad ni facturado como efectivo; importes provisionales requieren revisión. |

## 11–12. Asistencia, pagos, seguridad y UX

| Requisito | Implementación existente | Prueba ejecutada y resultado | Pendiente real |
| --- | --- | --- | --- |
| 11 Entrada/almuerzo/fin/salida | Hora servidor, un turno por empleado, secuencia consistente, puede cruzar medianoche. | 25 aserciones SQL +4 concurrentes y WEB cámara/eventos. | Ensayo físico en horario real, sin alterar datos de producción. |
| 11 Selfie/cámara/compresión | JPEG hasta512KiB, Storage privado, BD sólo referencia/metadatos. No reconocimiento biométrico. | WEB captura sintética real subida/descargada, tamaño y denegación otro empleado. | Legibilidad/cámara/permisos reales; no se verifica identidad automáticamente. |
| 11 Retención/acceso/borrado verificable | Plazo configurable, enlaces60s, sin derivados en servidor; reserva metadatos antes de upload. Job verifica ausencia antes de marcar deleted. | WEB vencimiento real del URL con archivo aún presente, borrado/reintento y recuperación de upload pendiente pasan. | Instalar job destino, política de conservación y revisar monitoreo. |
| 11 Olvidos/corrección auditada | Corrección restringida con motivo y before/after, valida secuencia temporal. | PG/WEB turno nocturno corregido, permisos. | Administrador resuelve olvidos; no se inventa hora de salida. |
| 11 Tarifa/modalidad/vigencia/almuerzo | Tarifa por empleado y snapshot del turno; hourly/per_shift con almuerzo pagado o descontado. | PG/WEB nueva tarifa no altera turno antiguo,7,5h=75.000. | Revisar tarifas/modalidades reales; no nómina legal completa. |
| 11 Horas/calculado/aprobado/ajustes | Borrador/aprobación, anticipos/bonos/ajustes, saldo con locks. | PG liquidación y concurrencia; WEB aprobación/pago. | Anticipos sobre borrador/saldo; no préstamos independientes. |
| 11 Pagos/gastos/caja/reversos | Reutiliza gasto operativo y salida de caja existentes, UUID/referencia única. | PG dos pagos compiten, un gasto/un pago; reversos; WEB MOV−75.000. | Pagos reales requieren aprobación habitual; ningún pago real ejecutado. |
| 12 Español/móvil/diseño | Navegación ERP y páginas integradas, formularios por estación y estados/error/retry. | WEB desktop/viewport390, login hidratado. | Usabilidad Android/iOS/impresora física. |
| 12 Permisos backend/políticas | RPC verifica rol, RLS por módulo y evidencia; escrituras directas bloqueadas; secretos servidor. | PG/WEB/HTTP denegación efectiva y aislamiento. | Auditoría de roles destino y credenciales Meta. |
| 12 Auditoría/cambios sensibles | before/after, actor, fecha, motivo y UUID; costos/caja con reversos, sin borrar movimientos. | PG casos auditados y concurrencia. | Retención de auditoría conforme política organizacional. |
| 12 Archivos/privacidad | MIME/firma/tamaño HTTP, buckets separados privados y comerciales públicos. | WEB Storage real, límite API y acceso autorizado; UT validación. | No subir PII en fotos comerciales públicas. |
| 12 Paginación/índices/errores | Unidades50, piezas búsqueda50, eventos/fotos100 recientes, envíos paginados e índices SQL. | PG consultas/UT límites y WEB estados. | Prueba de carga de volumen real; registros antiguos permanecen en BD aunque no en panel reciente. |
| 12 Confirmaciones contextuales | Lista venta, recarga borra borrador, correcciones y conciliación confirmadas; OTP bot conserva permisos. | WEB/HTTP confirmación real y PG doble ejecución. | Ningún cobro/conciliación se aplica por coincidencia automática. |

## 13–14. Aceptación y entrega

| Requisito | Implementación existente | Prueba ejecutada y resultado | Pendiente real |
| --- | --- | --- | --- |
| 13 Recorrido obligatorio1–28 | Suites unitarias/PG/WEB/HTTP y [matriz de28](operacion-aceptacion.md) relacionan cada paso. | Resultados reales en [verificación](verificacion-local.md); sin mocks de persistencia. | Pruebas físicas enumeradas en piloto y pruebas autorizadas de destino; no equivalen a la simulación de cámara. |
| 14 Código/migraciones/variables | Dos ramas locales revisables, ocho SQL nuevos, contratos/env sin secretos en guías. | Build/tipos/lint y tests de ambos repos. | Commit/revisión/merge/despliegue no realizados. |
| 14 Storage/jobs/contrato bot | Buckets+RLS, units/CLI revisables, conversación integrada y APIs comunes. | PG/WEB/HTTP y timer temporal local dos ejecuciones. | Instalar units y probar Meta real sólo con autorización. |
| 14 Guías/activación/desactivación | Guías por estación, piloto con seed/QR/cuentas privadas, flags y recuperación. | Seed local ejecutado; no reinicializa si existe. | Certificado/CA/red/dispositivos para piloto móvil físico. |
| 14 Respaldo/orden/recuperación | Dumps PostgreSQL, Storage y código ERP/bot privados, SHA256; restauración a DB nuevas. Ocho migraciones ordenadas en guía. | Copia duradera privada verificada; restore19 tablas por base y93 entradas Storage aprobado. | Respaldo autorizado del destino (BD/Auth/Storage/config) previo a migrar; no se obtuvo de producción. |
| 14 Informe honesto/producción intacta | Distingue implementado, probado, instalado y externo; no declara terminado el despliegue. | Logs y documentos conservados; sin producción tocada. | Aprobación y validación operativa de responsables antes de activar. |

## Ampliación de transporte solicitada después

| Requisito | Implementación existente | Prueba ejecutada y resultado | Pendiente real |
| --- | --- | --- | --- |
| Flete exacto en guía, costo al causar, provisional | Conceptos clasificados, delivery o costo de intento/retorno explícito; ledger una vez. | PG11 y WEB/HTTP ejemplo700/30/670. | Confirmar importes desconocidos en operación. |
| Efectivo recibido, no repetir flete/salida | Consignación única; costo retenido no genera salida; anticipos vinculan MOV/gasto existente. | PG costo30k+caja670k; anticipo gasto no duplica gasto/ledger/caja. | Si pago separado, usar caja existente y revisar referencia, no doble gasto. |
| Cliente/anticipo/retención separados | Responsable, settlement, cargo cliente y fuente MOV/CST independientes. | PG cliente directo, cargo incluido venta, anticipo, retención y conflicto fuente. | Revisión de históricos manuales previa adopción. |
| Diferencia desconocida pendiente | Diferencia/causa/revisión explícita; menor saldo abierto, exceso crédito sin otro cobro. | PG diferencia5k no gasto, crédito y aplicación concurrente, reverso limpia revisión. | Responsable investiga causa; no elegir gasto automáticamente. |
| Devolución/fallida sin entrega exitosa | Confirmación de transporte causado y costo retorno adicional. | PG novedad/retorno suman42k sin dinero ficticio. | No existe reintegro comercial/fiscal automático. |
| Conservar criterio anterior | Ledger/caja/gastos existentes, reverso íntegro compensado para disminuciones, adopción de costo previo. | PG correcciones netas y gasto anticipado; explicación en [transporte](transporte-rentabilidad.md). | Cambiar política de valoración/fiscal requeriría definición explícita; no se hizo. |
