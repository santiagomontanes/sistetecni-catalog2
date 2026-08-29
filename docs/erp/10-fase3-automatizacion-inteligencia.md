# SISTETECNI ERP — Fase 3: Automatización e inteligencia

Estado al iniciar: Fase 1 cerrada ✅ · Fase 2 cerrada ✅ · STAGING activo · producción fuera de alcance sin aprobación explícita.

## Objetivo

Conectar el ERP con WhatsApp y con el agente de SISTETECNI sin permitir que una IA escriba directamente en tablas ni que un webhook externo salte las reglas transaccionales ya construidas.

La Fase 3 queda dividida en cuatro bloques:

- **3A — WhatsApp ↔ ERP**
- **3B — Agente IA ↔ inventario/ventas**
- **3C — Notificaciones automáticas**
- **3D — Alertas y automatizaciones internas**

---

## Auditoría de lo existente

El repo ya contiene una integración Meta para **Embedded Signup / onboarding**, no para operación diaria:

- `src/app/api/meta/whatsapp/callback/route.ts`
- `src/lib/meta/callback.ts`
- `src/lib/meta/env.ts`
- `src/lib/meta/graph.ts`
- tests de seguridad en `src/lib/meta/meta.test.ts`

Invariantes existentes que se conservan:

1. `META_APP_SECRET` es server-only.
2. El callback nunca registra `code`, token ni App Secret.
3. Graph tiene timeout y saneamiento de errores.
4. El token obtenido durante onboarding es efímero y no se persiste.
5. `suscribirAppAWaba()` existe, pero el callback actual **no lo llama**.
6. El onboarding tiene kill switch y no se mezcla con Supabase.

Conclusión: **no convertir el callback OAuth en webhook operativo**. Crear una ruta y módulos independientes para mensajes.

---

# 3A — WhatsApp ↔ ERP

## Alcance

### Entrada

Webhook específico, por ejemplo:

`/api/whatsapp/webhook`

Responsabilidades:

- GET de verificación del webhook.
- POST de eventos.
- validar autenticidad/firma antes de procesar contenido.
- aceptar duplicados de Meta sin duplicar efectos en ERP.
- responder rápido al webhook y separar recepción de procesamiento.
- nunca registrar tokens ni cuerpos completos con datos sensibles.

### Credenciales

Para una única operación SISTETECNI, los secretos operativos viven en variables server-only, no en tablas:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_WABA_ID`
- se reutiliza `META_APP_SECRET` para las verificaciones que correspondan.

Los IDs no son secretos por naturaleza, pero se mantienen server-side por simplicidad operativa. El access token nunca se guarda en Supabase ni se expone al navegador.

### Persistencia aditiva propuesta

Nueva migración, sin modificar migraciones aplicadas:

#### `whatsapp_events`
Ledger de eventos entrantes/status recibidos.

Campos previstos:

- `id`
- `meta_event_key` UNIQUE — clave de idempotencia
- `event_type`
- `phone_number_id`
- `wa_message_id`
- `from_wa_id` pseudonimizado/normalizado según necesidad operacional
- `payload_safe` JSONB reducido; nunca token/secret
- `processing_status`: received | processing | processed | ignored | failed
- `attempt_count`
- `received_at`
- `processed_at`
- `last_error_code` saneado

#### `whatsapp_conversations`
Estado mínimo de conversación, sin usarlo como fuente de verdad de inventario/ventas.

- `wa_id`/identificador normalizado
- posible `customer_id` enlazado al ERP
- estado de conversación
- `last_inbound_at`
- `last_outbound_at`
- `human_handoff`
- metadatos no sensibles

#### `whatsapp_outbox`
Cola transaccional para mensajes salientes.

- `id`
- `dedupe_key` UNIQUE
- `customer_id` opcional
- `destination_wa_id`
- `message_kind`
- `template_name` opcional
- `payload`
- `status`: pending | sending | sent | delivered | read | failed | cancelled
- `meta_message_id`
- `attempt_count`
- `next_attempt_at`
- `created_at`, `sent_at`

No se envía a Meta dentro de una transacción que cambie inventario. El ERP confirma primero su transacción y crea el outbox; el envío ocurre después. Así una caída de Meta no revierte una venta o una reserva.

### Idempotencia

Reglas obligatorias:

1. El mismo evento de Meta puede llegar varias veces.
2. Una reserva/venta/garantía solo puede mutar una vez por `request_id`/`confirmation_id`.
3. `wa_message_id` no debe producir dos respuestas ni dos mutaciones.
4. Los reintentos de outbox no crean mensajes lógicos duplicados gracias a `dedupe_key`.

---

# 3B — Agente IA ↔ ERP

## Principio de seguridad

**El modelo nunca recibe acceso directo a Supabase ni ejecuta SQL.**

El agente usa herramientas deterministas y estrechas.

### Herramientas de solo lectura

- buscar productos disponibles
- consultar STU disponible/reservado
- consultar especificaciones y precio
- consultar cotización por código
- consultar estado de pedido/venta permitido para el cliente
- consultar garantía por referencia permitida

### Herramientas de escritura

Toda escritura pasa por operaciones ERP existentes o wrappers nuevos con:

- schema estricto
- confirmación cuando corresponda
- idempotency key
- actor_type/channel = `whatsapp`/`whatsapp_agent`
- audit event
- ninguna escritura libre del modelo

Primeras escrituras candidatas:

- crear/enlazar cliente
- crear reserva de STU
- liberar/cancelar reserva autorizada
- generar cotización
- abrir solicitud de garantía (sin cerrar ni aprobar costos por IA)

### Acciones que NO se delegan al agente

- cambiar costos o rentabilidad
- registrar/reversar caja
- pagar proveedores
- modificar roles
- cerrar garantías con costo
- eliminar/corregir ledgers
- vender un STU sin el flujo de confirmación definido

---

# 3C — Notificaciones automáticas

Eventos ERP que pueden crear outbox automáticamente:

- reserva creada → confirmación al cliente
- reserva próxima a vencer → recordatorio
- venta confirmada → confirmación/resumen
- garantía recibida → acuse de recibo
- garantía lista → aviso de recogida
- devolución/caso actualizado → aviso permitido

Toda notificación debe ser idempotente. Ejemplo de `dedupe_key`:

`warranty-ready:<case_id>:<event_id>`

---

# 3D — Alertas y automatizaciones internas

Alertas propuestas:

- STU disponible sin vender durante N días
- reserva vencida o próxima a vencer
- stock de un producto llega a 0
- garantía abierta supera antigüedad objetivo
- margen conocido por debajo del umbral
- compra recibida con costos incompletos
- movimiento/outbox de WhatsApp fallido repetidamente

Las alertas se almacenan como entidades con estado (open/acknowledged/resolved) para no notificar lo mismo en cada ejecución.

---

# Arquitectura de flujo

## Consulta de inventario

Cliente WhatsApp → webhook → dedupe → conversación → agente → herramienta `buscarInventario` → lectura ERP → respuesta → outbox → Meta.

## Reserva

Cliente confirma → agente crea `request_id` → RPC de reserva ERP → audit event + outbox en misma transacción lógica → worker envía confirmación → status de Meta actualiza outbox.

## Garantía

ERP cambia GAR a lista → regla 3C crea outbox idempotente → envío WhatsApp → status de entrega se registra sin alterar el estado económico de la garantía.

---

# Orden de implementación

1. **3A.1** Configuración server-only + validación del webhook.
2. **3A.2** Tablas de eventos/conversaciones/outbox + RLS/guards.
3. **3A.3** Ingesta idempotente de eventos.
4. **3A.4** Cliente de envío Graph con timeout/redacción/reintentos seguros.
5. **3A.5** Procesador/outbox y estados sent/delivered/read/failed.
6. **3B.1** Contratos de herramientas de lectura del ERP.
7. **3B.2** Herramientas de mutación con confirmación/idempotencia.
8. **3B.3** Orquestador del agente desacoplado del proveedor/modelo.
9. **3C** Reglas de notificación ERP → outbox.
10. **3D** Motor de alertas internas.
11. Tests unitarios + integración STAGING + build.
12. Producción únicamente con aprobación explícita.

---

# Criterios de cierre de Fase 3

- un webhook duplicado no duplica efectos;
- inventario respondido por el agente sale del ERP actual, no de memoria del modelo;
- un STU reservado/vendido no se ofrece como disponible;
- una mutación del agente usa RPC transaccional + auditoría;
- caída de Meta no revierte transacciones ERP;
- outbox reintenta sin duplicar intención;
- ningún secreto aparece en DB, logs, errores o cliente;
- notificaciones de garantías/reservas son idempotentes;
- alertas internas no se repiten sin control;
- tests y build verdes;
- STAGING verificado antes de producción.
