# Matriz de aceptación y evidencia

Entorno: PostgreSQL 17 aislado en Docker, bases `erp_test` y `erp_browser`; Next local, GoTrue/Auth, PostgREST y Supabase Storage reales. Datos ficticios. Cámara Chromium sintética y viewport móvil; no dispositivos físicos. Las pruebas SQL de fotos usan metadatos sintéticos explícitos, complementados por pruebas HTTP de archivos reales.

| N.º solicitado | Cobertura ejecutable | Evidencia / alcance |
| --- | --- | --- |
| 1 | `workshop.spec.ts`, `workshop.test.mjs` | Lote persistido y SVG QR imprimible; impresión física pendiente |
| 2–4 | `workshop.spec.ts`, `station-finishes.test.mjs` | Dos contextos Auth reales vinculados; misma ficha, foto subida en móvil visible en escritorio; entrada manual QR |
| 5 | `workshop.test.mjs` | Dos conexiones compiten por etiqueta; una asignación, rollback de perdedora |
| 6–7 | SQL taller + E2E taller | Recepción 1 GB inmutable; traslado, ubicación destino e historial persistidos |
| 8–10 | `workshop.test.mjs` | Retiro 1 GB, instalación de dos módulos 4 GB, total 8 GB; reintento idempotente y carrera del último componente |
| 11 | SQL taller y validadores | Programas instalados/probados, herramientas USB, controles y batería final independientes |
| 12–13 | `finishes.spec.ts`, `station-finishes.test.mjs` | Crear acabados desde web; fotos reales distintas; precio/RAM/stock por opción; venta elimina opción pública; PDF comercial generado |
| 14 | SQL/E2E taller | Controles y producto requeridos; cambio de hardware invalida; nueva definición de control obliga revalidar |
| 15–16 | `shipping.spec.ts`, `shipping.integration.mjs`, `cross-repo.integration.mjs` | Web y conversación del bot accesible en checkout aislado, HMAC/operador/confirmación y mismo RPC; guía conserva ceros y flete exacto. Meta real sin activar |
| 17–18 | `shipping/domain.test.ts`, SQL envíos | Tres días sin sábados/domingo, zona Bogotá; outbox/leases/reintentos no marcan entrega |
| 19 | SQL/E2E envíos | Entrega y neto esperado separados del recibido; fechas y neto inválidos rechazados |
| 20 | Unitarias búsqueda + SQL saldos | Única/múltiple/ninguna, exactitud BigInt, límites y exclusión de saldos conciliados |
| 21 | SQL envíos + E2E | Confirmación explícita, locks en dos sesiones, UUID y referencia evitan doble consignación; caja una vez |
| 22 | SQL envíos | Cancelación conserva venta y stock; devolución `returned`, sin reembolso ni reposición automática; parcial/reverso auditado |
| 23 | SQL envíos + E2E acabados | Venta existente, dos descargas PDF del mismo comprobante sin duplicar venta/documento; no factura fiscal |
| 24–25 | `attendance.sql`, concurrencia y E2E asistencia | Turno/almuerzo/salida, medianoche, tarifa snapshot, corrección auditada, aprobación, abono y reverso en caja |
| 26 | E2E asistencia | Compresión/carga real; enlace expira con archivo aún presente; job borra y verifica ausencia/reintento; upload pendiente tras corte también se elimina |
| 27 | SQL de los módulos + E2E Auth | Permisos efectivos, RLS, usuario distinto, misma cuenta en sesión no vinculada, secreto de pestaña, revocación y expiración |
| 28 | Runner unitario completo + SQL + E2E | Regresiones ventas/caja/comprobantes, inventario/rentabilidad con producto nulo, catálogo, cotizador, permisos y flujos anteriores cubiertos por pruebas existentes |

## Comandos y naturaleza de la evidencia

- `npm run test:unit`: lógica y regresiones, incluye mocks donde no se prueban transacciones.
- `npm run test:env`: aislamiento y configuración de entornos.
- `npm run test:operational`: conexiones PostgreSQL y transacciones reales, luego 25 aserciones SQL y cuatro escenarios concurrentes de asistencia. Los errores devuelven exit code distinto de cero; no se ocultan con limpieza final.
- `npm run test:operational:e2e`: navegador contra servicios locales reales; no intercepta RPC para simular éxito. Archivos en Storage se descargan/verifican realmente.
- `npx tsc --noEmit --incremental false`, `npm run lint`, `npm run build`: integración del proyecto; resultados consolidados en el documento de progreso.

La matriz completa con las cuatro columnas solicitadas para **todas las secciones originales** y la ampliación de transporte está en [16-matriz-requisitos-operativos.md](16-matriz-requisitos-operativos.md). No se afirma cobertura exhaustiva de navegadores, todas las caídas posibles, volumen productivo o hosting. Límites/pasos de activación: [operacion-activacion.md](operacion-activacion.md). No hay pruebas fiscales, mensajes reales, despliegue ni migración de producción.
