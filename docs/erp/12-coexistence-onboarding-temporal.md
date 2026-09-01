# Onboarding TEMPORAL por Coexistence — `/meta/coexistence`

Estado: **borrador / no desplegado**. Sin commit, sin deploy. Kill switch apagado por defecto.

## Objetivo

Conectar a Meta Cloud API, mediante **Embedded Signup en modo Coexistence**, un número
que **ya usa la app WhatsApp Business**. Coexistence mantiene la app y la Cloud API
funcionando a la vez: **no** es una migración tradicional y **no** vuelve a registrar el
número (`/register`).

El flujo, en dos mitades, y con **una confirmación explícita** en medio:

1. **Navegador** — la página lanza el asistente de Meta (`FB.login` + eventos
   `postMessage`) y obtiene `authorization code` + `waba_id` + `phone_number_id`. **El
   `code` NO se consume todavía**: vive en memoria del componente.
2. **El administrador revisa** los IDs candidatos y pulsa **"Verificar y conectar este
   WhatsApp"**.
3. **Servidor** — `POST /api/meta/coexistence/confirm`: en **una sola request** intercambia
   el `code` por un token, lo inspecciona, exige que sea de nuestra app, comprueba que el
   `phone_number_id` pertenece a esa WABA y **solo entonces** suscribe la app SISTETECNI a
   la WABA (`subscribed_apps`). Devuelve **solo metadata no sensible**. El token muere con
   la request.

**No** se llama a `/register`. **No** se persiste el token. **No** se toca el webhook, el
`WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_WABA_ID`/`WHATSAPP_ACCESS_TOKEN` vigentes, el `.env`
ni el systemd del agente, ni Supabase. El cambio del número del agente se hace **aparte, a
mano**, tras comprobar visualmente el número conectado.

## Qué se creó

| Archivo | Rol |
| --- | --- |
| `src/app/meta/coexistence/page.tsx` | Server component. Kill switch (`coexistenceHabilitado()`) → `notFound()`. `noindex`. |
| `src/app/meta/coexistence/CoexistenceClient.tsx` | `"use client"`. SDK, `FB.init`, `postMessage`, `FB.login`, botón de confirmación explícita, POST al endpoint. Envuelto en `ProtectedAdmin`. |
| `src/lib/meta/coexistence.ts` | Lógica pura y client-safe (sin secretos): origen de `postMessage`, parseo de eventos, parámetros de `FB.login`, extracción del `code`, **`crearAcumuladorPiezas`** (getters, sin auto-disparo) y **`crearCerrojoUnaVez`** (doble clic → 1 POST). |
| `src/lib/meta/confirm.ts` | **Núcleo server-side** (`manejarConfirm`, hermético, `fetch` y autorizador inyectables). Auth → body estricto → `intercambiarCodePorToken` → `inspeccionarToken` → `listarNumerosDeWaba` → **`suscribirAppAWaba`**. |
| `src/app/api/meta/coexistence/confirm/route.ts` | `POST /api/meta/coexistence/confirm`. Envoltorio fino: kill switch, `configMeta()`, tope de body, JSON. `runtime="nodejs"`, `dynamic="force-dynamic"`, `no-store` + `noindex`. |
| `src/lib/callCoexistenceConfirm.ts` | Helper cliente: adjunta `Authorization: Bearer <session.access_token>` (este proyecto no usa cookies) y hace el `fetch`. |
| `src/lib/meta/{confirm,coexistence}.test.ts` | Tests `node --test` (entran en `npm run test:meta`). |

`confirm.ts` reutiliza **sin duplicar** `src/lib/meta/graph.ts`
(`intercambiarCodePorToken`, `inspeccionarToken`, `listarNumerosDeWaba`, `suscribirAppAWaba`).
El callback OAuth alojado existente (`/api/meta/whatsapp/callback`) **no se toca** y sigue
sin llamar nunca a `suscribirAppAWaba` (test en `meta.test.ts`).

### Qué pasó con `/api/meta/coexistence/exchange`

La fase anterior creó `/exchange` (verificar sin suscribir). Mantener **dos** endpoints
casi iguales en producción invita a errores. **Decisión: retirado.** Su núcleo
(`manejarExchange`) se fusionó dentro de `manejarConfirm`, que hace lo mismo y además
suscribe en la misma operación. Se borraron `src/app/api/meta/coexistence/exchange/`,
`src/lib/meta/exchange.ts`, `src/lib/meta/exchange.test.ts` y
`src/lib/callCoexistenceExchange.ts`. Hay un test (`confirm.test.ts`) que verifica que la
ruta `/exchange` ya no existe.

## Variables de entorno

| Variable | Ámbito | Secreto | Uso |
| --- | --- | --- | --- |
| `META_COEXISTENCE_ENABLED` | server-only | no | Kill switch. Solo `"true"` habilita página y endpoint. |
| `NEXT_PUBLIC_META_APP_ID` | público (navegador) | **no** | `FB.init({ appId })`. |
| `NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID` | público (navegador) | **no** | `config_id` de `FB.login`. |
| `NEXT_PUBLIC_META_GRAPH_API_VERSION` | público, opcional | no | Versión que inicializa el SDK. Default `v23.0`. |
| `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_API_VERSION`, `META_OAUTH_REDIRECT_URI` | server-only | `META_APP_SECRET` **sí** | Ya presentes para el callback OAuth. El endpoint los usa vía `configMeta()`. |

Prohibido para siempre en el navegador: `META_APP_SECRET`, `NEXT_PUBLIC_META_APP_SECRET`,
`WHATSAPP_ACCESS_TOKEN`, `service_role`, cualquier token permanente.

`NEXT_PUBLIC_META_APP_ID` puede tener el mismo valor que `META_APP_ID` — el App ID no es
secreto; se usa una variable `NEXT_PUBLIC_` aparte solo porque Next no inyecta en el bundle
de cliente las variables sin ese prefijo.

## Código exacto de `FB.login`

`src/lib/meta/coexistence.ts → construirParametrosFbLogin()` produce EXACTAMENTE:

```js
FB.login(callback, {
  config_id: "<NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID>",
  response_type: "code",
  override_default_response_type: true,
  extras: {
    setup: {},
    featureType: "whatsapp_business_app_onboarding",
    sessionInfoVersion: "3",
  },
});
```

`featureType` es **exactamente** `whatsapp_business_app_onboarding`. Con cualquier otro
valor Meta lanza el onboarding estándar (número nuevo), que no es lo que queremos.

## Eventos `postMessage` y flujo del `code`

Listener con filtro estricto de `origin` (`ORIGENES_META_CONFIABLES`) →
`interpretarMensajeEmbeddedSignup` reconoce `{ type: "WA_EMBEDDED_SIGNUP", event, data }`.
Solo `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` aporta `waba_id`/`phone_number_id` (saneados
a `^\d{1,32}$`); `FINISH` estándar, `CANCEL`, `ERROR` **no habilitan el botón**.

**El `code`:**

- lo saca `extraerCodigoFbLogin()` (el componente nunca toca `authResponse`);
- vive **solo** en el acumulador (`crearAcumuladorPiezas`) — una variable JS;
- **nunca** en estado de React, `localStorage`, `sessionStorage`, cookie, URL, consola,
  Supabase ni analytics; **no se muestra**;
- se **consume en el servidor** al pulsar el botón, no antes;
- tras la respuesta (éxito o fallo) el componente llama `acc.reiniciar()` → se descarta.

**`code` vencido / usado.** Es de un solo uso y caduca en ~30 s. Si Meta lo rechaza, el
endpoint devuelve `INTERCAMBIO_FALLIDO` (o `CODE_INVALIDO`). La UI muestra *"El código de
autorización venció. Vuelve a iniciar la conexión con Meta."* y ofrece **relanzar Embedded
Signup** (code nuevo). **No se reintenta automáticamente el mismo code.**

## Confirmación explícita (UI)

Antes del botón, la página muestra: **WABA ID candidato**, **Phone Number ID candidato**, y
la advertencia:

> Meta identificó estos activos. Al continuar se verificará que pertenecen a esta app y, si
> todo es correcto, se suscribirá la app SISTETECNI a esta cuenta de WhatsApp.

**Botón "Verificar y conectar este WhatsApp"** — habilitado solo cuando hay `code` +
`wabaId` + `phoneNumberId` procedentes de un evento
`FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`. **No se dispara nada automáticamente.**

Al pulsar: el cerrojo (`crearCerrojoUnaVez`) bloquea el botón en el acto → **una sola
petición** aunque se haga doble clic o React re-renderice.

## Endpoint `POST /api/meta/coexistence/confirm`

Envoltorio fino (`route.ts`) sobre `src/lib/meta/confirm.ts → manejarConfirm()`.

**Auth server-side autoritativa.** Este proyecto **no usa cookies de sesión**: el navegador
manda `Authorization: Bearer <session.access_token>` y el servidor lo valida con
`requireAdmin(token)` (`src/lib/personalizadorAdmin/auth.ts` — el mismo helper que usa
`/api/admin/sales/[id]/pdf`). `requireAdmin` verifica el JWT contra Supabase
(`auth.getUser`) y exige `profiles.is_admin` o un `erp_role` activo distinto de `viewer`.
**No** se confía en ningún booleano del navegador, ni en `ProtectedAdmin`, ni en un
`userId` enviado por el cliente.

**Body — EXACTAMENTE** `{ code, wabaId, phoneNumberId }`, Zod `.strict()`: `code` string
`[A-Za-z0-9_.\-]{10..2048}` (**nunca se registra**), `wabaId`/`phoneNumberId` `^\d{1,32}$`.
Cualquier propiedad de más (`token`, `appSecret`, `businessId`, `redirectUri`, `configId`,
URL, teléfono…) → `BODY_INVALIDO`. Tope `MAX_BYTES_BODY` = 8 KB, aplicado antes de parsear.

### Secuencia server-side (misma request, este orden)

```
1. kill switch (coexistenceHabilitado)
2. requireAdmin(bearer)
3. Zod .strict()
4. token = intercambiarCodePorToken(code, { config })      → oauth/access_token
5. meta  = inspeccionarToken(token, { config })             → debug_token
       exigir meta.esValido === true          → si no: TOKEN_INVALIDO
       exigir meta.appId === config.appId     → si no: APP_ID_NO_COINCIDE
6. numeros = listarNumerosDeWaba(wabaId, token, { config })  → <WABA_ID>/phone_numbers
       exigir numeros.find(n => n.id === phoneNumberId)  → si no: PHONE_NUMBER_NO_PERTENECE_A_WABA
7. SOLO AHORA:
   exito = suscribirAppAWaba(wabaId, token, { config })     → <WABA_ID>/subscribed_apps
       exigir exito === true                  → si no: SUBSCRIPCION_FALLIDA
8. respuesta saneada
```

Si **cualquiera** de 4–6 falla, `subscribed_apps` **nunca se llega a pedir** (tests en
`confirm.test.ts` que graban las URLs). El orden exacto y "1 sola llamada a
`subscribed_apps`" también se verifican.

**Respuesta OK** (200):

```json
{ "ok": true,
  "suscrito": true,
  "verificado": {
    "appIdCoincide": true, "tokenValido": true,
    "wabaId": "...", "phoneNumberId": "...",
    "displayPhoneNumber": "...", "verifiedName": "..." },
  "siguientePaso": "CAMBIAR_NUMERO_AGENTE" }
```

**Errores** — `{ ok: false, codigo }`. Nunca mensaje/URL/body de Graph, nunca `code`,
nunca token, nunca stack trace:

| codigo | HTTP | |
| --- | --- | --- |
| `AUTH_REQUIRED` | 401 | sin bearer / sesión inválida o caducada |
| `FORBIDDEN` | 403 | sin permisos de admin |
| `COEXISTENCE_DISABLED` | 404 | kill switch off |
| `BODY_INVALIDO` / `CODE_INVALIDO` | 400 | body / `code` mal formados |
| `INTERCAMBIO_FALLIDO` | 422 | Meta rechaza el `code` (caducado/usado) |
| `TOKEN_INVALIDO` | 422 | `debug_token` → `is_valid: false` |
| `APP_ID_NO_COINCIDE` | 422 | el token es de otra app |
| `WABA_INVALIDA` | 422 | Graph falla al listar la WABA |
| `PHONE_NUMBER_NO_PERTENECE_A_WABA` | 422 | el `phone_number_id` no está en esa WABA |
| `SUBSCRIPCION_FALLIDA` | 422 | `subscribed_apps` → `success !== true` o 4xx |
| `META_TIMEOUT` | 504 | timeout de Graph |
| `META_ERROR` | 502 | red / respuesta corrupta de Graph |
| `ERROR_INTERNO` | 500 | config server-side ausente, fallo inesperado |

**El token** existe solo en una variable local de `manejarConfirm`: no se devuelve, no se
registra (`confirm.ts` no tiene ni un `console.`), no se persiste, no va a cookies ni a
`localStorage`. El log del route lleva **solo** `codigo=<interno>` y `ms=<n>`.

## Idempotencia / doble solicitud

- **Cliente**: el botón se bloquea en el acto (`crearCerrojoUnaVez` — `intentar()` devuelve
  `true` una sola vez). Test: 10 clics seguidos → un solo `true`.
- **Servidor / code**: el `code` es de un solo uso. Una segunda petición de `confirm` con
  el mismo `code` **falla en el paso 4** (`INTERCAMBIO_FALLIDO`) y **nunca llega a
  `subscribed_apps`**. Esa es la protección natural; no hace falta un lock server-side.
- **`subscribed_apps` repetido**: según la **documentación de Meta**,
  `POST /<WABA_ID>/subscribed_apps` es **idempotente** — llamarlo con la app ya suscrita
  responde `{ "success": true }` igual. **No verificado contra Meta real** (los tests son
  herméticos). Por eso, si un segundo `code` válido llegara a suscribir de nuevo, el
  resultado sería el mismo `suscrito: true`. Si en la práctica Meta devolviera un error de
  "ya suscrita", caería en `SUBSCRIPCION_FALLIDA` y habría que ajustar el mapeo — queda
  anotado aquí para revisarlo con la primera ejecución real.

## Número visible — comprobación humana

Tras `listarNumerosDeWaba`, la respuesta incluye `displayPhoneNumber` y `verifiedName`, y
la UI los muestra en grande:

> **Número conectado:** `<displayPhoneNumber>`

**No se compara contra ningún teléfono hardcodeado.** El administrador confirma
visualmente que es el número nuevo esperado **antes** de tocar producción.

## Todavía NO se cambia el agente

Aunque la suscripción salga bien, **no** se modifica `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_WABA_ID`, `WHATSAPP_ACCESS_TOKEN`, el `.env` del agente ni systemd. La UI lo dice
explícitamente:

> WhatsApp quedó conectado a la app de Meta. El agente todavía continúa atendiendo el
> número anterior.

El cambio del número del agente es un paso manual y controlado posterior: cambiar
`WHATSAPP_PHONE_NUMBER_ID` en el `.env` del agente y reiniciar. El filtro por
`phone_number_id` (ya en `master` del agente) hace que a partir de ese momento se atienda
el número nuevo y se ignore el antiguo.

## Seguridad aplicada

- Kill switch server-only (`coexistenceHabilitado()`) → 404 en página y endpoint.
- Endpoint: auth **server-side** con `requireAdmin` (JWT verificado contra Supabase).
- Página: `ProtectedAdmin` (sesión ERP no `viewer`) — capa adicional, no la única.
- `robots: noindex, nofollow`; endpoint `Cache-Control: no-store` + `X-Robots-Tag`.
- Al navegador solo llegan APP ID y CONFIG ID (públicos). Cero secretos, cero token.
- Filtro estricto de `origin` en el listener de `postMessage`; body con Zod `.strict()`.
- El `code` no entra en estado de React, no se registra, y el servidor no lo refleja jamás.
- `suscribirAppAWaba` se llama **solo** desde `confirm.ts` y **solo** tras verificar
  (tests). `/register` **no se llama ni se menciona** en ningún camino (tests). Sin
  escritura en Supabase. Webhook y agente intactos.

## Cómo probar en local

1. En `.env.local`:
   ```
   META_COEXISTENCE_ENABLED=true
   NEXT_PUBLIC_META_APP_ID=<app id real>
   NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID=<config id real>
   # server-only, ya presentes para el callback OAuth:
   META_APP_ID=<mismo app id>
   META_APP_SECRET=<app secret real>
   META_GRAPH_API_VERSION=v23.0
   META_OAUTH_REDIRECT_URI=http://127.0.0.1:3000/api/meta/whatsapp/callback
   ```
   > `configMeta()` exige `META_OAUTH_REDIRECT_URI` aunque el endpoint no lo use (admite
   > `http` solo contra loopback). Si falta una variable server-only → `500 ERROR_INTERNO`
   > y el log lleva **solo el nombre** de la que falta.
2. `npm run dev`, entrar con un usuario admin/ERP válido, ir a
   `http://localhost:3000/meta/coexistence`.
3. Verificar: SDK "inicializado", stepper de 5 pasos, advertencia de Coexistence.
4. Tras el asistente: aparecen los IDs candidatos + advertencia + botón. Nada se
   auto-ejecuta.
5. Sin sesión → `AUTH_REQUIRED`. Usuario `viewer` → `FORBIDDEN`.
6. Tests: `npm run test:meta` (72 tests). El endpoint se prueba entero de forma hermética
   (`src/lib/meta/confirm.test.ts`): no hace falta Meta real.

Meta settings (dominio en *App Domains* y *Allowed Domains for the JavaScript SDK*) está
**fuera de este encargo**; se hace aparte al activar el flujo.

## El token — por qué NO se persiste

En esta fase el business token **muere al terminar la request** de `confirm`. Como la
suscripción se hace **en esa misma request**, no hace falta guardarlo. Persistir un token
permanente solo se justificaría si el agente tuviera que hacer llamadas Graph recurrentes
por su cuenta; hoy no es el caso, y añadir un almacén de secreto en reposo (cifrado,
rotación, refresco de long-lived token) sin esa necesidad es superficie de riesgo
injustificada. Encaja con el patrón ya establecido (`callback.ts`: «el token es efímero y
no se persiste»).

## Qué falta para completar Coexistence real

1. ~~Endpoint server-side de intercambio del `code`.~~ **HECHO.**
2. ~~Suscribir la app a la WABA (`subscribed_apps`).~~ **HECHO** — dentro de
   `/api/meta/coexistence/confirm`, tras verificar, en una sola operación explícita.
3. ~~Filtro de `phone_number_id` en el agente local.~~ **HECHO — en `master` de
   `/home/sistetecni/sistetecni-ai-agent`.**
4. **Cambio manual del número del agente.** Cuando el administrador confirme visualmente
   que el número conectado es el correcto: cambiar `WHATSAPP_PHONE_NUMBER_ID` (y, si
   procede, `WHATSAPP_WABA_ID`) en el `.env` del agente y reiniciar. Paso a mano,
   deliberado, fuera de esta web.
5. **Registro del número para Cloud API en Coexistence** — lo hace el propio Embedded
   Signup con `featureType: whatsapp_business_app_onboarding`. **No** `POST /<PHONE_NUMBER_ID>/register`.
6. **Revisar el comportamiento real de `subscribed_apps`** en la primera ejecución contra
   Meta (ver «Idempotencia» arriba): confirmar que responde `{success:true}` y ajustar el
   mapeo de errores si Meta devuelve algo distinto para "ya suscrita".
7. **Limpieza.** Cuando el número de Coexistence quede operativo: borrar
   `src/app/meta/coexistence/**`, `src/app/api/meta/coexistence/**`,
   `src/lib/meta/{coexistence,confirm}*.ts`, `src/lib/callCoexistenceConfirm.ts`,
   `coexistenceHabilitado` de `src/lib/meta/env.ts` y las variables
   `META_COEXISTENCE_ENABLED` / `NEXT_PUBLIC_META_*` de los entornos.
