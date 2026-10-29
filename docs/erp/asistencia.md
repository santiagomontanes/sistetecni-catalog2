# Asistencia y liquidación operativa

Estado de esta entrega: código integrado en `/admin/asistencia`, migración aditiva, pruebas PostgreSQL y E2E con Auth/Storage reales locales ejecutadas. Activación inicialmente deshabilitada. No se ha aplicado ni probado en producción. Falta comprobar cámara física y compatibilidad Android/iOS: el E2E usa la cámara sintética de Chromium, indicada expresamente abajo.

## Integración y decisiones

- Identidad: `profiles` y roles existentes; no se crean empleados/usuarios duplicados. Los perfiles inactivos y `viewer` se rechazan también en el backend y SQL.
- Cada empleado consulta sus turnos, tarifas y liquidaciones. Administrador/supervisor administran tarifas, correcciones, borradores y aprobaciones. Caja puede consultar liquidaciones y realizar pagos usando el permiso existente `expenses.manage`. Caja no puede consultar selfies ajenas.
- Desembolsos: cada anticipo/pago crea **un** `operating_expenses` de categoría `nomina` y su movimiento de caja mediante el RPC existente. Los reversos usan `erp_void_operating_expense`. No existe otro libro de caja; los saldos reconocen incluso anulaciones realizadas desde el módulo de gastos.
- Todas las mutaciones pasan por `attendance_command`, que valida rol, bandera, clave UUID de idempotencia y payload. Misma clave con otro payload falla. Locks de fila y un índice parcial impiden turnos simultáneos; versión de turno impide sobrescritura silenciosa; el lock de liquidación impide sobrepago concurrente.
- Marcas ordinarias usan `now()` de PostgreSQL. Entrada, almuerzo y salida tienen constraints cronológicos. Se permite cruzar medianoche. Solo administrador/supervisor corrigen, con motivo y snapshots antes/después. No se corrige un turno incluido en una liquidación; un borrador sin pagos activos puede anularse, conservando historial, para liberar sus turnos.
- Tarifa por hora o por turno cerrado, con vigencia y opción de almuerzo remunerado. La entrada captura el snapshot vigente; cambiar tarifa no altera ese turno. Si no existía tarifa al entrar, se permite trabajar y el responsable debe asignarla con corrección auditada antes de liquidar. Un snapshot existente es inmutable.
- Cálculo: segundos enteros; pesos COP enteros; para tarifa por hora `round(tarifa * segundos / 3600)` con `numeric` SQL, redondeado por turno al peso más cercano. El período selecciona por **fecha de entrada en Bogotá**. No se fracciona un turno que cruce medianoche. Se conserva valor calculado, ajuste, valor aprobado, pago y saldo por separado. Importes HTTP viajan como texto decimal para evitar pérdidas de precisión al interpretar `bigint` en JavaScript; el formato UI usa `BigInt`.
- Bonos y ajustes requieren motivo. Los anticipos se permiten sobre un borrador ya calculado, hasta su saldo; no se implementan anticipos sin turnos registrados ni un préstamo de empleado. Pagos ordinarios requieren aprobación. Pagos parciales y reversos sí están implementados. El valor aprobado no puede ser menor que el ya pagado.
- Es un cálculo operativo configurable, **no nómina legal completa**. No incorpora recargos, prestaciones, retenciones, seguridad social ni reglas laborales inventadas.

## Evidencia privada y conservación

**Desde la migración `20261029030000` el turno inicia con la contraseña, sin cámara.** El navegador abre una sesión nueva con la contraseña del usuario y envía ese token a la API (`x-reauth-token`); la API exige que sea del mismo usuario y de menos de 2 minutos. La foto pasó a ser opcional (`evidence_id` admite nulo; turnos viejos conservan su evidencia y retención). Lo que sigue describe el flujo opcional con foto: la cámara usa `getUserMedia` con lente frontal; se ofrece captura de archivo del móvil como alternativa. HTTPS (o localhost para pruebas) y permiso del usuario son necesarios. La imagen se reduce a máximo 960 píxeles en su lado mayor y se comprime a JPEG de máximo 512 KiB. El servidor limita también el cuerpo HTTP a 600 KB antes de parsear multipart y valida tipo, tamaño y firma JPEG. Esto no es reconocimiento facial ni una garantía de identidad.

El servidor reserva primero una fila `attendance_evidence` con ruta aleatoria, propietario, tamaño, MIME y vencimiento. Luego carga el objeto y marca la evidencia lista. Si se interrumpe el proceso, la fila pendiente conserva el objeto localizable para reintento y retención. El inicio de turno solo admite evidencia del empleado, lista, no vencida y reservada durante los últimos 15 minutos. Una evidencia no se puede reutilizar en otro turno.

Bucket `attendance-private`, `public=false`, sin permisos directos de objetos para el navegador. El backend usa `SUPABASE_SERVICE_ROLE_KEY` solo después de autenticar y autorizar. La BD contiene únicamente referencias/metadatos; no almacena base64 ni binarios. La consulta de foto vuelve a evaluar RLS y emite un enlace firmado de 60 segundos. La respuesta de enlace lleva `Cache-Control: no-store` y el objeto se sube con `cacheControl: 0`; la UI usa `Image unoptimized` para evitar derivados/cachés del optimizador Next. No se generan miniaturas ni derivados del servidor. Las vistas previas locales se revocan al descartarlas.

`retention_days` admite 1–365 días; 30 por defecto. Cada foto conserva el vencimiento calculado con la configuración al capturarla: cambiar el plazo solo afecta fotos nuevas. Las fotos ya vencidas no admiten nuevos enlaces aunque el limpiador esté retrasado. Las copias que guarde el sistema operativo del teléfono están fuera del almacenamiento de la aplicación.

El proceso `POST /api/internal/attendance/retention` obtiene hasta 100 filas vencidas, elimina el objeto con Storage API, verifica su ausencia mediante listado y marca `deleted_at`, `deletion_attempts` y resultado. Si falla, conserva el pendiente y retorna HTTP 503 para reintentar. Retornar `hasMore=true` indica otro lote. Es idempotente y funciona aun con asistencia desactivada. No marca borrado solo porque venció el plazo. Los metadatos/auditoría de eliminación permanecen.

## Configuración necesaria y activación

1. Aplicar, en entorno de pruebas autorizado, `supabase/migrations/20261023030000_erp_attendance.sql` después de las migraciones existentes. Es idempotente y se ejecuta en transacción. Respetar la advertencia de la baseline del repositorio: **no aplicar la baseline de staging a producción**.
2. Mantener las variables existentes `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. Añadir `ATTENDANCE_RETENTION_SECRET` con valor aleatorio de al menos 32 caracteres, únicamente servidor y programador; no usar prefijo `NEXT_PUBLIC_`.
3. Programar una petición POST horaria a `/api/internal/attendance/retention` con `Authorization: Bearer <ATTENDANCE_RETENTION_SECRET>`. El programador debe reintentar errores y continuar lotes mientras `hasMore`. No poner el secreto literal en repositorio, URLs ni logs. La periodicidad es técnica de conservación, no una regla laboral.
4. Verificar en staging bucket privado, permisos, selfie desde celular HTTPS, consulta con sesión propia/ajena, caída tras carga, reintento, vencimiento, eliminación física y metadatos. El test SQL usa un fixture de metadatos; el E2E adicional sí carga y elimina un archivo físico en Storage real local, con cámara sintética. Ninguno sustituye la comprobación de dispositivos físicos.
5. Administrador entra a Asistencia → Configuración, establece retención y activa. Crear tarifas de las personas piloto con su vigencia real; empezar con un grupo reducido. La activación no modifica funciones antiguas de caja, usuarios o inventario.

No hay emisión de facturas, mensajes ni cambios automáticos de roles desde este módulo.

## Guía por rol

**Empleado:** abrir Asistencia, volver a escribir la contraseña (como un inicio de sesión nuevo) y pulsar «Iniciar turno». No se usa la cámara. Marcar inicio y fin de almuerzo; al terminar, confirmar salida. La hora es la del servidor. Si hubo olvido, solicitar corrección al responsable. Al reconectar la pantalla recarga el estado del servidor; no registra marcas retroactivas de forma silenciosa.

**Supervisor/administrador:** seleccionar empleado; definir tarifa con motivo/vigencia; revisar turnos, evidencia temporal y eventos. Corregir únicamente datos comprobados, con motivo. Calcular borrador por rango de fechas de entrada, registrar bonos/ajustes y revisar valor calculado antes de confirmar aprobación.

**Caja:** seleccionar liquidación; registrar anticipo o pago parcial con medio y referencia única del empleado; confirmar el importe. El gasto y la salida de caja se crean en la misma transacción. Un reverso requiere motivo y conserva el movimiento original.

La UI muestra guardando/guardado/error y falta de conexión; los errores permiten reintentar con la misma clave de operación. Las listas de turnos, liquidaciones y eventos paginan de 25 en 25. El directorio se limita a 500 perfiles y el selector de tarifas a las 50 más recientes; empresas con más empleados/tarifas requieren ampliar ese buscador. El detalle muestra hasta 1000 movimientos recientes por página y advierte si se limita; los totales y saldos se calculan en SQL sobre **todos** los pagos, sin truncarlos.

## Contrato HTTP

- `GET /api/admin/attendance?page=0&employee=<uuid>`: datos filtrados por RLS; `Authorization: Bearer <access_token Supabase>`.
- `POST /api/admin/attendance`: `{ "action": "lunch.start", "data": { "shiftId": "<uuid>", "version": 1 }, "requestKey": "<uuid estable por reintento>" }`.
- Acciones: `settings`, `rate`, `start`, `lunch.start`, `lunch.end`, `end`, `correct`, `settlement.create`, `settlement.adjust`, `settlement.approve`, `settlement.void`, `payment`, `payment.reverse`. Esquemas completos en `src/lib/attendance/validation.ts`.
- `POST /api/admin/attendance/photo`: multipart `photo` JPEG y `requestKey` UUID; devuelve `id` para `start.evidenceId`.
- `GET /api/admin/attendance/photo?id=<uuid>`: enlace efímero autorizado; 404 tanto para inexistente/vencido como sin permiso.
- `POST /api/internal/attendance/retention`: autenticación de servicio separada, solo limpieza por vencimiento, sin datos personales en la respuesta.

## Recuperación y desactivación

Desactivar en configuración o, con acceso autorizado, `update public.attendance_settings set enabled=false where singleton;`. La migración también documenta este rollback conservador. Se conservan turnos, tarifas, liquidaciones y pagos. Se puede seguir usando el ERP antiguo; **el job de retención debe seguir ejecutándose**. No borrar tablas ni anular gastos para “desinstalar” el módulo. Para corregir dinero, usar reversos explícitos del ERP.

Antes de volver a activar, revisar turnos abiertos, evidencias pendientes y jobs. Ante respuesta de red incierta, actualizar y reintentar con la misma clave; no crear un pago nuevo. Una liquidación aprobada se conserva; no se implementa reapertura/recálculo de aprobados. Los ajustes posteriores deben documentarse en otra liquidación y los pagos erróneos se reversan.

## Evidencia ejecutada y pendientes

En PostgreSQL 17 Docker local `127.0.0.1:55432/erp_test`, esquema creado desde las migraciones reales y auth/storage bootstrap sintético:

- Migración aplicada y reaplicada sin errores.
- `psql ... -v ON_ERROR_STOP=1 -f scripts/operational/attendance.sql`: **25 aserciones aprobadas**, transacción final `ROLLBACK`. Verifica hora servidor, flujo completo, versiones, cronología, medianoche, motivo/auditoría, snapshots, cálculo exacto, anticipo/pago/reverso con caja, RLS y denegación de escritura directa. La selfie lista es explícitamente un fixture de metadatos.
- `node scripts/operational/attendance-concurrency.mjs`: **4 escenarios aprobados con dos conexiones PostgreSQL reales**: entrada única, pago idempotente, dos pagos distintos compitiendo por el saldo y rechazo de sobrepago. Solo usa la BD local exacta y retira sus propios UUID sintéticos al finalizar; no toca datos de usuario.
- `node --test .tmp-test/lib/attendance/validation.test.js`: **5 pruebas unitarias aprobadas** después de compilar con `tsc -p tsconfig.test.json`.
- `npx playwright test tests/e2e/attendance.spec.ts --reporter=line`: **3 pruebas E2E aprobadas (13 segundos en la primera ejecución)** contra Next local, GoTrue Auth, PostgREST y Supabase Storage reales en Docker, con BD aislada `erp_browser`. Login UI, `getUserMedia` con cámara sintética Chromium, compresión, carga/descarga del archivo real, firma efímera autorizada y rechazo de otro usuario; entrada/almuerzo/salida y recarga persistente; corrección UI auditada cruzando medianoche, tarifa posterior sin modificar snapshot, liquidación/aprobación/pago de 75.000 y una sola salida de caja; vencimiento, rechazo de firma vencida, job que borra el archivo real, comprobación de ausencia en Storage y reintento sin duplicar.
- `npx tsc --noEmit --pretty false`: aprobado al finalizar los cambios de este módulo.
- ESLint de archivos del módulo: aprobado sin advertencias de código mediante `ESLINT_USE_FLAT_CONFIG=false npx eslint ...`. ESLint 9 avisa sobre la configuración heredada preexistente; no se actualizó el linter ni dependencias por esta tarea.

Pendientes externos concretos: cámara en dispositivos Android/iOS reales, operación bajo HTTPS en el entorno de destino, prueba del TTL firmado transcurridos 60 segundos (se verificó firma válida, duración declarada y rechazo de evidencias vencidas), comprobación de recuperación tras caída entre subida y marcado, y programador desplegado. Auth/Storage HTTP y borrado físico sí quedaron probados localmente, sin sustituir esa validación de destino. No hubo acceso, migraciones, despliegue, facturación o mensajes de producción.
