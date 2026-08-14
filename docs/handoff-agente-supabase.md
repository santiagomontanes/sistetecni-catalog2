# Handoff — agente de IA (WhatsApp) ↔ Supabase producción

**Propósito:** especificación funcional para conectar `~/proyectos/sistetecni-ai-agent` a los datos reales de SISTETECNI. No es una guía de implementación paso a paso del agente — es el contrato que ese repo debe respetar frente a Supabase producción y frente a la lógica determinista ya construida en `sistetecni-catalog2`.

**Estado al momento de escribir esto:** `~/proyectos/sistetecni-ai-agent` no existe todavía en este servidor (no se encontró en `~/proyectos/`). Este documento es la especificación a seguir cuando ese repo se cree o se clone, no la auditoría de un código existente.

---

## 1. Fuente de verdad

**Supabase PRODUCCIÓN** (proyecto `fxbtubhhevbigflsyvqz`) es la única fuente de verdad para productos, precios, upgrades, compatibilidades y cotizaciones. Ningún dato comercial vive en un JSON, SQLite u otro catálogo local del agente — si `sistetecni-ai-agent` hoy usa algo así, es deuda a resolver en la fase de conexión (sección 13), no algo que se ignore ni se mantenga en paralelo indefinidamente.

---

## 2. Tablas relevantes

### `products` (existente, extendida en B8)
Catálogo real de equipos. Campos clave para el agente:

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | nunca se expone en lenguaje natural al cliente — usar `title`/`code` según corresponda |
| `title`, `brand`, `model`, `cpu`, `condition` | text | descriptivos, texto libre |
| `ram` | integer | RAM actual instalada, GB |
| `storage` | text | almacenamiento actual, texto libre (ej. "500 GB") |
| `price` | numeric | precio base actual — **solo válido para cotizaciones nuevas, nunca para releer una cotización ya emitida** (ver sección 8) |
| `stock` | integer | 0 = agotado. El agente nunca ofrece un producto con `stock = 0` como disponible para compra inmediata |
| `visible_web` | boolean | `false` = no debe mostrarse ni ofrecerse por ningún canal, incluido el agente |
| `cpu_generation` | integer \| null | null = no confirmado. **Nunca inferir** desde `cpu`/`title` |
| `gpu_type` | 'integrada' \| 'dedicada' \| null | null = no confirmado |
| `gpu_model` | text \| null | informativo |
| `touch_screen` | boolean | ⚠️ default `false` a nivel de esquema para productos preexistentes al B8 — **no es garantía de verificación manual por producto**, ver `docs/fase2b-b8-cierre-produccion.md` §6 |
| `screen_size_inches` | numeric \| null | null = no confirmado |
| `storage_gb` | integer \| null | **campo crítico**: el motor de matching lo trata como `0` si es `null`, y se evalúa en toda búsqueda sin excepción. Un producto sin `storage_gb` nunca puede recomendarse |

### `upgrade_options` (nueva, B8)
Catálogo administrable de upgrades posibles (RAM o almacenamiento), independiente de cualquier producto.

| Campo | Notas |
|---|---|
| `category` | `'ram'` \| `'storage'` |
| `label` | texto visible al cliente, ej. "16 GB RAM" |
| `value` | capacidad final resultante, GB |
| `interface` | solo aplica a `storage` (ej. "NVMe"), null si no aplica |
| `extra_cost` | **único** campo usado en el cálculo de precio al cliente |
| `component_cost`, `install_cost` | internos, informativos — el agente nunca los expone al cliente |
| `active` | `false` = no ofrecer, aunque exista compatibilidad registrada |

### `product_upgrade_options` (nueva, B8)
Compatibilidad explícita producto↔upgrade. **Ausencia de fila = upgrade NO disponible para ese producto**, sin excepción — nunca se infiere por categoría o modelo. `active=false` en una fila también invalida la compatibilidad aunque exista el registro.

### `quote_requests` (nueva, B8)
Cotizaciones con **snapshot congelado**. Campos clave: `code` (identificador público, formato `COT-XXXXXX`, el único dato que un cliente da por WhatsApp), `product_id`, `is_special_request`, `base_price_snapshot`, `base_config_snapshot` (jsonb), `selected_upgrades_snapshot` (jsonb), `estimated_price`, `status` (7 estados: `nueva`, `en_revision`, `contactada`, `cotizada`, `aceptada`, `rechazada`, `expirada`), `expires_at` (7 días desde creación). **Sin policy de lectura pública** — ver sección 11.

### `business_profile` (existente)
Fila única (`id=1`). Contiene `phone_whatsapp`, `email`, `address`, `hours`, `instagram`, `facebook`, `tiktok`, `map_link`, `company_name`, `description`. El agente **debe leer esto en vez de hardcodear** cualquier dato de contacto — es exactamente el mismo principio que ya se aplicó en el frontend (`getBusinessProfile()`, nunca un número de WhatsApp fijo en código).

### Relaciones
```
products (1) ──< product_upgrade_options >── (1) upgrade_options
products (1) ──< quote_requests   (product_id, nullable si is_special_request)
```

---

## 3. Arquitectura objetivo

```
WhatsApp
   ↓
Webhook / backend del agente
   ↓
Comprensión de intención (LLM)
   ↓
Tool layer determinista (Node)
   ↓
Repositories
   ↓
Supabase PRODUCCIÓN
   ↓
resultado estructurado
   ↓
LLM redacta respuesta en lenguaje natural
   ↓
WhatsApp
```

**El LLM nunca consulta Supabase directamente.** Toda lectura/escritura pasa por la tool layer, que decide qué operación está permitida y con qué credenciales.

---

## 4. Tools propuestas

| Tool | Entrada | Salida | Tabla/repo | Lectura/Escritura | Privilegio | Errores esperados |
|---|---|---|---|---|---|---|
| `buscar_productos()` | filtros (ram mín, storage mín, presupuesto, marca, etc.) | lista de productos que cumplen (usa el motor determinista existente, no un query ad-hoc) | `products` + motor de matching (`src/lib/personalizador/matching.ts`) | lectura | anon/RLS pública suficiente | ninguno crítico — lista vacía es una respuesta válida |
| `obtener_producto()` | `product_id` o `title` exacto | detalle de un producto (respetando `visible_web`, `stock`) | `products` | lectura | anon/RLS pública | `NOT_FOUND` si no existe o no es visible |
| `buscar_equipos_compatibles()` | `product_id`, requisito de upgrade | lista de upgrades compatibles activos para ese producto | `product_upgrade_options` + `upgrade_options` | lectura | anon/RLS pública | lista vacía si no hay compatibilidad registrada — **nunca inventar una** |
| `consultar_upgrades()` | categoría opcional (`ram`/`storage`) | catálogo de upgrades activos | `upgrade_options` | lectura | anon/RLS pública | ninguno crítico |
| `consultar_compatibilidad()` | `product_id` | mapa completo de qué upgrades aplican a ese producto | `product_upgrade_options` | lectura | anon/RLS pública | lista vacía es válida |
| `consultar_cotizacion()` | `code` (ej. "COT-A8K31F") | snapshot completo: producto, config, precio final, estado, vigencia | `quote_requests` | lectura | **service_role o Route Handler server-side** — sin lectura pública en esta tabla | `NOT_FOUND` si el código no existe; marcar como expirada si `expires_at < now()` sin borrar el registro |
| `actualizar_estado_cotizacion()` *(privilegiada, futura)* | `code` o `quote_id`, nuevo `status` | confirmación | `quote_requests` | **escritura** | admin-equivalente — requiere la misma verificación `is_admin` que ya usan las Server Actions del panel (`src/app/admin/personalizador/actions.ts`), nunca abierta al flujo conversacional sin control | `FORBIDDEN` si no cumple el nivel de privilegio; `INVALID_TRANSITION` si el cambio de estado no tiene sentido (ej. reactivar una `expirada`) |

`actualizar_estado_cotizacion()` se documenta pero **no se implementa en esta fase** — es la única tool de escritura de todo el conjunto, y debe tratarse con el mismo nivel de control que ya existe en el panel admin.

---

## 5. Regla fundamental

El agente (el modelo de lenguaje) **nunca inventa**:
- precio
- stock
- especificaciones
- compatibilidad
- upgrades
- código de cotización
- estado de cotización

El modelo únicamente: (1) comprende lenguaje natural, (2) decide qué tool solicitar y con qué parámetros, (3) redacta la respuesta usando los resultados estructurados que la tool le devuelve. Supabase + la lógica determinista existente (motor de matching, snapshot, generación de código) siguen siendo la única autoridad — el agente reutiliza esa lógica via tools, no la reimplementa ni la aproxima.

---

## 6. Cotizaciones — regla de snapshot

Si un cliente da un código de cotización, el flujo es siempre:

```
cliente: "Tengo la cotización ABC123XYZ"
   ↓
consultar_cotizacion("ABC123XYZ")
   ↓
→ snapshot guardado (base_config_snapshot)
→ precio final guardado (estimated_price, NUNCA recalculado)
→ configuración guardada (selected_upgrades_snapshot)
→ estado actual (status) y vigencia (expires_at)
   ↓
respuesta al cliente
```

**Nunca recalcular una cotización existente con el precio actual del producto.** Si `products.price` cambió desde que se creó la cotización, el snapshot sigue siendo la verdad para esa cotización específica — exactamente el mismo invariante que ya protege `docs/fase2b-b8-cierre-produccion.md` §5 a nivel de código en la web.

---

## 7. Productos — reglas de respeto

El agente debe respetar, sin excepción:
- `stock` — no ofrecer como disponible inmediato lo agotado.
- `visible_web` — no ofrecer lo no visible.
- Specs confirmadas vs. `null` — un campo `null` nunca se completa por inferencia del agente, igual que el motor de matching ya lo trata como "no cumple" cuando el cliente pide un requisito específico.
- Compatibilidad registrada — si `product_upgrade_options` no tiene fila activa para un producto+upgrade, esa combinación **no existe** para el agente, sin importar qué tan "lógica" parezca.

---

## 8. `business_profile`

Toda información de contacto/comercial configurable (WhatsApp, horario, dirección, redes) debe leerse de `business_profile` en tiempo real, nunca hardcodearse en el código o en el prompt del agente. Si el negocio cambia de número o de horario, debe reflejarse sin tocar el código del agente — mismo principio que ya rige `NavbarLogoClient`, `WhatsAppButton`, etc. en el frontend.

---

## 9. Seguridad del agente

- `SUPABASE_SERVICE_ROLE_KEY` **nunca** se copia al prompt del LLM, nunca entra en su contexto, nunca se escribe en logs, nunca se envía a un proveedor externo (incluido Ollama si se usa local), nunca se expone al frontend/cliente de WhatsApp.
- Solo la tool layer (código Node determinista) puede tocar Supabase. El modelo solo ve las tools disponibles y sus resultados ya estructurados — nunca una URL, una key, ni un error crudo de Postgres/PostgREST.
- Preferir **anon key + RLS** para toda operación que pueda hacerse con ese nivel de privilegio (todas las lecturas de `products`, `upgrade_options`, `product_upgrade_options` — ya tienen policy de lectura pública).
- `service_role` únicamente para lo que estructuralmente lo requiere: leer `quote_requests` por código (sin policy pública, por diseño — ver migración `20260812223300_quote_requests.sql`) y, en el futuro, `actualizar_estado_cotizacion()`.
- Este es el mismo modelo de privilegio mínimo que ya se aplicó en Fase 0.1 al resto del esquema — no es una regla nueva para el agente, es continuidad del mismo estándar.

---

## 10. Conexión futura — variables probablemente necesarias

**No se conecta nada en esta fase.** Cuando llegue el momento, `sistetecni-ai-agent` probablemente necesitará (nombres conceptuales, sin valores):

```
APP_ENV=production
SUPABASE_URL=...              # mismo proyecto que sistetecni-catalog2 producción
SUPABASE_ANON_KEY=...         # para las tools de solo lectura con RLS pública
SUPABASE_SERVICE_ROLE_KEY=... # server-only, solo para consultar_cotizacion() y futura escritura
```

Antes de fijar esta lista, **auditar el repo `sistetecni-ai-agent` cuando exista** para confirmar qué variables usa realmente su stack (framework, runtime, si ya tiene su propio cliente Supabase o hay que introducirlo) — esta lista es una hipótesis de partida, no una prescripción cerrada.

---

## 11. No duplicar fuente de verdad

Si `sistetecni-ai-agent`, al auditarse, resulta estar usando un catálogo local (JSON, SQLite, o cualquier otra fuente propia) para productos/precios: **no migrarlo en la fase de conexión inicial**, pero dejar registrado que la fase siguiente debe evaluar y reemplazar esa fuente por Supabase. El objetivo final es una sola fuente de verdad — nunca `Supabase → catálogo A` y `JSON/otro → catálogo B` con datos comerciales potencialmente distintos entre sí.

---

## 12. Referencias cruzadas

- Motor de matching determinista (reutilizable por las tools): `src/lib/personalizador/matching.ts`, `src/lib/personalizador/upgradeSelection.ts`
- Generación de código de cotización: `src/lib/personalizador/code.ts`
- Snapshot: `src/lib/personalizador/snapshot.ts`
- Server Actions admin (mismo patrón de verificación `is_admin` a replicar para `actualizar_estado_cotizacion()`): `src/app/admin/personalizador/actions.ts`
- Cierre de B8 y estado real de datos al momento de este handoff: `docs/fase2b-b8-cierre-produccion.md`
- Diseño funcional original del personalizador: `docs/fase2a-personalizador-diseno.md`
