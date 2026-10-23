# Resultado de verificación local

Última revisión:2026-10-23. Rama `erp/flujo-operativo-20261022`. [Evidencia estructurada con resultados y SHA256 de logs/archivos](evidencia-operativa-20261023.json).

| Verificación | Resultado observado |
| --- | --- |
| Unitarias y regresiones (`test:unit`) | 514 aprobadas, 0 fallos |
| Aislamiento de entorno (`test:env`) | 17 aprobadas, 0 fallos |
| Node/PostgreSQL (`test:operational`) | **47 aprobadas, 0 fallos**; incluye transporte11 y notificaciones5 |
| Asistencia SQL | 25 aserciones aprobadas, transacción descartada |
| Asistencia concurrente | 4 escenarios aprobados con conexiones independientes |
| E2E sobre Next compilado, Auth/REST/Storage reales locales | **11 aprobados, 0 fallos, 1,9min**: asistencia4, taller4, envíos2, acabados1 |
| Bot: suite completa en checkout aislado | **2.776 aprobadas, 0 fallos**, 51,6s; baseline recuperada2.770 |
| Integración HTTP entre bot y ERP | **4 aprobadas, 0 fallos**, Auth/HMAC/API/BD reales, emisor Meta sintético |
| TypeScript global después de build estable | Aprobado |
| Lint global | Aprobado; 9 advertencias anteriores de imágenes |
| Build local aislado | Aprobado, exit code 0; sin despliegue |
| `git diff --check` | Aprobado |
| Units definitivos ERP/bot: `systemd-analyze --user verify` | Aprobados, **sin instalar** los definitivos |
| Timer local temporal | Instalado y ejecutado2 veces correctamente, después detenido |
| Piloto sintético | Seed ejecutado:4 cuentas,3 QR,4 ubicaciones,2 RAM4GB; reintento conserva el estado |
| Proxy HTTPS del piloto | Ejecutado en localhost con CA temporal confiada sólo en proceso; Auth/REST/Storage/API servidor aprobados |
| Restricción de origen del piloto | 5 orígenes HTTPS privados admitidos,6 externos/inseguros rechazados, incluido hostname engañoso `10.evil.example` |

La revisión final incorporó el transporte según la regla solicitada: venta700.000, costo30.000 una vez y entrada670.000 una vez, sin salida adicional. Verificado por PG, navegador e integración del bot. Se probaron provisionales, correcciones, flete del cliente, anticipo manual, anticipo ya contabilizado como gasto, adopción/corrección de CST previo, retorno/entrega fallida, diferencia desconocida, exceso/crédito, reversos, concurrencia y permisos. El reporte conserva el criterio anterior y señala conceptos pendientes.

El nuevo E2E de conflicto conserva borrador y rechaza guardar versión antigua; recarga confirmada trae el servidor y reinicia campos. Recepción reutiliza STU/compra/costo. Cargador19,5V/3,33A/65W se guarda desde UI. En asistencia se esperó el TTL real del enlace firmado: expiró mientras el archivo seguía presente, antes de verificar el borrado real. También se limpió un upload persistido como pendiente tras corte. La primera ejecución ampliada encontró un paso decimal de corriente demasiado restrictivo y un fixture de conflicto sin ubicación seleccionada; se corrigieron y pasaron los11 casos completos, sin omitirlos.

El bot conserva su menú/operaciones existentes. El checkout fuente carecía de un archivo rastreado de garantía ya presente entre los cambios del usuario; se conservó su política de seis meses en el checkout aislado. Se corrigió sólo el runner de pruebas Node22 y la configuración fake de tests para obtener baseline. Después de integrar envíos pasan las2.776 pruebas completas. HTTP detectó y corrigió la colisión de IDs entre lectura auxiliar/despacho de un mismo mensaje; reintentos ahora se separan por acción.

El timer temporal `sistetecni-operational-test-a820cf80` ejecutó dos corridas loopback con éxito final `2026-10-23T19:12:30.921Z`; contadores preparados0/notificaciones0/mensajes0, retención examinados0/borrados0/fallos0. El borrado de archivos sí se probó por separado en E2E. Los units permanentes no están instalados/activados en el destino; los mensajes Meta reales tampoco se probaron.

Respaldo final local sintético: `/home/sistetecni/respaldo-erp-operativo-20261023-FDaZGi/snapshot` (copia duradera privada del dump generado en `/tmp/sistetecni-operational-backup-aRxkt8`, incluye los últimos campos de compatibilidad). PostgreSQL de ambas bases, objetos Storage y archivos de fuente ERP/bot con manifiesto SHA256; copia duradera verificada contra todos los hashes. Directorio0700 y manifiesto0600. La restauración independiente comprobó **19 tablas en cada base** y los objetos Storage; bases/ruta/conteos finales en la evidencia JSON y `/tmp/sistetecni-restore-complete-final.log`. Fuentes archivadas verificadas por hash; bases originales preservadas. No es respaldo de producción; `.env*` y credenciales privadas están excluidas y requieren custodia aparte.

Se verificó el proxy HTTPS en localhost: Auth, REST, Storage y API servidor, con certificado confiado sólo en proceso. No se instaló confianza en sistema ni teléfonos. Después se completaron los campos UI de compatibilidad de disco/cargador, se recompiló y se repitieron **los11 E2E**, todos aprobados; guardan/verifican atributos reales desde formulario. **La `.next` final vuelve a ser el banco sintético3100, nunca un artefacto para desplegar.** Para piloto físico hay que recompilar con `pilot:build` y su origen HTTPS. Servidores detenidos, contenedores/bases/seed conservados.

Se corrigieron durante la ejecución errores reales de integración: selección inicial de estética, validación del reporte, precio/configuración por unidad en venta, fotos y tipos de unidades sin producto, aislamiento de vínculos sin token, concurrencia de stock y valoración de piezas instaladas ya vendidas. Los fixtures también se corrigieron para fechas Bogotá y selectores accesibles no ambiguos. No se omitieron pruebas para ocultar fallos.

La corrida en desarrollo caliente y un chequeo de tipos concurrente con el arranque de Next tuvieron errores de bundles/archivos generados. La validación entregable se repitió con build local y `next start`, sin cambiar la versión del framework. El formulario de acceso impide interacción previa a la hidratación.

Logs finales de esta continuación:

- `/tmp/sistetecni-unit-final.log`, `/tmp/sistetecni-env-review.log`, `/tmp/sistetecni-operational-reviewed-final.log`.
- `/tmp/sistetecni-bot-final.log`, `/tmp/sistetecni-crossrepo-reviewed-final.log`.
- `/tmp/sistetecni-e2e-compatible-final.log`, `/tmp/sistetecni-build-compatibility-final.log`, `/tmp/sistetecni-types-compatible-final.log`, `/tmp/sistetecni-lint-reviewed.log` (lint también aprobado dentro del último build).
- `/tmp/sistetecni-scheduler-reviewed.log`, `/tmp/sistetecni-pilot-seed.log`, `/tmp/sistetecni-pilot-https-proof.log`.
- `/tmp/sistetecni-backup-complete-final.log`, `/tmp/sistetecni-restore-complete-final.log`.

Son temporales; resultados, comandos, alcance y límites quedan persistidos en este repositorio. Las iteraciones fallidas anteriores no se presentan como corrida final.

Estos resultados no certifican dispositivos físicos, hosting remoto, entrega WhatsApp real ni emisión fiscal. No se ejecutaron pruebas destructivas sobre datos reales. Producción no fue migrada ni desplegada; no hubo mensajes, facturas ni cobros reales. Revisar [matriz completa](16-matriz-requisitos-operativos.md), [piloto](piloto-operativo.md) y [activación/respaldo/recuperación](operacion-activacion.md).
