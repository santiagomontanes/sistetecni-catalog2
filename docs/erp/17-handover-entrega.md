# Handover: entrega del flujo operativo y piloto físico

Fecha: 2026-10-23. Todo se verificó en BDs sintéticas locales (`erp_test`, `erp_browser`). **No se tocó producción, no se aplicaron migraciones a la BD real, no se desplegó y no se envió ningún WhatsApp real.**

## 1. Estado del código

| Repositorio | Rama | Commit | Verificación |
| --- | --- | --- | --- |
| `sistetecni-catalog2` (ERP) | `erp/flujo-operativo-20261022` | `03e842c` | lint (solo 9 advertencias `<img>` previas), `tsc` sin errores, `test:operational` (PostgreSQL) 0 fallos, **11/11 E2E Playwright** |
| `sistetecni-bot-operativo` | `erp/operacion-envios-20261023` | `bc7063e` | `npm test`: **2.776 aprobadas, 0 fallos** |

Notas:

- Las ramas no están empujadas a ningún remoto ni fusionadas a `main`; hacerlo es decisión del usuario.
- `tsconfig.tsbuildinfo` queda fuera del commit (artefacto de compilación regenerado).
- El `.next` local es un banco sintético con URLs loopback: **no es desplegable**.
- Ledger: el costo de transporte y los descuentos se vinculan, no borran salidas de caja (venta 700.000, costo 30.000 una vez, entrada 670.000 una vez).

## 2. Pasos manuales del piloto físico

Guía completa: [piloto-operativo.md](piloto-operativo.md). Resumen de lo que solo el usuario puede hacer:

1. **Escanear QR real con cámara de celular**
   - `npm run pilot:seed` (idempotente) ya generó `.operational-pilot/labels.html`: abrirlo en el navegador e imprimir al 100 %.
   - Con HTTPS ya resuelto (punto 2), abrir el ERP en el celular, iniciar sesión con la cuenta técnica de `.operational-pilot/credentials.json`, ir a `/admin/taller`, generar el código de vínculo en el computador y canjearlo en el celular (<5 min).
   - Escanear un QR libre. Si el navegador no tiene `BarcodeDetector`, usar el ingreso manual. Registrar navegador/versión/resultado de Android e iOS.
2. **Certificar HTTPS en la red local** (sin HTTPS la cámara no funciona)
   - Obtener un certificado con SAN para la IP privada del computador y su CA; instalar la CA en los dispositivos del piloto (no se instaló nada).
   - ```bash
     export ERP_PILOT_ORIGIN=https://<IP-PRIVADA>:3443
     export ERP_PILOT_TLS_CERT=/ruta/privada/certificado.pem
     export ERP_PILOT_TLS_KEY=/ruta/privada/clave.pem
     export NODE_EXTRA_CA_CERTS=/ruta/privada/ca.pem
     npm run test:operational:services
     npm run pilot:build && npm run pilot:start
     ```
   - Abrir el mismo origen en computador y celular: debe mostrarse como conexión confiable (una excepción manual no garantiza cámara). Abrir solo el puerto 3443 a la red del piloto; Auth/REST/Storage/PostgreSQL permanecen en loopback.
3. **Probar el webhook con un proveedor real de WhatsApp** (requiere su autorización explícita; hoy solo se probó con emisor sintético)
   - Plantilla Meta aprobada, número y operadores verificados, credenciales Meta ya existentes del bot.
   - Primero en modo verificación: `node scripts/recordatorios-envios.mjs` (sin `--send`, no envía). Solo después, `--send` con un único destinatario propio.
   - Recordatorio nunca marca una entrega como confirmada. Si se pierde el ACK, el envío queda `uncertain` y el administrador lo resuelve desde Envíos.
4. Recorrer la tabla del [piloto](piloto-operativo.md) (recepción → taller → estética → venta → envío → conciliación → asistencia) con datos ficticios y anotar resultados por código de unidad.

## 3. Activar los cron jobs (systemd timers) en producción

Hacerlo **solo cuando decidas activar**, y después de: respaldo recuperable, migraciones `20261023010000`…`080000` aplicadas en orden con autorización, y recarga de esquema PostgREST (`NOTIFY pgrst, 'reload schema'`). Detalle: [operacion-activacion.md](operacion-activacion.md), [jobs-operativos.md](jobs-operativos.md).

### 3.1 Jobs del ERP (preparación de recordatorios + retención de selfies)

```bash
mkdir -p ~/.config/sistetecni ~/.config/systemd/user
install -m 0600 /dev/null ~/.config/sistetecni/operational-jobs.env
cat >> ~/.config/sistetecni/operational-jobs.env <<'EOF'
ERP_JOBS_BASE_URL=https://<dominio-erp-autorizado>
ERP_SHIPPING_CRON_SECRET=<aleatorio-min-32-caracteres>
ATTENDANCE_RETENTION_SECRET=<otro-aleatorio-min-32-caracteres>
EOF
```

Los dos secretos deben coincidir con los configurados en el hosting del ERP. Luego:

```bash
cd ~/proyectos/sistetecni-catalog2
npm run jobs:check                      # solo muestra configuración, sin HTTP ni secretos
cp deploy/systemd/sistetecni-operational-jobs.{service,timer} ~/.config/systemd/user/
# Ajustar WorkingDirectory= en el .service si el checkout autorizado está en otra ruta
systemd-analyze --user verify ~/.config/systemd/user/sistetecni-operational-jobs.{service,timer}
systemctl --user daemon-reload
systemctl --user enable --now sistetecni-operational-jobs.timer
systemctl --user list-timers sistetecni-operational-jobs.timer
journalctl --user -u sistetecni-operational-jobs.service -n 50
```

Corre cada 5 min (zona `America/Bogota`, `Persistent=true`). Si el servicio debe sobrevivir sin sesión abierta: `loginctl enable-linger $USER`.

### 3.2 Worker de recordatorios del bot (envía WhatsApp real: activar al final)

```bash
cat > ~/.config/sistetecni/shipping-reminders.env   # chmod 0600
#   ERP_BASE_URL=https://<dominio-erp-autorizado>
#   ERP_AGENT_SHARED_SECRET=<secreto-compartido-existente>
#   ERP_SHIPPING_REMINDERS_ENABLED=true
#   ERP_SHIPPING_REMINDER_TEMPLATE=<plantilla-aprobada>
#   ERP_SHIPPING_REMINDER_LANGUAGE=es
#   ERP_REMINDER_RECIPIENTS_FILE=/ruta/privada/destinatarios.json
chmod 0600 ~/.config/sistetecni/shipping-reminders.env

cd ~/proyectos/sistetecni-bot-operativo
cp deploy/systemd/sistetecni-shipping-reminders.{service,timer} ~/.config/systemd/user/
systemd-analyze --user verify ~/.config/systemd/user/sistetecni-shipping-reminders.{service,timer}
systemctl --user daemon-reload
systemctl --user enable --now sistetecni-shipping-reminders.timer
```

Antes de `enable`, `ERP_AGENT_CONTROL_ENABLED=true` y los flags de envíos deben estar activos en el ERP, y cada destinatario debe estar vinculado y autorizado.

### 3.3 Desactivar

```bash
systemctl --user disable --now sistetecni-shipping-reminders.timer   # detiene los mensajes
```

No desactivar el timer del ERP sin sustituir la retención de selfies por una ejecución autorizada. No borrar tablas ni alterar filas `sending` para reintentar.

## 4. Límites que NO están certificados

Celulares/cámaras/impresora reales, hosting y HTTPS de destino, entrega WhatsApp real (Meta), emisión fiscal DIAN (solo comprobante interno) y restauración en producción. Matriz completa: [16-matriz-requisitos-operativos.md](16-matriz-requisitos-operativos.md).
