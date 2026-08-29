# SISTETECNI ERP — Fase 3B: control administrativo por WhatsApp

## Arquitectura real

El webhook de Meta **sigue viviendo en** `/home/sistetecni/sistetecni-ai-agent`.
La ruta `/api/whatsapp/webhook` de esta web permanece con `WHATSAPP_WEBHOOK_ENABLED=false`.

Flujo:

`WhatsApp → sistetecni-ai-agent → intención/admin tools → API HMAC de sistetecni.com → RPC cerrado ERP → resultado → agente → WhatsApp`

El modelo Ollama nunca recibe una service role, SQL, nombres de tabla para ejecutar ni un token de usuario ERP.

## Endpoint

`POST /api/internal/erp-agent/command`

Headers obligatorios:

- `x-erp-agent-timestamp`: epoch seconds, 10 dígitos.
- `x-erp-agent-signature`: `sha256=<hex>`.

Firma:

`HMAC-SHA256(ERP_AGENT_SHARED_SECRET, timestamp + "." + rawBody)`

El servidor rechaza timestamps fuera de `ERP_AGENT_MAX_CLOCK_SKEW_SECONDS` (300 s por defecto).

## Identidad del operador

El agente envía el `waId` firmado que recibió de Meta. La API:

1. normaliza a dígitos;
2. calcula SHA-256;
3. descarta el número en claro;
4. resuelve `whatsapp_erp_operators.wa_id_hash`;
5. obtiene el `profiles.erp_role` correspondiente;
6. comprueba `erp_role_has_permission()` antes de ejecutar.

La DB nunca guarda el teléfono del operador en claro.

## Request de comando

```json
{
  "kind": "command",
  "waId": "573001234567",
  "metaMessageId": "wamid....",
  "requestId": "UUID-v4",
  "action": "inventory.summary",
  "arguments": {}
}
```

`metaMessageId` y `requestId` dan idempotencia. Un webhook/reintento no repite una mutación.

## Lecturas disponibles — se ejecutan inmediatamente

- `inventory.summary`
- `inventory.find` args: `{ "query": "STU-000123 o serial/modelo" }`
- `sales.today`
- `cash.status`
- `expenses.today`
- `purchases.recent`
- `warranties.open`
- `customers.find` args: `{ "query": "nombre/documento/celular" }`

## Escrituras disponibles — SIEMPRE requieren confirmación

### Reservar

`inventory.reserve`

```json
{
  "unitCode": "STU-000123",
  "customerName": "Cliente",
  "customerPhone": "3000000000",
  "expiresHours": 24,
  "reason": "Reserva por WhatsApp"
}
```

### Liberar reserva

`inventory.release`

```json
{ "unitCode": "STU-000123", "reason": "Cliente desistió" }
```

### Crear cliente

`customer.create`

```json
{
  "fullName": "Nombre",
  "documentType": "CC",
  "documentNumber": "123",
  "phone": "3000000000",
  "email": null,
  "address": null,
  "city": "Bogotá",
  "notes": null
}
```

### Gasto

`expense.create`

```json
{
  "category": "transporte",
  "description": "Mensajería",
  "amountCop": 25000,
  "paymentMethod": "efectivo",
  "payee": "Mensajero"
}
```

### Caja

`cash.open`: `{ "openingCashCop": 100000, "notes": null }`

`cash.close`: `{ "countedCashCop": 380000, "notes": null }`

`cash.movement`:

```json
{
  "movementType": "manual_out",
  "paymentMethod": "efectivo",
  "amountCop": 20000,
  "description": "Salida autorizada"
}
```

Para `purchase_payment` puede incluir `purchaseNumber`.

### Venta por STU

`sale.create_by_stu`

```json
{
  "unitCode": "STU-000123",
  "customerName": "Nombre Cliente",
  "customerDocument": "123456",
  "customerPhone": "3000000000",
  "customerEmail": null,
  "paymentMethod": "efectivo",
  "paymentStatus": "pagado",
  "discountCop": 0,
  "warrantyMonths": 6,
  "notes": null
}
```

`unitPriceCop` es opcional. Si se omite se usa el precio actual del producto en ERP. Si se envía, la confirmación debe mostrarlo explícitamente.

## Respuesta para escritura

```json
{
  "ok": true,
  "status": "pending_confirmation",
  "requestId": "...",
  "riskLevel": "sensitive",
  "confirmationCode": "482731",
  "confirmationSummary": "Registrar gasto $25.000 · Mensajería",
  "expiresAt": "..."
}
```

El agente debe responder al operador, por ejemplo:

`Voy a registrar gasto $25.000 · Mensajería. Para ejecutarlo responde: CONFIRMAR 482731. Vence en 10 minutos.`

## Confirmación

```json
{
  "kind": "confirm",
  "waId": "573001234567",
  "metaMessageId": "wamid.confirmacion...",
  "requestId": "UUID de la orden pendiente",
  "confirmationCode": "482731"
}
```

La DB toma row lock sobre la orden y ejecuta dentro de la misma transacción. Dos confirmaciones concurrentes no duplican el efecto.

## Cancelación

```json
{
  "kind": "cancel",
  "waId": "573001234567",
  "metaMessageId": "wamid.cancelacion...",
  "requestId": "UUID de la orden pendiente"
}
```

## Variables

Web/Vercel:

```env
ERP_AGENT_CONTROL_ENABLED=false
ERP_AGENT_SHARED_SECRET=<secreto >=32 chars>
ERP_AGENT_MAX_CLOCK_SKEW_SECONDS=300
```

Agente local:

```env
ERP_BASE_URL=https://sistetecni.com
ERP_AGENT_SHARED_SECRET=<mismo secreto>
ERP_AGENT_TIMEOUT_MS=8000
ERP_ADMIN_WHATSAPP_ACTIVO=false
```

No activar ninguno de los dos lados hasta completar STAGING.

## Registro de operador

El servidor espera el SHA-256 del número normalizado. Nunca poner el número ni su hash fijo dentro de una migración versionada.

Ejemplo local para calcularlo sin mostrar secretos distintos al propio hash:

```bash
read -s -p "Número WhatsApp administrador (solo dígitos con indicativo): " WA_ADMIN
echo
WA_HASH=$(printf '%s' "$WA_ADMIN" | tr -cd '0-9' | sha256sum | awk '{print $1}')
echo "WA_HASH=$WA_HASH"
unset WA_ADMIN
```

Luego, usando service-role desde un script server-only o SQL controlado, llamar:

```sql
select public.erp_agent_upsert_operator(
  '<PROFILE_UUID>',
  '<WA_HASH>',
  'Administrador principal',
  true
);
```

No registrar un operador apuntando a `viewer` esperando que se convierta en admin: los permisos se conservan según `profiles.erp_role`.

## Flags de activación

1. DB + API en STAGING.
2. Operador de prueba enlazado a profile de prueba.
3. Cliente HTTP del agente con tests herméticos.
4. `ERP_AGENT_CONTROL_ENABLED=true` solo en STAGING.
5. `ERP_ADMIN_WHATSAPP_ACTIVO=true` solo en la instancia de prueba del agente.
6. Pruebas read → prepare → confirm → duplicate confirm.
7. Solo después promover a Production.

El número comercial manual no se migra ni se mueve durante estas pruebas.
