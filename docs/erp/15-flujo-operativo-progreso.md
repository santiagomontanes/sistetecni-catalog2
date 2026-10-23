# Flujo operativo SISTETECNI — registro de ejecución

Fecha: 2026-10-22. Rama: `erp/flujo-operativo-20261022`.
Continuación y validación final: 2026-10-23, Bogotá.

## Límites

No se aplican migraciones remotas, despliegues, mensajes reales ni documentos fiscales. Pruebas transaccionales exclusivamente con PostgreSQL Docker local y datos sintéticos. Los módulos nuevos se entregan desactivados inicialmente y conservan datos al desactivarse.

## Descubrimiento

- Único repositorio local bajo `/home/sistetecni/proyectos`: `sistetecni-catalog2` (ERP, catálogo público, API del agente WhatsApp y webhook Meta). El proceso externo del bot no está en esta carpeta.
- No existe `AGENTS.md` en el repositorio ni en sus directorios antecesores. Se leyeron las instrucciones de `supabase/migrations/README.md` y `supabase/migraciones-en-espera/README.md`.
- Stack vigente: Next.js 15, React 19, TypeScript, Supabase Auth/PostgreSQL/Storage, Zod, comprobantes PDF internos. README raíz conserva instrucciones antiguas de Firebase; no representa el sistema actual.
- Fuente única de inventario: `product_units`, productos `products`, movimientos `inventory_movements`; ventas `sales/sale_items`, compras, ledger de costos, caja, roles y auditoría existentes. No se reemplazan.
- Facturación disponible: comprobante interno, sin integración fiscal DIAN. No se presentará como factura oficial.
- Git inicial con cambios del usuario en `.gitignore`, Meta/coexistencia, sus pruebas, `tsconfig.tsbuildinfo` y documentos 13/14. Se conservan. Rama nueva sin reset, stash ni limpieza.

## Plan de entregas

1. Línea base y entorno PostgreSQL local reproducible; pruebas con salida fiable (los scripts heredados terminan en `rm`, que puede ocultar errores).
2. Taller: QR, recepción, ubicación, componentes, controles y disponibilidad sobre las unidades existentes.
3. Vinculación de dispositivos, evidencia privada, acabados y selección pública por configuración vendible.
4. Envíos, guía, recordatorios persistentes, entrega y conciliación exacta; contrato común web/agente.
5. Asistencia con foto temporal privada y cálculo configurable con snapshots históricos.
6. Pruebas de transacciones, concurrencia, permisos, regresiones y navegación; documentación de activación, recuperación y límites comprobados.

## Línea base

- `npx tsc --noEmit --incremental false`: correcto, antes de editar código.
- `npm run lint`: correcto, 9 advertencias existentes sobre `<img>`.
- Compilación de tests existente: correcta.
- 17 pruebas de protección de entorno: correctas.
- Primera ejecución unitaria en `/tmp` produjo un fallo por ruta relativa de `EnvironmentBanner.test`; repetida dentro del repo: 454 pruebas correctas. No era regresión de producto.
- Build inicial: correcto.
- Integraciones históricas que cargan `.env.local` y escriben en staging no se ejecutan automáticamente.

## Avances y decisiones

Trabajo dividido en módulos con ownership separado. Las migraciones históricas aplicadas no se editaron. Los nuevos archivos incluyen procedimiento de desactivación sin borrado.

- Taller implementado sobre `product_units`: QR atómico, recepción inmutable/correcciones, ubicaciones, piezas instaladas/sueltas, reversos de costo, controles, software y herramientas USB.
- Asistencia integrada con Storage privado real, tarifas por vigencia y snapshot, liquidación operativa, pago/reverso en caja existente y limpieza verificable.
- Envíos integrados con venta, guía, entrega, saldos, búsqueda exacta, conciliación confirmada, reversos y outbox persistente. El proceso WhatsApp fue localizado e integrado posteriormente en checkout aislado; ver continuación2026-10-23.
- Vinculación por sesión y secreto efímero de pestaña; actualización por polling autorizado, no difusión por usuario. Fotos privadas enlazadas a recepción/fase. No se promete WebSocket ni operación offline.
- Acabados por producto y configuración de cada unidad; catálogo web y PDF reciben sólo opciones vendibles. El personalizador antiguo excluye productos activados por acabado para evitar cotizar la configuración genérica.
- Ventas reutilizan su flujo y comprobante interno: precio sugerido por unidad y snapshot comercial en la línea, sin emisión fiscal.
- Reporte operativo añadido al reporte existente; serialización explícita de stock por producto preparada en migración adicional, sin modificar la propuesta histórica en espera.

## Verificación integrada (2026-10-22, Bogotá)

- `npm run test:unit`: 514/514 aprobadas; incluye regresiones anteriores y pruebas nuevas. El runner nuevo conserva códigos de salida.
- `npm run test:operational`: 31/31 pruebas Node/PostgreSQL aprobadas, 25 aserciones SQL de asistencia y 4 escenarios concurrentes aprobados. Bases sintéticas locales, no mocks de transacciones. La suite de stock invoca directamente el sincronizador con triggers deshabilitados **sólo en dos sesiones sintéticas** para probar que no depende del trigger de colores.
- Corrección de integración contable: el reporte de inventario descuenta piezas que siguen instaladas en un padre vendido/retirado. Se conserva el cálculo anterior para el resto, los costos de adquisición y el ledger; una prueba adicional efectúa instalación y venta reales y comprueba que salen 27.000 COP del valor del inventario sin modificar la evidencia de costo.
- Se detectó un defecto del fixture de envíos al pasar medianoche UTC: fecha de consignación futura respecto a Bogotá. Corregido el fixture, sin relajar la regla de negocio; suite repetida correctamente.
- `npm run test:env`: 17/17 aprobadas.
- E2E conjunto final sobre aplicación compilada: **9/9 aprobados, 44.1 segundos**, con Playwright 1.55.1 y Chromium 140; asistencia 3, envíos 2, taller 3, estética/catálogo/venta/reportes 1. Incluye foto subida desde contexto móvil visible en escritorio, cambio de ubicación, Storage real privado/público, snapshot por unidad, PDF catálogo y dos descargas del comprobante interno sin duplicar venta. Log local final: `/tmp/sistetecni-e2e-compiled.log` (los logs `verified` anteriores documentan las iteraciones de desarrollo y sus fallos corregidos).
- La corrida E2E detectó una carrera de inicialización en estética y una validación estricta incorrecta del nuevo reporte. Corregidas y repetida la suite completa, sin omitir casos.
- La repetición desde arranque en frío detectó un `SyntaxError` en bundle de desarrollo y falta de hidratación: el formulario podía enviarse nativamente. Ahora campos y botón esperan a estar listos; no cambia la autenticación. Se ejecutó y aprobó E2E sobre build compilado local (`start`), evitando recompilaciones en caliente. Un chequeo TypeScript simultáneo al arranque de Next encontró archivos `.next/types` transitorios; repetido después del build estable: aprobado, sin modificar código por ese artefacto de concurrencia.
- `npx tsc --noEmit --incremental false`: aprobado en la integración final. `npm run lint`: aprobado, únicamente las mismas nueve advertencias `<img>` de la línea base. `git diff --check`: aprobado.
- `npm run build`: **aprobado, exit code 0**, con variables sintéticas locales explícitas; se detuvo sólo el servidor Next de pruebas para evitar colisión de `.next`. Log local: `/tmp/sistetecni-build-final.log`. No hubo despliegue.
- Revisión final: build y tipos repetidos después del ajuste de galería/advertencia de margen; Taller 3/3 volvió a aprobar en 24.5 s sobre aplicación compilada. Servidor Next local detenido; contenedores y datos sintéticos conservados. Resumen: [verificacion-local.md](verificacion-local.md).
- Dependencias nuevas limitadas a QR y pruebas: qrcode/tipos, pg y Playwright. Auditoría detectó dos avisos introducidos por la versión inicial de Playwright; actualizado únicamente ese paquete a 1.55.1. Quedan 27 avisos preexistentes (5 moderados, 19 altos, 3 críticos); no se actualizó indiscriminadamente el framework ni el resto del árbol. Revisarlos por separado antes de exposición productiva.

Límites y activación: [operacion-activacion.md](operacion-activacion.md). Matriz de las 28 aceptaciones: [operacion-aceptacion.md](operacion-aceptacion.md). Cámara E2E sintética y viewport móvil **no equivalen** a ensayo Android/iOS físico.

## Pendientes

### Continuación autorizada: transporte, bot y jobs — 2026-10-23

La nueva regla de transporte reconoce el costo propio al confirmar entrega, conserva importes provisionales y concilia únicamente el efectivo/diferencias. Se implementaron migraciones adicionales **070000** y **080000**, aplicadas sólo a bases Docker locales.

- Se encontró el bot en `/home/sistetecni/sistetecni-ai-agent`, con worktrees fuera de `proyectos`. La limitación informada antes provenía de una búsqueda demasiado estrecha. Se creó `/home/sistetecni/proyectos/sistetecni-bot-operativo`, rama `erp/operacion-envios-20261023`, desde el último código rastreado de `p2029-admin` (`24c3354`); sus cambios de usuario y procesos existentes se preservaron.
- La línea base del bot necesitó corregir el runner de Node 22 y configurar repositorios ficticios de pruebas; faltaba un archivo de política comercial ya presente sin seguimiento en el worktree fuente. Se preservó exactamente su política de seis meses. Línea base recuperada: **2.770/2.770**; con los formularios de envíos: **2.776/2.776** en la primera ejecución.
- Transporte: **9/9 pruebas de persistencia PostgreSQL** aprobadas, incluido $700.000/$30.000/$670.000, provisionales, correcciones, cliente, anticipo, devolución, diferencias sin causa y concurrencia. Se detectó y corrigió un bloqueo preexistente del reverso manual de costos: `SECURITY INVOKER + FOR UPDATE` carecía de política UPDATE. Se conserva el algoritmo existente dentro de un wrapper autorizado para `profitability.manage`.
- Notificaciones: **5/5 pruebas PostgreSQL** aprobadas; RLS por destinatario, no confirmar entrega, leases, pérdida de ACK, estado incierto y rechazo de identidad/token inválidos. No hubo mensajes reales.
- Scheduler: timer de systemd de usuario **instalado temporalmente, ejecutado dos veces y detenido**, exclusivamente loopback sintético; preparo de avisos y limpieza devolvieron éxito. Los timers definitivos siguen preparados, sin instalar/activar en destino.
- Respaldo local sintético creado con dumps de ambas bases, Storage y código de ambos repositorios. Restauración independiente aprobada en dos bases `erp_restore_*`, 15 tablas verificadas por base y 66 entradas del archivo de Storage. No es un respaldo de producción; el respaldo del destino será requisito previo de activación.
- E2E de la ampliación: **9/9 aprobados, 44.4 s** antes de los últimos ajustes del taller. La integración HTTP real entre bot y ERP detectó una colisión de identificadores entre lectura auxiliar y despacho en el mismo mensaje; corregida con claves estables separadas por acción y en repetición. El adaptador de Meta de estas pruebas es sintético; Auth/API/PostgreSQL y persistencia son reales locales.

El resto de este documento conserva el historial anterior. Los pendientes previos sobre ausencia del bot y falta de imputación de transporte quedan reemplazados por esta continuación y la matriz detallada de revisión.

### Cierre de la verificación ampliada

- Transporte ampliado a **11/11 PG**: adopta gasto anticipado ya registrado sin nuevo gasto/ledger/caja, distribuyéndolo al margen; detecta CST manual previo, exige revisión y lo vincula/corrige sin duplicar. Reversar consignación elimina advertencia de diferencia anulada sin borrar costo de transporte causado. Correcciones mantienen reverso íntegro existente y sólo cambian costo neto.
- Suite global final **47/47 PG**, más25 aserciones SQL y4 escenarios concurrentes de asistencia; **514/514 UT**, **17/17 ENV**, **2.776/2.776 BOT**, **4/4 integraciones HTTP reales entre repositorios**.
- **11/11 E2E aprobados (1,9min)** sobre build compilado. La ampliación descubrió un fixture de conflicto que no seleccionaba ubicación tras recarga y un paso decimal demasiado restrictivo para corriente3,33A; corregidos y suite completa repetida sin omitir casos. Conflicto conserva borrador, rechazo de versión y recarga efectiva verificados. Recepción reutiliza STU/compra/costo existentes. Cargadores sueltos conservan V/A/W. Enlace de selfie realmente expira con archivo aún presente; después se borra y comprueba ausencia; upload pendiente tras corte también se limpia.
- Build/tipos/lint aprobados con sólo nueve advertencias previas de imágenes. Variables del build sintéticas: **nunca desplegar `.next` local**. Logs de revisión en [verificacion-local.md](verificacion-local.md).
- Piloto local creado:cuatro cuentas privadas por rol, tres QR imprimibles, cuatro ubicaciones y dos RAM4GB funcionales. Nueva ejecución conserva el estado. Configuración HTTPS de red privada preparada para los dispositivos del usuario, sin instalar CA ni exponer bases en red. [Guía de piloto](piloto-operativo.md).
- Matriz completa de secciones1–14 y transporte: [16-matriz-requisitos-operativos.md](16-matriz-requisitos-operativos.md). [Transporte](transporte-rentabilidad.md), [jobs](jobs-operativos.md), [activación/respaldo/recuperación](operacion-activacion.md).
- Proxy HTTPS local ejecutado con CA confiada sólo en proceso: Auth/REST/Storage/API correctos, sin modificar confianza del sistema. Después se completó UI de compatibilidad SATA/NVMe/IDE/SAS y voltaje/conector; build/tipos y11 E2E repetidos, aprobados con persistencia de esos atributos. `.next` final es banco sintético3100, nunca despliegue. Servidores detenidos. Respaldo durable/restore local verificados; ubicaciones vigentes en [verificación](verificacion-local.md), no es backup de producción.

No se declara finalizada la operación en destino: falta promover las ramas al proceso autorizado, configurar Meta/plantilla/destinatarios, instalar schedulers permanentes, probar dispositivos/impresión físicos y revisar reglas/tarifas por responsables del piloto. El código del bot sí está integrado y probado localmente; la API de producción y mensajes reales no se activaron. No existe integración fiscal DIAN. Migraciones/flags nuevos siguen preparados para activación gradual; sólo se activaron en el banco sintético. Ningún despliegue, migración, mensaje, cobro ni factura de producción.
