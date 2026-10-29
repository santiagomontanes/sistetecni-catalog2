# Operación integrada: revisión, activación y recuperación

Entrega local en rama `erp/flujo-operativo-20261022`. No ejecutar estos pasos contra producción sin autorización. El documento de ejecución y evidencias es [15-flujo-operativo-progreso.md](15-flujo-operativo-progreso.md).

## Qué se integra

El ERP y el catálogo público comparten este repositorio Next/Supabase. Taller, piezas, QR y acabados amplían `product_units` y `products`; ventas, compras, costos, caja, usuarios y comprobantes siguen siendo los existentes. Las unidades sin producto comercial están admitidas en recepción, inventario y rentabilidad; no son vendibles. El bot se encontró en `/home/sistetecni/sistetecni-ai-agent` y sus worktrees. Se integró en el checkout aislado `/home/sistetecni/proyectos/sistetecni-bot-operativo`, rama `erp/operacion-envios-20261023`, preservando los procesos y cambios del usuario en los originales.

Guías operativas y contratos: [taller](taller.md), [envíos y bot](envios.md), [asistencia](asistencia.md).

## Migraciones revisables

Aplicar en orden las **trece** migraciones nuevas `20261023010000` a `20261023080000`, `20261024010000`, `20261029010000`, `20261029020000` y `20261029030000`, después de verificar el historial del entorno y un respaldo recuperable. No reaplicar a producción las baselines ni las migraciones históricas: sus instrucciones tienen advertencias específicas. Todas las nuevas migraciones son transaccionales; sus reaplicaciones locales preservan registros y flags ya configurados.

1. Taller: tablas de evidencia, ubicaciones y QR; campos aditivos y `product_id` nullable en unidades/movimientos para recepción desconocida.
2. Envíos y conciliación: saldos, jobs y guardas de caja.
3. Asistencia: evidencias, tarifas, turnos y liquidaciones sobre caja/gastos.
4. Vinculación por pestaña/sesión y fotos privadas de unidades.
5. Acabados: publicación gradual por producto y snapshot de configuración en la venta existente.
6. Reportes operativos, exclusión del inventario valorizado de piezas instaladas en equipos vendidos/retirados y serialización explícita del stock por producto. Se conserva la función de reporte original como implementación interna, sin cambiar costos históricos. La propuesta antigua en `migraciones-en-espera` no se modificó ni se aplicó como migración histórica.
7. `20261023070000_shipping_transport_costs.sql`: conceptos de transporte, costo reconocido una vez, diferencias/credito de consignación, adopción de gasto anticipado o CST existente; wrapper autorizado del reverso sin cambiar el algoritmo anterior.
8. `20261023080000_shipping_bot_notifications.sql`: acciones auxiliares del bot, notificaciones privadas, entregas persistentes y revisión de intento incierto. Mantiene dispatcher y comandos anteriores del agente.
9. `20261024010000_workshop_qr_is_stu.sql`: **el QR impreso es el STU**. Generar un lote reserva N números de `product_unit_code_seq` y la unidad recibida nace con ese mismo `unit_code`; ya no existe un segundo código (STQ). Etiquetas anuladas o sin usar dejan huecos en la numeración. Si se recibe sobre una unidad ya registrada en Compras se conserva su STU original y la etiqueta queda como alias.

Antes de activar, refrescar el caché de esquema de PostgREST mediante el procedimiento autorizado del hosting (`NOTIFY pgrst, 'reload schema'`). No se solicita ninguna actualización de framework ni de dependencias ajenas al alcance.

## Variables y almacenamiento

Se conservan las variables existentes `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_ENV`, `NEXT_PUBLIC_APP_ENV`. La service role sólo se usa en servidor después de verificar permisos. Nunca llevarla al navegador.

Nuevas/configurables, sin valores reales en este documento:

```dotenv
ERP_SHIPPING_ENABLED=false
ERP_SHIPPING_CRON_SECRET=<secreto-aleatorio-de-al-menos-32-caracteres>
ATTENDANCE_RETENTION_SECRET=<otro-secreto-aleatorio-de-al-menos-32-caracteres>
# Sólo al activar el bot integrado autorizado:
ERP_AGENT_CONTROL_ENABLED=false
ERP_AGENT_SHARED_SECRET=<secreto-compartido-del-agente-existente>
ERP_AGENT_MAX_CLOCK_SKEW_SECONDS=300
```

Buckets creados por las migraciones:

| Bucket | Acceso | Límite por archivo | Uso |
| --- | --- | --- | --- |
| `workshop-private` | Privado, enlaces de 120 s autorizados | 5 MiB JPEG/PNG/WebP | Evidencia interna; referencia a unidad/fase/recepción |
| `catalog-finishes` | Público, sólo fotos comerciales | 5 MiB JPEG/PNG/WebP | Imágenes del acabado confirmado |
| `attendance-private` | Privado, enlaces de 60 s autorizados | 512 KiB JPEG | Selfie temporal, compresión y vencimiento |

Validación de MIME, firma binaria y límites de lectura HTTP también sin Content-Length. Los registros contienen referencias y metadatos, nunca base64/binarios de fotos. Los buckets privados no conceden acceso directo al navegador. No usar URLs públicas para documentos o evidencia interna.

La galería interna muestra las 100 fotos más recientes; las anteriores se conservan en Storage/BD. No se elimina evidencia por el límite de visualización.

No se generan derivados de selfies en servidor ni en el optimizador Next. El limpiador comprueba la ausencia del objeto antes de marcarlo eliminado. Debe continuar ejecutándose aunque se desactive asistencia.

## Jobs preparados y estado de instalación

El CLI `run-jobs.mjs` y units de systemd de usuario ejecutan preparación/notificaciones y retención cada cinco minutos, con bloqueo, reintentos y estado privado. Un **timer temporal local** se instaló, ejecutó dos veces correctamente y detuvo; los units definitivos del destino **no se instalaron**. El worker separado del bot reutiliza Meta y una plantilla aprobada; fue probado con emisor sintético, sin mensajes reales. Ante aceptación incierta queda en revisión sin reenvío ciego.

Plazo: tres días lunes-viernes conservando hora Bogotá, sin excluir festivos; el aviso nunca confirma entrega. Configuración exacta, instalación posterior a aprobación, leases, ACK y recuperación: [jobs-operativos.md](jobs-operativos.md).

## Vinculación y concurrencia

En Taller, el computador genera un código de 16 caracteres válido cinco minutos. El celular inicia sesión con la misma cuenta y canjea el código una sola vez. El enlace dura ocho horas, está restringido al `session_id` firmado de cada dispositivo y al secreto aleatorio conservado sólo en esa pestaña. No basta conocer el QR de la unidad ni ser otra sesión del mismo usuario. Recargar la pestaña requiere volver a vincularla; se puede revocar antes del vencimiento.

Sincronización mediante lectura autorizada periódica: selección/versiones cada 2 s, ficha cada 5 s y galería privada cada 15 s. No es WebSocket ni sincronización offline. Al volver la red se consulta el servidor. Las ediciones usan versión optimista y no reemplazan campos sucios por un refresco remoto. Cambiar de ficha con campos sin guardar exige confirmación.

Los QR admiten escáner nativo de cámara cuando el navegador tiene `BarcodeDetector`; el ingreso manual funciona siempre. HTTPS y permisos de cámara son necesarios en celulares. Android/iOS reales y sus navegadores siguen pendientes de ensayo de destino; viewport móvil y cámara sintética no los sustituyen.

## Estética, venta y catálogo

1. Asociar producto existente o crearlo desde el catálogo habitual.
2. Crear acabado con color base, textura/diseño y nombre independiente; subir fotos comerciales.
3. Revisar borrador de configuración física, precio y acabado; confirmar por unidad. Si faltan datos se muestran desconocidos.
4. Registrar controles obligatorios y pasar a lista para venta. Los cambios de hardware invalidan controles. Publicar por producto sólo si todas sus unidades disponibles tienen configuración validada y fotos.
5. La ficha pública muestra fotos/precio/stock de cada acabado y configuración; no ofrece preparaciones, reservas ni vendidos. La URL histórica del producto no cambia. El PDF comercial usa las mismas opciones de stock, no la RAM genérica del modelo.
6. La venta sugiere el precio comercial de la unidad y preserva configuración/acabado en su snapshot. El vendedor conserva los permisos existentes para precio/descuento; no se sobrescribe silenciosamente el importe confirmado. El comprobante existente sigue siendo interno; no se implementa ni simula emisión DIAN.

El personalizador heredado no tiene selección de unidad/acabado: excluye temporalmente productos con `finishes_enabled=true` para no cotizar su precio o especificación genéricos. Los demás productos mantienen el comportamiento anterior. La ficha pública y la venta manual sí permiten esos productos. No hay reconocimiento por imagen ni recolector de especificaciones: flujo manual completo, sin inferencias automáticas de compatibilidad ni instalaciones al escanear.

## Métricas y límites contables

En Reportes, «Consultar operación» usa el rango seleccionado (máximo 366 días). Fase/ubicación y saldos son actuales; la actividad está filtrada por fechas Bogotá. Tiempo por fase suma horas calendario de las unidades desde su incorporación al taller, no horas laborales. Detenidos excluye listos/bodega/vendidos/retirados y muestra los 100 más antiguos con total real. Fallas por lote cuenta registros manuales no aprobados, excluyendo invalidaciones automáticas; no equivale a tasa de defectos confirmados. Sin compra vinculada se indica «Sin lote asociado».

Componentes muestra instalaciones, retiros y neto; reversos son movimientos contrarios auditados. Costo de preparación usa `cost_entries`, incluidos reversos, sin inventar costo de mano de obra. Rentabilidad/resultado conocido sigue usando la valoración existente. Venta por acabado muestra subtotal de líneas, antes del descuento global: no es margen ni efectivo. Diferencia de recaudo es neto esperado menos recibido; no es una pérdida aprobada automáticamente.

El transporte asumido por Sistetecni se reconoce al confirmar entrega o al confirmar que se causó en intento fallido/retorno, con provisionalidad explícita. Sólo los conceptos descontados del recaudo reducen su neto; no crean salida adicional de caja. Conciliar registra el dinero real y deja la diferencia sin causa para revisión, sin convertirla en gasto. Un anticipo ya contabilizado como gasto se asigna a la venta sin duplicarlo. Costos antiguos se vinculan expresamente, nunca se registran retroactivamente por un backfill. Detalle, caso 700.000/30.000/670.000 y compatibilidad del reverso existente: [transporte-rentabilidad.md](transporte-rentabilidad.md).

Limitaciones deliberadas de negocio: un envío contiene todas las unidades de una venta; no divide paquetes. Contraentrega requiere venta íntegramente pendiente sin cobros previos. Sí permite consignaciones parciales y reversos posteriores. Cancelar envío no cancela venta ni repone unidades; devolución deja `returned`, nunca `available`, y no devuelve dinero automáticamente. Asistencia calcula importes operativos configurables, no una nómina legal completa. Anticipos requieren un borrador calculado con saldo; no son préstamos independientes.

## Activación gradual

1. Respaldar y ensayar recuperación en staging autorizado; revisar diferencias de esquema, roles y reglas de negocio señaladas arriba.
2. Desplegar migraciones/código **sólo con autorización**, recompilando con las variables verificadas del destino. El `.next` de la validación local contiene URLs sintéticas y **no es un artefacto para desplegar**. Inicialmente taller, envíos y asistencia quedan desactivados en sus tablas de ajustes; los productos antiguos conservan `finishes_enabled=false`.
3. Verificar login de cada rol y denegaciones con cuentas de prueba, buckets privados, índices y persistencia. Definir retención, tarifas, controles y ubicaciones del piloto.
4. Activar Taller desde administrador para una estación; probar QR impreso, cámara física, dos sesiones, conflicto, retiro/instalación y controles. Publicar acabados sólo en un producto piloto revisado.
5. Activar asistencia con pocos empleados tras revisar tarifas/vigencias y retención; probar corrección, aprobación, pago y reverso ficticios en staging.
6. Activar variable de envíos y ajuste de BD; verificar venta/guía/entrega/consignación sintéticas y costos ya existentes. Instalar jobs ERP y comprobar limpieza aunque asistencia esté apagada. Revisar/integrar la rama del bot; vincular operadores y probar firma/OTP. Activar el emisor sólo con plantilla/destinatarios verificados y autorización explícita de mensajes.
7. Promover cada módulo a producción sólo tras validación y autorización explícita. No ejecutar fixtures de pruebas allí.

## Desactivación y recuperación

Desactivar los ajustes del módulo desde configuración o SQL autorizado documentado en cada migración. Mantener las tablas, guardas, snapshots y referencias; el ERP anterior sigue disponible. Las unidades del taller deben completar sus controles para venderse aunque el módulo se desactive: desactivar no autoriza una venta insegura.

Por producto, retirar `finishes_enabled` sólo tras revisar qué precio/especificaciones heredadas reaparecerían; preferir ocultar el producto mientras se revisa. No convertir automáticamente unidades heterogéneas en un modelo homogéneo. No borrar acabados/fotos/historial para desactivar.

Ante corte de red, recargar estado y repetir la misma clave de operación. No inventar otra consignación/pago. Reversos auditados corrigen movimientos; nunca eliminar filas de caja. Restaurar un respaldo completo sólo mediante procedimiento de recuperación autorizado, incluyendo Storage consistente con la BD. No eliminar módulos para revertir pagos ni suspender el job de conservación de selfies.

## Respaldo revisable y orden de recuperación

Se ejecutaron `npm run backup:local` y `npm run restore:local -- /ruta/al/respaldo` exclusivamente sobre el contenedor etiquetado de pruebas, rechazando otras bases/puertos. Se archivaron dumps custom de `erp_test`/`erp_browser`, los objetos Storage y el código rastreado/nuevo de ambos repositorios, incluyendo el trabajo conservado. Directorios0700, archivos0600 y manifiesto SHA256. Restauración en bases nuevas `erp_restore_*`, conteos y archivo Storage verificados. Ubicación/evidencia vigentes en [verificacion-local.md](verificacion-local.md). Se excluyen `.env*`, credenciales privadas y artefactos ignorados: respaldar la configuración necesaria separadamente mediante el mecanismo seguro autorizado. No es un respaldo de producción.

Antes de activar un destino, su operador autorizado debe:

1. Registrar commit/patch exactos de ambos repositorios y versión del esquema aplicada. Comparar el diff completo con los cambios previos del usuario. Pausar productores financieros durante el corte o usar backup/PITR consistente del proveedor.
2. Crear respaldo recuperable de PostgreSQL **incluyendo Auth, ledger y auditoría**, metadatos de Storage y objetos de los buckets privados/públicos; configuración/certificados secretos cifrados por separado; estado durable del bot. Registrar fecha, hashes, destino y responsable, sin publicar secretos.
3. Restaurarlo en un entorno separado autorizado, comprobar login de cuenta de ensayo, unidades/ventas/costos/caja, evidencia de archivos y referencias, sin activar emisores ni jobs de pago. Un dump no probado no basta.
4. Mantener flags apagados. Aplicar únicamente migraciones pendientes010000→020000→030000→040000→050000→060000→070000→080000→`20261024010000`→`20261029010000`→`20261029020000`→`20261029030000`, cada archivo transaccional completo. Verificar versiones registradas y recargar esquema PostgREST. Revisar permisos y buckets. No aplicar baselines ni `migraciones-en-espera` por asociación de nombre.
5. Compilar desde fuente con **variables verificadas del destino**, probar y después activar por módulo/estación. No copiar `.next` local, builds del piloto ni URLs127.0.0.1 a hosting.

Si falla una migración, su transacción revierte; no continuar con la siguiente hasta identificar el error. Si falla la aplicación después de escrituras, apagar flags y detener el emisor, conservar guardas/tablas/ledger, recuperar la versión de código compatible y revisar operaciones en curso. Correcciones financieras usan reversos auditados. Reinstalar un dump completo encima de datos nuevos perdería movimientos posteriores: sólo recuperar el destino mediante el procedimiento autorizado con reconciliación/PITR, BD y Storage coordinados y productores detenidos. Nunca tratar un DROP de tablas como reverso de caja. Mantener el limpiador de selfies durante la recuperación y conservar `sending/uncertain` para revisar el resultado del proveedor.

## Reproducir pruebas aisladas

Requiere Node, Docker y puertos loopback 55432–55436 y 3100 libres. Los scripts no leen credenciales de producción; el servidor de prueba reemplaza explícitamente Auth/DB/Storage por URLs locales y claves sintéticas.

```bash
npm ci
npm run test:unit
npm run test:env
npm run test:operational:db
npm run test:operational
npm run test:operational:services
npx playwright install chromium
npm run test:operational:build
npm run test:operational:app -- start
# En otra terminal, misma carpeta:
npm run test:operational:e2e
```

`test:operational:db` rechaza un contenedor ya existente para no reinicializar datos. Si existe el contenedor sintético de esta entrega, arrancarlo explícitamente con Docker; no borrar volúmenes. `browser-services` conserva una base existente y registra migraciones aplicadas. Las pruebas agregan fixtures aleatorios sólo a `erp_test`/`erp_browser`. El runner E2E usa un worker; no ejecutar varios Playwright simultáneamente sobre `test-results`. Los scripts legacy que cargan staging real no forman parte del runner nuevo.

No ejecutar `next dev`, build y chequeo de tipos simultáneamente: comparten `.next`. Para reproducibilidad se recomienda E2E sobre el build local con `start`, no sobre compilaciones en caliente. El modo `dev` sigue disponible sin argumentos, pero durante validación en frío se observó un bundle de desarrollo con error de sintaxis y falta de hidratación; la suite compilada comprueba el comportamiento entregable sin modificar la versión del framework.

En las pruebas SQL de fotos se identifican explícitamente los fixtures de metadatos. Los E2E adicionales sí usan GoTrue, PostgREST y Supabase Storage HTTP reales locales y comprueban archivos. Los tests de cálculo y calendario no sustituyen esos tests transaccionales.

## Bloqueos externos y revisión previa a activación

- Bot integrado y probado localmente desde checkout aislado; su promoción al proceso existente y credenciales/plantilla Meta/destinatarios reales no se activaron ni verificaron con mensajes reales.
- Sin acceso autorizado al hosting de destino: migraciones remotas, buckets de destino, HTTPS, scheduler y recuperación allí pendientes.
- Celulares, impresora y cámaras físicas no disponibles: QR impreso y permisos/lectura Android/iOS pendientes.
- No existe proveedor fiscal conectado: sólo comprobante interno existente, sin automatizar emisión oficial.
- Quedan límites explícitos de UI/negocio descritos en los documentos de cada módulo; no se ocultan bajo «terminado».

Lista íntegra de requisitos/implementación/prueba/pendiente: [matriz completa](16-matriz-requisitos-operativos.md). Piloto preparado con datos privados y pruebas de dispositivos: [piloto-operativo.md](piloto-operativo.md).
