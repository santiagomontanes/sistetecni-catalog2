# Jobs: preparación, instalación y verificación

## Estado comprobado

| Componente | Código preparado | Instalado / ejecutado / verificado |
| --- | --- | --- |
| Preparación de recordatorios y notificaciones privadas ERP | SQL 020000/080000, POST `/api/admin/shipments/jobs` | Ejecutado en banco local; unicidad, permisos, leases y reinicio probados. No instalado en hosting destino. |
| Eliminación de selfies vencidas | POST `/api/internal/attendance/retention` | Storage local real: borrado y ausencia verificados, reintento idempotente. No ejecutado sobre fotos reales. |
| Orquestador ERP | `scripts/operational/run-jobs.mjs`, units en `deploy/systemd` | Timer **temporal** local instalado, dos ejecuciones correctas y detenido. Los units definitivos no están instalados. |
| Entrega WhatsApp | Bot `scripts/recordatorios-envios.mjs` y su timer | API/worker/BD probados con emisor sintético, incluso pérdida de ACK. Meta real y plantilla no activados ni probados. |

La repetición final de `npm run test:operational:scheduler` instaló temporalmente `sistetecni-operational-test-a820cf80`, dos ejecuciones; último éxito `2026-10-23T19:12:30.921Z`. Log `/tmp/sistetecni-scheduler-reviewed.log`, estado privado `/tmp/sistetecni-operational-timer-aKmKIg/state`. El timer se detuvo al verificarlo. No se modificaron servicios existentes.

## Configuración ERP

Archivo privado del usuario que ejecutará el servicio: `~/.config/sistetecni/operational-jobs.env`, permisos 0600. Usar los secretos del **destino autorizado**, nunca copiar los sintéticos de pruebas:

```dotenv
ERP_JOBS_BASE_URL=https://<dominio-erp-autorizado>
ERP_SHIPPING_CRON_SECRET=<aleatorio-minimo-32-caracteres>
ATTENDANCE_RETENTION_SECRET=<otro-aleatorio-minimo-32-caracteres>
```

Comprobar nombres efectivos en `run-jobs.mjs` antes de crear el archivo. `npm run jobs:check` sólo muestra configuración/mode sin secretos y sin ejecutar HTTP. El modo `--run` sólo acepta loopback; `--allow-remote` habilita exclusivamente HTTPS. No ejecutar ese modo contra un destino no autorizado.

Units revisables: `deploy/systemd/sistetecni-operational-jobs.service` y `.timer`. Ajustar `WorkingDirectory` al checkout autorizado; instalar **después de la aprobación de activación** en `~/.config/systemd/user/`, validar con `systemd-analyze --user verify`, `systemctl --user daemon-reload` y activar `sistetecni-operational-jobs.timer`. Verificar `list-timers`, `journalctl --user -u sistetecni-operational-jobs.service`, estado privado y un caso vencido sintético en staging. Si el hosting no usa systemd, ejecutar el mismo CLI con su scheduler autorizado, bloqueo exclusivo y los mismos secretos.

Cada cinco minutos, zona `America/Bogota`, `Persistent=true`. El runner usa flock en el unit, timeout HTTP, tres reintentos limitados y hasta 20 lotes de retención por ejecución; si hay más, continúa en la siguiente. Fallos persistentes devuelven error para alertar. El estado privado registra contadores/último éxito, nunca cuerpos de destinatarios, fotos o secretos. La limpieza de fotos debe continuar aunque se desactive la marcación de asistencia.

## Hora y calendario

Configurar hora nocturna y perfiles destinatarios desde Envíos. Cron prepara el resumen al alcanzar esa hora Bogotá, una vez por fecha; no reconstruye todos los días omitidos. Desde el registro de guía, el aviso de verificación se calcula a tres días **lunes a viernes**, manteniendo hora Bogotá. **No excluye festivos.** Nunca confirma entrega ni modifica estado logístico por el envío del recordatorio.

## Bot y proveedor

Checkout aislado: `/home/sistetecni/proyectos/sistetecni-bot-operativo`. Configurar variables ERP/HMAC existentes, `ERP_SHIPPING_REMINDERS_ENABLED=true`, `ERP_SHIPPING_REMINDER_TEMPLATE`, idioma y `ERP_REMINDER_RECIPIENTS_FILE`. El archivo privado es un array de `{ "profileId": "<uuid>", "waId": "<operador-verificado>" }`; todos deben estar vinculados, activos, autorizados y seleccionados en la configuración ERP. Mantener credenciales Meta ya existentes sin exponerlas.

El timer del bot ejecuta `recordatorios-envios.mjs --send`; sin `--send` sólo verifica requisitos. La plantilla debe estar aprobada para el texto y los destinatarios habilitados. Ese modo puede enviar mensajes reales: **no se ejecutó y requiere autorización de activación**.

La tabla persistente de entregas usa estados `ready/sending/sent/uncertain/cancelled` y tokens de intento. Antes del proveedor se registra `sending`; después se conserva su ID. Si hubo aceptación pero se perdió el ACK, el reinicio no reenvía un intento incierto. La UI Envíos permite al administrador revisar evidencia del proveedor y confirmar «enviado» o «no enviado» con motivo una vez vencido el lease. No se promete entrega exactamente una vez de un proveedor sin clave idempotente; se evita el reenvío ciego y se expone la incertidumbre.

## Desactivar y recuperar

Detener el timer de mensajes del bot detiene futuros envíos y conserva jobs/ACK. No borrar tablas para reintentar. Para ERP, conservar la limpieza de selfies: si se suspende el timer conjunto, sustituir inmediatamente por una ejecución autorizada de retención. Revisar contadores y lease antes de relanzar; nunca alterar `sending` directamente. Las pruebas locales no constituyen instalación ni vigilancia del scheduler del destino.
