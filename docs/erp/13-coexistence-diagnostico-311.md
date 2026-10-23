# Diagnóstico — Coexistence funciona con otro número pero NO con el 311

Estado: **investigación. Sin commit, sin deploy.** Solo lectura + herramientas de diagnóstico.

## Resumen ejecutivo

| Pregunta | Respuesta |
| --- | --- |
| ¿El problema del 311 es de nuestro código? | **No.** El launcher de Embedded Signup está bien construido (ver auditoría). |
| ¿Es de Meta / ownership? | **Sí, casi con seguridad: conflicto de portfolio/propiedad.** Falta confirmarlo con el script de diagnóstico (GET-only). |
| ¿Estamos lanzando Coexistence o Meta lo degrada a onboarding estándar? | Lanzamos Coexistence (`featureType: whatsapp_business_app_onboarding`, verificado por código + tests). Meta lo **rechaza** por ownership, no lo "degrada". |
| ¿En qué paso divergen A (funciona) y B (311)? | En la **selección de negocio** del asistente: el WABA del 311 pertenece al mismo portfolio que es dueño de la app, y Meta no deja incorporar como "cliente" un activo del propio dueño de la app. El script + el panel de diagnóstico lo confirman. |

Las preguntas 4–9 de "resultado final" (¿Meta ve el 311 en una WABA?, ¿cuál?, ¿hay
phone_number_id?, ¿podemos leer esa WABA?, ¿ya estamos en subscribed_apps?, ¿sigue
asociado a un portfolio?) **se responden ejecutando el script** de la sección 3 — no se
pueden responder solo leyendo código.

---

## 1. Auditoría del Embedded Signup (código)

Todas las coincidencias de los términos buscados están en:
`src/app/meta/coexistence/CoexistenceClient.tsx`, `src/lib/meta/coexistence.ts`,
`src/lib/meta/confirm.ts`, `src/lib/meta/env.ts`, `src/lib/callCoexistenceConfirm.ts`,
`src/lib/meta/{meta,coexistence,confirm}.test.ts` y `docs/erp/12-*.md`. **No hay ninguna
otra ruta** que hable con Meta-hosted signup, ni un segundo `FB.login`, ni un onboarding
estándar de reserva.

`FB.login` se construye en un solo sitio — `coexistence.ts → construirParametrosFbLogin()` —
y produce **exactamente**:

```js
FB.login(callback, {
  config_id: "<NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID>",
  response_type: "code",
  override_default_response_type: true,
  extras: {
    setup: {},
    featureType: "whatsapp_business_app_onboarding",  // FEATURE_TYPE_COEXISTENCE
    sessionInfoVersion: "3",
  },
});
```

Comprobado (tests en `coexistence.test.ts`):

- `featureType` es **exactamente** `whatsapp_business_app_onboarding`, nunca vacío ni un
  valor estándar (`"featureType es EXACTAMENTE el de Coexistence y nunca uno estándar"`).
- `extras` **no se sobrescribe**: es el objeto que devuelve `construirParametrosFbLogin`, sin
  merges posteriores.
- **No hay fallback**: si falta el `config_id`, `construirParametrosFbLogin` **lanza**
  `ErrorConfigCoexistence` y el flujo se detiene; no cae a un onboarding estándar.
- El listener de `postMessage` **filtra el origin** contra `ORIGENES_META_CONFIABLES`
  (`www/web/business/m.facebook.com`) antes de mirar el contenido.
- `interpretarMensajeEmbeddedSignup` solo reconoce `{ type: "WA_EMBEDDED_SIGNUP", event, data }`
  y **distingue** `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` (Coexistence) de `FINISH`
  estándar — el estándar **no** habilita el botón de conexión.

**Conclusión de la auditoría de código: correcto. No se aplicó ninguna corrección porque no
hay bug.**

### La única inconsistencia que el código podría tener (y ahora se vigila)

`NEXT_PUBLIC_META_APP_ID` (lo usa el navegador para `FB.init`) y `META_APP_ID` (lo usa el
servidor para el `code → token`) **tienen que ser la misma app**. Si difirieran, el popup
correría como una app y el servidor canjearía el code como otra → el `/confirm` fallaría
siempre con `APP_ID_NO_COINCIDE`. **Eso rompería el paso de confirmación, no el popup**, así
que no explica #2494064 — pero hay que descartarlo.

`src/app/meta/coexistence/page.tsx` ahora calcula server-side y pasa al navegador (sin
secretos):

```
appIdPublicoCoincideConServer : true | false | null(falta uno)
appIdPublicoPresente / appIdServidorPresente
configIdPresente
appSecretPresente (servidor)
oauthRedirectPresente
```

y el panel **"Diagnóstico técnico"** de la página lo muestra. **Verificar ahí que
`appIdPublicoCoincideConServer` sea `true`.**

---

## 2. Panel "Diagnóstico técnico" en `/meta/coexistence`

Sección desplegable nueva, **solo metadata segura** (nunca code, token, App Secret,
`authResponse` entero, cookies ni sesión):

- **Configuración**: APP ID enmascarado, `appIdPublicoCoincideConServer`, CONFIG ID
  parcial, presencia de App Secret / redirect URI, Graph version.
- **Runtime**: `origin` actual, SDK cargado, `FB.init` completado, `featureType` usado,
  `sessionInfoVersion`.
- **Cronología** (lista blanca de hitos, con ms relativos):
  `SDK_LOADED → FB_INIT → LOGIN_OPENED → MESSAGE_RECEIVED → {COEXISTENCE_FINISH | STANDARD_FINISH | CANCEL | ERROR}`.
- **Último evento de Meta**: `{ originPermitido, origin, type, event, dataKeys[], currentStep }`.
  `dataKeys` es una **lista blanca de NOMBRES** (`waba_id`, `phone_number_id`, `business_id`,
  `current_step`, `error_message`, `error_id`, …) + `otras:N`. Ningún **valor** de Meta se
  refleja: ni el texto de `error_message`, ni el número de `error_id`.
- **Comparar intentos (A vs B)**: guarda una traza por intento en `localStorage` de ESTE
  navegador (sin teléfonos completos, sin secretos) y muestra una tabla con **el campo
  exacto en el que A y B divergen**.

Campos de cada traza: `resultado`, `ultimoEvento`, `currentStep`, `wabaIdPresente`,
`phoneNumberIdPresente`, `fbLoginCodeRecibido`, `errorIdMeta` (solo si es un identificador
numérico), `codigoServidor`, `origin`, `featureType`, `sessionInfoVersion`, `hitos[]`.

**Cómo comparar**: lanzar el flujo con el número que funciona → "Guardar traza" con
etiqueta `A`. Repetir con el 311 → etiqueta `B`. La tabla dice si B se queda en
`STANDARD_FINISH`/`ERROR`/`CANCEL` y en qué `current_step`.

---

## 3. Script GET-only — `sistetecni-ai-agent/scripts/diagnostico-meta-coexistence.mjs`

Vive en el repo del **agente** porque `WHATSAPP_ACCESS_TOKEN` ya está en su `.env`. El
script **nunca imprime el token** (viaja en la cabecera `Authorization`, nunca en una URL
que se muestre; hay un filtro final `redactarPosibleToken`). **Solo hace GET.** El cliente
HTTP no tiene parámetro `method` — el verbo está fijado en el código.

```bash
cd /home/sistetecni/sistetecni-ai-agent

# El 311:
node scripts/diagnostico-meta-coexistence.mjs 1364228958481978

# El número que SÍ funciona (su WABA):
node scripts/diagnostico-meta-coexistence.mjs <WABA_QUE_FUNCIONA> --guardar=A
node scripts/diagnostico-meta-coexistence.mjs 1364228958481978    --guardar=B
node scripts/diagnostico-meta-coexistence.mjs --diff              # tabla A vs B
```

Llamadas que hace (todas **GET**):

| # | Endpoint | Para qué |
| --- | --- | --- |
| 1 | `GET /debug_token?input_token=…` | A qué **app** pertenece el token, `scopes`, y sobre todo `granular_scopes[].target_ids` → **qué WABAs/negocios alcanza el token**. |
| 2 | `GET /<WABA_ID>?fields=id,name,account_review_status,business_verification_status,ownership_type,owner_business_info,on_behalf_of_business_info` | **El negocio dueño de la WABA** y el "on behalf of". (Reintenta con menos campos si Graph rechaza alguno.) |
| 3 | `GET /<WABA_ID>/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,platform_type,name_status,account_mode` | Si el 311 aparece, su `phone_number_id`, `platform_type` (`CLOUD_API` / `NOT_APPLICABLE` / …), verificación. |
| 4 | `GET /<WABA_ID>/subscribed_apps` | **Lista** de apps ya suscritas a esa WABA (LECTURA). ¿Está la nuestra? |
| 5 | `GET /<PHONE_NUMBER_ID>?fields=…,status,platform_type,…` | Estado real del número: `CONNECTED` / `MIGRATED` / `PENDING` / … y `platform_type`. |

**GET = 5 (como mucho, + 1 por número extra). POST = 0. DELETE = 0. PUT/PATCH = 0.
`/register` = 0. `/messages` = 0.** (Tests en
`tests/unit/diagnostico-meta-coexistence.test.js`.)

`GET /subscribed_apps` es de solo lectura y no cambia nada. `POST /subscribed_apps` (el que
suscribiría de verdad) **no está en este script**.

### Qué mirar en la salida

- **`token.appId`** vs el `appId` del Embedded Signup → ¿misma app?
- **`token.granularScopes[].targetIds`** → ¿contiene `1364228958481978`?
  - **No** → el token (y probablemente la app) **no alcanza** el WABA del 311 → esto es el
    #3441038.
- **`waba.ownerBusiness.id`** del 311 vs el negocio dueño de la app ("sistetecni oficial").
  - **Iguales** → **hipótesis A confirmada**: el WABA del 311 pertenece al mismo portfolio
    que es dueño de la app → Embedded Signup no deja seleccionarlo como cliente → #3441062 /
    #2494064.
- **`waba` da 403** → no tenemos permiso de lectura → el problema es de asignación de
  activos/permiso, no de código.
- **`numeros[].platformType`** del 311:
  - `CLOUD_API` → el número **ya está en Cloud API** en esa WABA (registro pendiente o
    hecho) → Coexistence no puede "añadir" lo que ya está.
  - `NOT_APPLICABLE` / vacío → sigue siendo solo de la app → Coexistence *debería* poder.
- **`appsSuscritas`** → si nuestra app ya está, `POST /subscribed_apps` sería idempotente.

---

## 4. Hipótesis (item 9) — marcar tras ejecutar el script

| # | Hipótesis | Estado | Evidencia / cómo se confirma |
| --- | --- | --- | --- |
| A | La WABA del 311 pertenece al **mismo business owner que la app** | **PROBABLE — confirmar** | El usuario ya vio *"This Meta Business Account owns the app"* y el asistente le obligó a elegir otro portfolio. Script: `waba.ownerBusiness.id` == negocio de la app. |
| B | Quedó un WABA viejo/duplicado con el 311 | **NO DEMOSTRABLE aún** | Requiere listar todas las WABAs del portfolio (`GET /<BUSINESS_ID>/owned_whatsapp_business_accounts`, no incluido — necesita el business id y permisos). |
| C | El 311 sigue como `phone_number` dentro de una WABA vieja | **NO DEMOSTRABLE aún** | Script: `GET /1364228958481978/phone_numbers` + `GET /<PHONE_NUMBER_ID>?fields=status,platform_type`. |
| D | El número "no se liberó" al quitar un activo del portfolio | **DESCARTADA (conceptual)** | Coexistence **no** requiere liberar el número: se queda en la app. "Liberar" es de la migración tradicional. |
| E | Embedded Signup intenta **crear una WABA nueva** en vez de incorporar la app | **DESCARTADA a nivel de código** | `featureType: whatsapp_business_app_onboarding` pide explícitamente el flujo "añadir API a un número que ya usa la app". Verificado por código + tests. |
| F | El **config** detrás del `config_id` no tiene la *feature* de WhatsApp Business App onboarding habilitada | **NO DEMOSTRABLE por código** | Es una comprobación en el App Dashboard (checklist §6). |

---

## 5. El error #2494064 (item 10)

> "Este número de teléfono ya está registrado en una cuenta de WhatsApp. Para usar este
> número, desconéctalo de la cuenta actual..."

En un flujo `whatsapp_business_app_onboarding` **no debería** aparecer para un número que
está en la app. Que aparezca indica una de estas, en orden de probabilidad según la
evidencia:

1. **El asistente está operando bajo un business que NO es dueño del WABA del 311**
   (porque el dueño real es el portfolio de la app y Meta no deja elegirlo). Meta entonces
   trata el número como "registrado en otra cuenta" a la que ese business no puede acceder.
   → Coincide con #3441062 ("no está asociado con la empresa que seleccionaste").
2. **El 311 ya está registrado para Cloud API** en esa WABA (`platform_type: CLOUD_API`,
   `code_verification_status` avanzado). → El script lo dice en el paso 3/5.
3. Conflicto de ownership del propio WABA (#3441038 al leerlo).

Los tres se distinguen con el script. **Ninguno se arregla desde nuestro código.**

---

## 6. Checklist manual en Meta Developer / Business (item 11)

No se toca Meta automáticamente. Comprobar a mano:

- [ ] **App ID** del Embedded Signup == `META_APP_ID` == `NEXT_PUBLIC_META_APP_ID` (el panel
      lo dice).
- [ ] **Config ID** (`NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID`) existe **dentro de esa
      app** (App Dashboard → Facebook Login for Business → Configurations).
- [ ] Esa Configuration tiene **`whatsapp_business_app_onboarding`** entre sus *features* /
      "Assets" (no solo el WhatsApp Embedded Signup estándar).
- [ ] Producto **WhatsApp** añadido y configurado en la app.
- [ ] Dominio de producción en **App Domains** y en **Allowed Domains for the JavaScript
      SDK** (Facebook Login for Business → Settings).
- [ ] Estado de **Tech Provider / Solution Partner** de la app (Coexistence self-serve
      puede requerir que la app sea de un tipo concreto).
- [ ] En **WhatsApp Manager**, mirar el 311: ¿aparece como "WhatsApp Business app" con
      opción "Crear una API" / "Conectar a Cloud API"? ¿O ya tiene una API creada?
- [ ] **Business verification** del portfolio que se selecciona en el asistente.
- [ ] Permisos del usuario que hace el onboarding sobre el portfolio seleccionado.

---

## 7. Si NO es corregible por código — procedimiento mínimo (item 12), SIN borrar la app

El problema de raíz esperado: **la app y el WABA del 311 viven en el mismo portfolio
("sistetecni oficial"), y Embedded Signup no permite incorporar como "cliente" un activo
del dueño de la app.** El otro número funciona porque su WABA está en otro portfolio.

Opciones, de menos a más invasiva, **ninguna borra la WhatsApp Business App ni el WABA
`1364228958481978`**:

1. **Segunda app en otro Business Portfolio.** Crear una app Meta nueva cuyo dueño sea un
   portfolio **distinto** de "sistetecni oficial". Nuevo `config_id` con la feature
   `whatsapp_business_app_onboarding`. Cambiar `NEXT_PUBLIC_META_APP_ID` /
   `META_APP_ID` / `NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID` / `META_APP_SECRET` a los
   de la app nueva. En el asistente, seleccionar "sistetecni oficial" como negocio del
   cliente (ahora permitido, porque no es dueño de *esa* app). El WABA del 311 pasa a ser
   seleccionable. → **Cambio de config, no de código.** El código ya está preparado (todo
   sale de variables de entorno).

2. **Conectar la Cloud API desde WhatsApp Manager directamente.** Como el portfolio dueño
   posee la app **y** el WABA, en WhatsApp Manager → número 311 → *"Crear una API" /
   "Configurar Cloud API"* puede que permita añadir la Cloud API sin pasar por el Embedded
   Signup del navegador. Si aparece esa opción y funciona, se obtiene el `phone_number_id`
   y luego `POST /<WABA_ID>/subscribed_apps` (nuestro `/confirm`, ya implementado) suscribe
   la app.

3. **Mover el WABA `1364228958481978` a otro portfolio** (transferencia de propiedad de
   activo, reversible, sin borrar nada). El usuario ha dicho que **todavía no**. Deja el
   número en la app; solo cambia el dueño del WABA.

**Recomendación: (2) primero** (no requiere app nueva); si WhatsApp Manager no ofrece esa
ruta, **(1)**. **(3)** solo si Meta lo exige.

---

## 8. Qué NO se hizo (reglas de seguridad)

Ni DELETE de WABA, ni eliminar número, ni desvincular portfolio, ni `/register`, ni
`POST /subscribed_apps`, ni migración, ni cambio de `WHATSAPP_PHONE_NUMBER_ID` /
`WHATSAPP_ACCESS_TOKEN` / webhooks / systemd, ni tocar chats / campañas / Supabase. Solo
lectura de código, un script GET-only y un panel de diagnóstico con metadata segura.
