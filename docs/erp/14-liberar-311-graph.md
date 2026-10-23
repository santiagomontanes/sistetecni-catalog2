# ¿Se puede liberar el 311 por Graph API sin borrar su WhatsApp Business App?

Estado: **investigación read-only. Sin commit, sin deploy.** Se ejecutaron llamadas
**GET reales** contra Graph (autorizadas explícitamente por el encargo); **0 POST, 0
DELETE**.

## Resumen ejecutivo

| Pregunta | Respuesta |
| --- | --- |
| ¿Se encontró el 311 por Graph? | **No.** Ni en las 3 WABAs `owned` del portfolio, ni en `client` (vacío), ni en la WABA antigua conocida (`1364228958481978`, no legible). |
| ¿`/deregister` aplica hoy? | **No demostrado.** No se puede confirmar que el 311 tenga un registro Cloud API activo en ninguna WABA visible por Graph con el token actual. |
| ¿Es peligroso intentar algo ahora? | Sí — **no hay un `phone_number_id` confirmado** sobre el que operar. Cualquier operación sin ese dato sería a ciegas. |
| ¿Operación mínima recomendada? | **Ninguna por Graph todavía.** Revisar en la UI de Meta (WhatsApp Manager / Business Settings) el estado real de la WABA `1364228958481978` y la asignación de activos del System User. |
| ¿Por código o por UI? | **Por UI de Meta**, en esta fase. El código ya tiene preparado (sin ejecutar) el `/deregister` guardado para cuando haya un `phone_number_id` confirmado. |

---

## 1. Llamadas GET realizadas (reales, contra Meta)

Con `node scripts/diagnostico-meta-coexistence.mjs` desde `sistetecni-ai-agent`, usando
`WHATSAPP_ACCESS_TOKEN` del `.env` del agente (nunca impreso):

| # | Llamada | Resultado |
| --- | --- | --- |
| 1 | `GET /123654613862575/owned_whatsapp_business_accounts` | 3 WABAs: `1521…14` (SISTETECNI_), `2101…67` (Test WhatsApp Business Account), `2179…77` (Sistetecni) |
| 2 | `GET /123654613862575/client_whatsapp_business_accounts` | `[]` (vacío) |
| 3–5 | `GET /<WABA_ID>/phone_numbers` para las 3 WABAs owned | 1 número cada una; **ninguno termina en 6339** |
| 6 | `GET /1364228958481978` (WABA antigua conocida en Business Manager) | **HTTP 400, código 100, subcódigo 33** — *"Object with ID '1364228958481978' does not exist, cannot be loaded due to missing permissions, or does not support this operation."* |
| 7 | `GET /1364228958481978/phone_numbers` | mismo 400/subcódigo 33 |
| 8 | `GET /1364228958481978/subscribed_apps` | mismo 400/subcódigo 33 |
| 9 | `GET /debug_token` (varias veces, una por invocación del script) | token `SYSTEM_USER` de la app **SISTETECNI Agente IA**; scopes `business_management, whatsapp_business_management, whatsapp_business_messaging, public_profile`; `granular_scopes` presentes pero **sin `target_ids`** en ninguno de los tres |
| 10 | `GET /<WABA_ID>` + `/phone_numbers` completo de `1521…14` | WABA `SISTETECNI_`, `owner_business_info` = `1236…75` (sistetecni oficial), 1 número `CLOUD_API`/`CONNECTED`, **app ya suscrita** |
| 11 | Ídem de `2101…67` | WABA de prueba de Meta (`Test WhatsApp Business Account`) — es la misma que usa `scripts/lib/review.mjs → DEMO.WABA_ID` |

**Total: 17 GET. 0 POST. 0 DELETE. 0 `/register`. 0 `/deregister`. 0 `/subscribed_apps`
(POST).** (Confirmado también por los tests herméticos — ver §6 — que verifican que el
cliente nunca puede emitir otra cosa que GET.)

---

## 2. ¿Se encontró el 311?

**No.**

- Las **3 WABAs `owned`** del portfolio `123654613862575` tienen, cada una, **1 solo
  número**, y ninguno termina en `6339`:
  - `1521…14` "SISTETECNI_" → número terminado en `…50`, `CLOUD_API`, `CONNECTED`, **app
    ya suscrita**. (Coincide con el número de producción actual del agente, `+57 314 …
    2250` — el "314" de la documentación previa.)
  - `2101…67` "Test WhatsApp Business Account" → es el WABA/número de **prueba de Meta**
    (`2101202327156467`, el mismo que usan los scripts de App Review).
  - `2179…77` "Sistetecni" → el número terminado en `…98` que el propio usuario ya había
    identificado: `platform_type=ON_PREMISE`, `status=DISCONNECTED`. No es el 311.
- **`client_whatsapp_business_accounts` está vacío**: el portfolio no gestiona ninguna WABA
  como "cliente" (partner access).
- La **WABA antigua conocida**, `1364228958481978` —la que Business Manager mostraba con
  "Sistetecni · App de WhatsApp Business · +57 311 599 6339 · Conectado"— **no es legible
  por Graph con el token actual**: `HTTP 400 / código 100 / subcódigo 33`. Ese subcódigo es
  el genérico de Meta para *"no existe, o no tienes permiso, o la operación no aplica"* — no
  distingue entre las tres causas.

### Interpretación del 400/subcódigo 33 — dos hipótesis, ninguna descartada con lo que tenemos

1. **La WABA ya no existe / fue removida del portfolio** (posible efecto colateral de
   desvincular la página de Facebook, o de una limpieza posterior).
2. **La WABA sigue existiendo y siendo propiedad del portfolio, pero el System User de la
   app no tiene ese activo asignado individualmente.** En Meta Business Manager, que un
   negocio *posea* un activo y que un *System User* de la app pueda *verlo* son cosas
   distintas: hace falta asignárselo en *Business Settings → System Users → Assign Assets*.
   Esto explicaría por qué `owned_whatsapp_business_accounts` solo devuelve 3 WABAs (las
   asignadas a este System User) y no la cuarta, aunque el negocio siga siendo su dueño.

La señal a favor de (2): las otras 3 WABAs SÍ tienen `owner_business_info` apuntando al
mismo portfolio y SÍ son legibles — es decir, el token puede leer WABAs de ese portfolio
cuando están asignadas. La ausencia de la cuarta en la lista es más compatible con "no
asignada a este System User" que con "el portfolio ya no es su dueño" — pero **no hay
forma de confirmarlo por Graph con los permisos actuales**; se confirma en la UI.

Esto **actualiza** la hipótesis de la investigación anterior (`docs/erp/13-*.md`, hipótesis
A: "conflicto de ownership app↔WABA en Embedded Signup"): sigue siendo plausible como causa
del rechazo del *asistente* (que usa OAuth de usuario, no este System User token), pero la
evidencia nueva apunta a un problema más simple y más accionable primero: **la propia
lectura por API de esa WABA está bloqueada**, independientemente de qué pase en el
asistente.

---

## 3. Preguntas 3–10 del encargo — respuesta directa

1. **¿WABA ID real?** No determinable con las credenciales actuales. `1364228958481978` es
   el único conocido, y no es legible.
2. **¿phone_number_id real?** No determinable — consecuencia de lo anterior.
3. **¿platform_type?** No determinable.
4. **¿status?** No determinable.
5. **¿Registrado en Cloud API?** No se puede confirmar por Graph. El usuario confirma que
   el número **sigue funcionando en la app WhatsApp Business** (fuera de Graph) — eso es
   compatible con "nunca llegó a registrarse en Cloud API" o con "está registrado en una
   WABA que no podemos leer". Ambas siguen abiertas.
6. **¿`/deregister` aplica?** **No demostrado.** `/deregister` solo tiene sentido sobre un
   `phone_number_id` con `platform_type=CLOUD_API` conocido — no tenemos ese dato para el
   311. Aplicarlo a ciegas está descartado por regla del encargo y por diseño del guard
   (§5): sin pre-flight en verde, no hay POST.
7. **¿Eliminarlo sería peligroso?** Sí, en el sentido de que no hay un objeto verificado
   sobre el que actuar. Cualquier operación de escritura sin confirmar antes el
   `phone_number_id` correcto arriesga tocar el número equivocado.
8. **¿Operación mínima para reintentar Coexistence?** **No es una llamada de Graph.** Es
   revisar en Meta:
   - *Business Settings → Accounts → WhatsApp Accounts* del portfolio `123654613862575`:
     ¿sigue apareciendo `1364228958481978` (o una WABA equivalente con el 311)? ¿en qué
     estado?
   - *Business Settings → System Users* → el system user cuyo token usa el agente: ¿tiene
     esa WABA asignada en "Assign Assets"? Si el activo existe pero no está asignado,
     asignarlo **no requiere ningún cambio de código** y de inmediato volvería a hacerlo
     legible por Graph (y probablemente por el asistente de Embedded Signup, si el
     problema era el mismo de visibilidad).
   - Si tras asignarlo la WABA sigue sin aparecer: la WABA fue removida de verdad, y hay que
     mirar en el propio WhatsApp Business App (el teléfono) su estado de conexión/API.
9. **¿Por código o por UI?** **Por UI**, en este momento. El código para la siguiente etapa
   (una vez haya un `phone_number_id` confirmado) ya está preparado — ver §5 — pero
   deliberadamente **no ejecutado**.

---

## 4. Qué operación sería correcta — tabla completa (item 3 del encargo)

| Operación | ¿Meta la soporta oficialmente? | ¿Aplica al estado real de hoy? | ¿Qué puede eliminar? | ¿Deja la App funcionando? | ¿Permite reincorporar por Coexistence? |
| --- | --- | --- | --- | --- | --- |
| **A. DELETE del phone number** | **No existe** tal endpoint en la WhatsApp Cloud API pública (no hay `DELETE /<PHONE_NUMBER_ID>` documentado). | No aplica — no existe la operación. | — | — | — |
| **B. `POST /<PHONE_NUMBER_ID>/deregister`** | Sí, documentada y oficial. | **No confirmado** — requiere `phone_number_id` real con `platform_type=CLOUD_API`, que no tenemos. | Solo el registro **Cloud API** de ese número (reversible con `/register`). | **Sí** — no toca la app ni sus chats. | Sí, en principio: deja el número "solo en la app", que es el estado que Coexistence espera. |
| **C. Quitar el activo del portfolio** | Es una operación de Business Manager (UI), no un GET/POST simple de este alcance. | No aplica al síntoma actual (el bloqueo no es "pertenece al portfolio equivocado" sino "no es legible"). | La asociación negocio↔WABA, no el número ni la app. | Sí, en principio, pero cambia ownership — mayor impacto, no recomendado sin más evidencia. | Depende de a qué portfolio se mueva. |
| **D. Unlink de la página de Facebook** | Sí (ya lo hizo el usuario). | **Ya ejecutada** — el problema persiste después, así que no era la palanca. | La conexión Página↔WABA, nada de Cloud API ni de la app. | Sí. | No demostrado que ayude — ya se hizo y #2494064 sigue. |
| **E. Offboarding de Coexistence** | Existe conceptualmente (se inicia desde la propia app WhatsApp Business, no por Graph con este token). | Posible, si el número quedó "a medias" en un estado de coexistencia. | El vínculo Cloud API parcial, sin tocar la app. | Sí — es precisamente para eso. | Sí, es la vía pensada para "reiniciar" un intento fallido de coexistencia. |
| **F. Ninguna operación necesaria (por ahora)** | — | **Es la conclusión de esta investigación**: falta visibilidad, no falta "liberar" nada demostrado. | — | Sí. | Indirectamente: recuperando visibilidad se puede reintentar sin tocar nada del número. |

**Conclusión: ni A, ni C, ni D resuelven esto. B queda preparado (no ejecutado) para cuando
haya evidencia de un registro Cloud API real. La palanca inmediata es E-adyacente/UI: mirar
Business Settings, no Graph.**

---

## 5. Guard para una futura operación — preparado, NO ejecutado

`sistetecni-ai-agent/scripts/deregistrar-numero-coexistence.mjs` (archivo **separado** del
diagnóstico GET-only; nunca importado ni invocado por él).

Exige las 4 flags exactas:

```
node scripts/deregistrar-numero-coexistence.mjs \
  --phone-number-id=<id> \
  --expected-last4=6339 \
  --expected-waba=<id> \
  --confirm=DEREGISTRAR
```

Antes de cualquier POST hace **3 GET de pre-flight** (reutilizando las sondas de
`diagnostico-meta-coexistence.mjs`, sin duplicar código):

1. el `phone_number_id` tiene que **aparecer** en `GET /<expected-waba>/phone_numbers`;
2. su `display_phone_number` tiene que **terminar exactamente** en `--expected-last4`;
3. `GET /<phone_number_id>` tiene que devolver `platform_type=CLOUD_API` y un `status`
   dentro de una lista blanca elegible (`CONNECTED`, `FLAGGED`, `RESTRICTED`,
   `RATE_LIMITED`, `PENDING`) — si es de la app (`NOT_APPLICABLE`) o ya está
   `DISCONNECTED`/`DELETED`/`MIGRATED`, **aborta**.

Si cualquiera de los tres no coincide: **ABORTAR**, sin excepción.

Capas adicionales:

- `DRY_RUN` — variable de entorno, **`"true"` por defecto** (mismo criterio estricto que
  los demás kill switches del repo: solo `"false"` exacto lo apaga). En `DRY_RUN` se
  imprime qué se habría enviado y el proceso **no toca la red** para el POST.
- Con `DRY_RUN=false` y el pre-flight en verde, pide además una **confirmación interactiva
  escrita a mano** (`confirmar()`, reutilizado de `scripts/lib/review.mjs`) — sin terminal
  real, se rechaza.
- **Nunca hay un DELETE** en el archivo (verificado por test de fuente). El único POST
  posible es a `/<PHONE_NUMBER_ID>/deregister`, y solo detrás de `dryRunActivo()` y de
  `await confirmar(...)` (verificado por test de fuente, comprobando el orden de aparición
  en el archivo).

**No se ha ejecutado ninguna vez.** No hay `phone_number_id` confirmado con el que
probarlo — y aunque lo hubiera, ejecutarlo no formaba parte de este encargo.

---

## 6. Tests y validación

- `sistetecni-ai-agent`: `npm test` → **1564 / 1564** (32 nuevos entre las dos fases de
  esta investigación: 16 de enumeración de portfolio + 16 del guard de `/deregister`).
- Herméticos, con `fetch` falso: confirman que el cliente de solo-GET también rechaza
  `/deregister` (además de `/register` y `/messages`), que `enumerarPortfolio` recorre
  TODAS las WABAs owned+client sin asumir cuál es la correcta, y que el guard aborta en
  cada uno de los mismatches (WABA equivocada, últimos 4 dígitos distintos, `platform_type`
  no-Cloud-API, `status` no elegible) sin llegar nunca a un POST.

---

## 7. Qué NO se hizo

Cero DELETE, cero POST (ni `/register`, ni `/deregister`, ni `/subscribed_apps`, ni
`/messages`), cero movimiento de WABA, cero eliminación de portfolio o de la WhatsApp
Business App. Todo lo ejecutado contra Meta en esta fase fue **GET de solo lectura**, con
el token que ya vivía en el `.env` del agente, nunca impreso.
