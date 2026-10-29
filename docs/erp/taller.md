# Taller operativo — progreso y contrato

Implementación local, sin aplicar migraciones remotas. Se reutiliza `product_units` para equipos y componentes físicos; no se crea un inventario paralelo. Los productos del catálogo se asocian cuando se conocen: la recepción admite `product_id` nulo. Los componentes recibidos dentro de un equipo conservan costo incluido en la adquisición del equipo; no se inventa una distribución. Los componentes comprados por separado conservan su costo y su instalación se registra en el ledger `cost_entries` existente, con reverso al retirar.

## Contrato coordinado

- Ficha: `/admin/taller?unit=UUID`; QR: `/admin/taller?qr=CODIGO`.
- `product_units`: `asset_kind`, `installed_in_unit_id`, `workshop_phase`, `preliminary_condition`, `location_id`, `row_version`, `component_condition`, `component_attributes`, `workshop_managed`.
- Comandos: `erp_workshop_command(p_action text,p_payload jsonb,p_key uuid)` con idempotencia persistida y comprobación de versión para edición de unidades.
- Lectura autorizada: `erp_workshop_read(p_unit_id uuid,p_search text,p_offset integer)`.
- Activación gradual: `erp_workshop_settings.enabled=false` inicialmente. Desactivar bloquea nuevos comandos y conserva todas las lecturas y datos.
- QR identifica; no concede autorización. La resolución exige permiso `inventory.read`.

## Avance

- Inspeccionados permisos ERP, stock por unidades, recepción STU, compras y ledger de costos.
- Implementados migración aditiva, RPC transaccionales, servicio autenticado y página `/admin/taller` integrada con vinculación, fotos y acabados.
- `20261023010000_erp_workshop.sql` aplicada y reaplicada únicamente en PostgreSQL local desechable: sin errores. Ninguna tabla existente se reemplaza ni se eliminan datos.
- `node --test tests/sql/workshop.test.mjs`: 10 pruebas aprobadas, ninguna omitida. Persistencia y carreras reales con dos conexiones PostgreSQL autenticadas, sin mocks de transacciones.
- `npx tsc --noEmit --pretty false`: aprobado después de integrar la página y componentes. El informe global documenta la comprobación final de toda la entrega.
- `src/lib/workshop/validation.test.ts`: pruebas de validación incluidas en el runner unitario global.
- `tests/e2e/workshop.spec.ts`: **4/4 aprobados**, también en suite conjunta11/11. Auth/REST/Storage/BD reales locales; QR/recepción, vínculo, foto móvil→computador, traslado, conflicto con borrador conservado, recarga, reuso de STU/compra/costo, cargador19,5V/3,33A/65W, controles/retiro y unidad sin producto. Cámara/impresión físicas pendientes.

## Qué prueban las transacciones

1. Dos sesiones asignan el mismo QR: una única unidad gana; la otra operación revierte completa.
2. Dos lecturas autorizadas recuperan el mismo STU, y un UPDATE de evidencia original falla incluso con el propietario de BD.
3. Movimiento registra origen y destino; guardar una versión antigua falla sin pisar cambios.
4. RAM recibida 1 GB se retira; instalar dos módulos de 4 GB deja exactamente 8 GB. Repetir la misma clave devuelve el resultado original y no repite movimientos ni costos.
5. Dos sesiones consumen el último componente: una gana. El reverso de instalación conserva adquisición y registra costo y reverso compensatorio en `cost_entries`.
6. Sin controles obligatorios no se habilita disponibilidad. Instalar Driver Booster no aprueba controles. Al aprobarlos, el stock público existente recibe el conteo real.
7. Batería final es independiente de la aparente; una corrección auditada conserva el snapshot original y exige administrador.
8. QR anulado no admite reutilización; viewer no lee evidencia ni escribe; escrituras directas a campos de taller fallan; no se borra ubicación ocupada; desactivar bloquea comandos y conserva lectura.
9. Agregar un control obligatorio invalida unidades disponibles; una reserva previa no permite vender si ahora faltan controles. Las guardas protegen disponibilidad, reserva y nueva venta, sin exigir revalidar actualizaciones de ventas históricas ya registradas.

## Guía breve por estación

La pantalla `/admin/taller` se organiza en pestañas por fase (solo distribución, sin cambios de lógica): **Fase 1 Recepción** (preparar etiquetas y ubicaciones, recepción, fotos, evidencia original, repuestos sueltos), **Fase 2 Revisión** (configuración verificada, componentes, controles, sistema y programas, USB, historial), **Fase 3 Diseño y acabado** (producto, acabado, fotos, precio) y **Fase 4 Envíos** (enlace al módulo de Envíos). La vinculación del celular, el escaneo de QR, los datos del equipo, el traslado y la lista de unidades están siempre visibles.

- Preparación (`/admin/taller` → «Preparar taller»): 1) indicar cuántos equipos llegaron y el tamaño; el sistema reserva esos STU y muestra un **PDF** de vista previa (imprimir, descargar o abrir en otra pestaña; los lotes se pueden reimprimir en «Lotes anteriores»); 2) crear ubicaciones escribiendo libremente «Ubicación» (p. ej. Mueble A) y, opcional, «Sub-posición» (p. ej. Estante 1), que se crea dentro; si la ubicación ya existe se reutiliza, y se puede escribir una ruta completa («Mueble A › Estante 1») para anidar más. El código interno se genera solo y no se muestra; en recepción y traslados se elige el lugar completo («Mueble A › Estante 1»); 3) anular etiquetas libres dañadas. Abrir cámara o ingresar el código STU impreso (el QR es el STU de la unidad). Una etiqueta libre abre recepción; una asignada abre ficha; una anulada queda bloqueada. Registrar desconocidos. Cada fila RAM/disco/cargador es una pieza física instalada. Para una unidad de Compras, introducir su **STU** en el campo opcional (también acepta UUID por compatibilidad): conserva identidad/compra/costo, sin duplicarla. Subir fotos después de recibir, en ficha privada.
- Técnico: trasladar con motivo; en «Configuración actual verificada» registrar CPU/pantalla/RAM, interfaces SATA/NVMe/IDE/SAS y voltaje/conector compatibles **realmente comprobados**; vacío significa desconocido. Retirar piezas con destino y prueba; instalar sólo repuestos sueltos funcionales. Registrar programas como instalados y probados por separado. Cambiar hardware invalida controles. El historial permite reversos compensatorios, sin borrar movimientos.
- Estética: buscar o crear producto usando el catálogo existente, crear/elegir acabado, subir fotos del acabado, revisar configuración y precio de esta unidad. Una corrección de recepción no actualiza la configuración actual.
- Control final: registrar cada control; «No aplica» requiere justificación. Batería final se conserva aparte. Cambiar a «Lista para venta» solo después de completar producto y controles. El resto de estados de venta/reserva sigue perteneciendo al ERP existente.
- Bodega: usar códigos de ubicación, incluidos padres/hijos creados inicialmente. Se puede desactivar sin perder historial; no se permite borrar ubicaciones. Los equipos preliminarmente malos entran a bodega, conservan identidad y no se ofrecen automáticamente.
- Administración: configurar controles y activar el módulo. Corregir recepción con motivo usando la herramienta auditada; es un editor explícito de los campos estructurados, restringido en backend. Guardar un control obligatorio exige nueva validación de los equipos del taller que estaban disponibles.

## Concurrencia y límites de valoración

`row_version` se incrementa en cada actualización de una unidad, incluidas las realizadas desde otros módulos. El comando exige la versión leída. El frontend no sustituye la ficha del servidor mientras hay campos en edición; muestra conflicto y pide recargar antes de reintentar. La clave UUID de operación se conserva durante reintentos de la misma petición y se almacena en BD; una clave con otro usuario o payload falla.

La disponibilidad de una pieza se representa por una única fila: `installed_in_unit_id` identifica el equipo o queda nulo si está suelta. Componentes no pueden tener estado comercial `available`, `reserved` o `sold`, ni producto público. No hay contadores de repuestos que puedan quedar negativos. Los bloqueos toman equipo/componente en orden estable.

No se ha inventado una regla de reparto del costo de compra entre piezas de un equipo: la pieza original tiene costo incremental cero, y el costo de adquisición completo sigue en la unidad de origen. El movimiento de recepción de cada componente identifica ese origen y documenta que el costo está incluido en el equipo. Los repuestos cuyo costo se desconoce siguen con adquisición nula: sus movimientos no crean un gasto imaginario; los márgenes requieren revisar los costos faltantes. Si se desea trasladar parte del costo histórico del equipo donante a otro, se necesita una política de valoración explícita y una migración contable revisada.

## Activación y recuperación

1. Revisar y aplicar las migraciones nuevas en un entorno de pruebas aislado; ejecutar las suites globales y el recorrido físico con escáner/celular.
2. No ejecutar la baseline histórica sobre producción. Seguir `supabase/migrations/README.md` y el procedimiento general de activación.
3. La tabla `erp_workshop_settings` inicia desactivada. Activar con usuario administrador desde Taller o `erp_workshop_command('configure', '{"enabled":true}', UUID_NUEVO)` después de validar el entorno.
4. El stock por unidades y los acabados conservan sus propias activaciones por producto. El módulo no cambia masivamente los productos históricos.
5. Para detener nuevos comandos: `update public.erp_workshop_settings set enabled=false` por un operador de BD autorizado, o comando `configure` con administrador. Se conservan tablas, unidades, recibos, componentes, vínculos históricos y costos.
6. No eliminar columnas ni tablas como rollback. Las guardas siguen protegiendo componentes y unidades gestionadas aunque el módulo se desactive. Las unidades históricas que nunca entraron al módulo siguen usando el flujo anterior. Las unidades ya gestionadas conservan los controles necesarios para evitar venta accidental; no se convierte una desactivación en autorización para saltárselos.

## Configuración externa y límites pendientes de verificación

No se necesitan credenciales adicionales para QR: se genera SVG localmente mediante `qrcode`. La autenticación y almacenamiento usan Supabase existentes; fotos y vinculación se documentan en el informe general. El lector QR emplea `BarcodeDetector`; cuando el navegador no lo soporta o no hay HTTPS/permisos de cámara, el ingreso manual permanece operativo. No se ha probado una cámara física ni impresión en el hardware del taller.

La configuración automática por agente de Windows y el reconocimiento por fotografía no se implementaron: el flujo manual está operativo, y escanear nunca instala ni formatea nada. La verificación de compatibilidad solo rechaza contradicciones conocidas (generación/formato de RAM, interfaz de disco y conector/voltaje de cargador cuando están registrados); con atributos desconocidos se requiere inspección humana.

La lista general pagina 50 unidades. La ficha precarga hasta 200 componentes; el buscador de repuestos consulta todo el inventario suelto por código o atributos y pagina 50 resultados. La ficha muestra 100 eventos/programas recientes; los registros anteriores permanecen en las tablas de auditoría y no se eliminan por este límite de visualización.
