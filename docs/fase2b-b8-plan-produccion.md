# Fase 2B/B8 — Plan final de producción (SOLO PLAN, nada ejecutado)

**Estado: planificación cerrada, ejecución NO autorizada.** Este documento no modifica producción, STAGING, Git remoto ni Vercel. Todo lo escrito aquí es diagnóstico + procedimiento propuesto, a la espera de tu autorización explícita fase por fase.

---

## 1. Matriz STAGING vs PRODUCCIÓN

Fuente: `docs/00-auditoria-supabase.md` + `docs/00-auditoria-supabase-raw.json` (auditoría real de producción, 2026-08-13) contrastada contra `supabase/migrations/*.sql` (aplicadas y verificadas en STAGING, B1).

| Objeto | PRODUCCIÓN (real, auditada) | STAGING (real, verificado) | Cambio necesario en producción |
|---|---|---|---|
| `products` | 23 columnas (14 activas + `visible_web`/`erp_id` + 7 huérfanas en español), **sin** columnas del personalizador, RLS activo pero **anulado** por `service_role full access` | Mismas 23 columnas + 6 nuevas del personalizador, RLS activo, **sin** la policy insegura | Migración aditiva (6 columnas) + eliminar 1 policy insegura |
| `profiles` | `id, email, is_admin, created_at`, 2 policies SELECT redundantes, sin FK a `auth.users` | Idéntico | Ninguno (opcional: limpiar la policy redundante, prioridad baja) |
| `business_profile` | 15 columnas, RLS correcto (lectura pública + escritura admin) | Idéntico | Ninguno |
| `testimonials` | RLS correcto, sin anomalías | Idéntico | Ninguno |
| `gallery_images` | **RLS desactivado**, cero policies | RLS activo + 2 policies (lectura pública, escritura admin) | Activar RLS + 2 policies |
| `upgrade_options` | **No existe** | Existe, RLS correcto (lectura pública + escritura admin) | Crear tabla completa |
| `product_upgrade_options` | **No existe** | Existe, RLS correcto, vacía salvo por el seed de prueba | Crear tabla completa, **vacía** (sin seed) |
| `quote_requests` | **No existe** | Existe, RLS correcto (sin lectura pública, gestión admin) | Crear tabla completa, **vacía** |
| Storage bucket `products` | Existe, público, 4 policies `to authenticated` **sin** chequeo `is_admin` | Mismo bucket (conceptualmente — proyecto Supabase distinto), policies restringidas a `is_admin` | Corregir 3 policies (INSERT/UPDATE/DELETE), dejar SELECT intacta |
| Storage buckets `gallery`/`assets` | Sin ninguna policy (con RLS activado globalmente en `storage.objects`, esto probablemente **bloquea** la subida hoy) | Igual que producción — **tampoco** se corrigió en STAGING (fuera del alcance de B1) | Decisión pendiente — ver §4, Bloque D |
| Storage bucket `product-images` | Existe, público, sin policies, **huérfano** (no referenciado en el código) | No se reconstruyó (no forma parte del baseline aplicado) | Ninguno — solo investigar origen si te interesa, no bloquea nada |
| RLS/policies generales | 1 policy crítica insegura (`products`), 1 tabla sin RLS (`gallery_images`), 1 bucket con escritura de más (`products`) | Las 3 correcciones ya aplicadas y probadas en 306 tests | Aplicar exactamente las mismas 3 correcciones |
| Índices | Los de siempre + `idx_products_erp_id` (redundante con el UNIQUE, inofensivo) | Iguales + índices nuevos de las tablas del personalizador | Los que trae cada migración nueva (aditivos, `create index if not exists`) |
| Constraints | `products_erp_id_key` (UNIQUE), sin FKs en todo el esquema | Iguales + FKs nuevas de `upgrade_options`↔`product_upgrade_options`↔`products` (con `on delete cascade`/`restrict` según corresponda) | Los que traen las migraciones nuevas |
| Migraciones (historial CLI) | **Ninguna** — la tabla `supabase_migrations.schema_migrations` de producción probablemente está vacía o no tiene relación con el historial de STAGING (ver §3) | 6 migraciones aplicadas, `Local = Remote` confirmado en B7 | Ver §3 — estrategia de adopción, NO aplicar la baseline tal cual |

---

## 2. Migraciones exactas que producción necesita

**La baseline (`20260812220000_baseline_esquema_actual.sql`) NO debe aplicarse a producción.** Fue escrita para reconstruir un STAGING vacío desde cero (`create table if not exists` sobre una base sin las tablas) — en producción esas 5 tablas ya existen con datos reales. Aplicarla literalmente sería inofensiva gracias al `if not exists` en las tablas (no fallaría), **pero sus `create policy` SÍ fallarían** si el nombre de policy ya existe con otro texto, y **no elimina** `service_role full access` (eso lo hace un `drop policy` que la baseline no incluye, porque ya asumía que STAGING nace sin esa policy).

Producción necesita exactamente:

| # | Migración | Acción en producción |
|---|---|---|
| 1 | `20260812223000_products_personalizador_columns.sql` | Aplicar tal cual — 6 `ALTER TABLE products ADD COLUMN IF NOT EXISTS`, 100% aditiva |
| 2 | `20260812223100_upgrade_options.sql` | Aplicar tal cual — tabla nueva |
| 3 | `20260812223200_product_upgrade_options.sql` | Aplicar tal cual — tabla nueva, FK hacia `products`/`upgrade_options` |
| 4 | `20260812223300_quote_requests.sql` | Aplicar tal cual — tabla nueva, FK hacia `products` |
| 5 | `20260813010000_fix_quote_requests_code_comment.sql` | Aplicar tal cual — solo `comment on column`, cosmético |
| 6 | **Nueva — "Fase 0.1 seguridad producción"** (a redactar, ver §4) | Bloques A + B + C del `fase0.1-correccion-propuesta.sql`, con el texto EXACTO ya verificado en la auditoría real |

Verifiqué el contenido de las migraciones 1-4: ninguna usa `drop`, `truncate`, ni toca columnas existentes de `products`/`profiles`/`business_profile`/`testimonials` — son estrictamente `create table if not exists` + `alter table ... add column if not exists` + `create policy`/`create index if not exists`. Aditivas, confirmado leyendo el SQL real, no asumido.

---

## 3. Estrategia de historial de migraciones

**Problema real:** el Supabase CLI rastrea qué migraciones están "aplicadas" en una tabla propia (`supabase_migrations.schema_migrations`) comparando por timestamp/nombre de archivo. Producción nunca ejecutó ninguna migración de este repo — su historial de CLI probablemente está vacío, aunque su *esquema* ya tiene las 5 tablas base (creadas manualmente o por un proceso anterior, no por este CLI).

**Lo que NO se debe hacer:** marcar la baseline como "applied" en producción sin ejecutarla — eso sería mentir sobre el historial (exactamente lo que pediste evitar), porque la baseline sí contiene una diferencia real respecto a lo que existe (la policy insegura que NO debe recrearse, y las 2 policies de `gallery_images` que SÍ hay que crear).

**Estrategia propuesta — dos caminos, tú decides:**

- **Opción A (recomendada): migraciones 1-6 tal cual, SIN aplicar la baseline.** El CLI, al comparar contra un historial vacío en producción, intentará aplicar TODAS las migraciones que no estén marcadas como aplicadas — incluida la baseline. Para evitar eso, la baseline tendría que quedar marcada como "ya aplicada" sin ejecutarse (`supabase migration repair --status applied` para ese timestamp específico) — pero **eso es exactamente el `migration repair` que me pediste no usar automáticamente**. Por eso la Opción A requiere tu autorización explícita para ese único comando, acotado a un solo timestamp, con el texto exacto que ejecutaría mostrado ANTES de correrlo.
- **Opción B: migración de "adopción" que documente el estado real.** Crear un archivo `<timestamp>_adopcion_produccion.sql` que NO cree nada (todo `if not exists`/`if exists`, sin efecto real sobre un esquema que ya tiene las 5 tablas base) pero sirva como ancla para que el historial del CLI tenga un punto de partida honesto, seguido de las migraciones 1-6 reales. Es más ceremonioso pero no requiere `migration repair`.

**Mi recomendación:** Opción A, con el `migration repair` mostrado y ejecutado como un paso propio, aislado, visible, y solo tras tu autorización línea por línea — nunca oculto dentro de un `db push` genérico.

---

## 4. Fase 0.1 — Seguridad pendiente, versión final

Comparé `docs/fase0.1-correccion-propuesta.sql` (5 bloques, escrito contra el texto real de producción) contra lo que STAGING realmente aplicó (`supabase/migrations/20260812220000_baseline_esquema_actual.sql`):

| Bloque | Contenido | ¿Aplicado en STAGING? | Recomendación para producción |
|---|---|---|---|
| **A** | `drop policy "service_role full access" on products` | ✅ Sí (nunca se creó en el baseline) | **Aplicar — bloqueante** |
| **B** | `enable RLS` + 2 policies en `gallery_images` | ✅ Sí | **Aplicar — bloqueante** |
| **C** | 3 policies de Storage (`products`, INSERT/UPDATE/DELETE → solo admin) | ✅ Sí | **Aplicar — fuertemente recomendado** |
| **D** | 2 policies nuevas en buckets `gallery`/`assets` | ❌ No (fuera de alcance de B1) | **Pendiente de tu decisión** — ver nota abajo |
| **E** | Eliminar policy redundante en `profiles` | ❌ No (fuera de alcance de B1) | Opcional, sin urgencia, cero riesgo |

**Respuesta directa a tu pregunta: sí, se pueden reutilizar EXACTAMENTE las policies de STAGING como fuente segura para producción** — para A, B y C. STAGING fue construido deliberadamente como "el esquema real de producción + estas 3 correcciones", verificado contra el texto exacto de la auditoría (no reconstruido de memoria). El SQL de A/B/C en `fase0.1-correccion-propuesta.sql` y el que generó el estado actual de STAGING son el mismo texto.

**Bloque D — necesito tu confirmación antes de incluirlo:** la auditoría original señaló que esto *probablemente ya está roto* en producción (subir imágenes de galería/logo podría estar fallando ahora mismo, porque `storage.objects` tiene RLS activado globalmente y esos 2 buckets no tienen ninguna policy). Antes de decidir si el Bloque D va en la migración de seguridad de producción, te pido que confirmes: **¿subir una imagen desde `/admin/galeria` o un logo desde `/admin/configuracion` funciona hoy en producción?** Si ya falla, D lo repara sin riesgo. Si funciona, hay algo que la auditoría no capturó y hay que investigarlo antes de tocar esos buckets.

**Verificación de GRANTs pendiente:** `docs/fase0.1-verificacion-grants.sql` fue preparado pero no encuentro un resultado JSON guardado de su ejecución (a diferencia de la auditoría principal). Antes de aplicar el Bloque A te recomiendo confirmar el resultado de ese script si lo llegaste a correr — no es bloqueante (el Bloque A es correcto de todas formas, dado que `service_role` tiene `BYPASSRLS` y nunca necesita policy), pero cierra la única duda que la auditoría original dejó abierta explícitamente.

**Migración de seguridad de producción propuesta** (a crear cuando autorices, no creada todavía): un único archivo `<timestamp>_fase01_seguridad_produccion.sql` con Bloques A + B + C (+ D si confirmas que hace falta), cada uno con su rollback comentado, idéntico en estructura a `fase0.1-correccion-propuesta.sql`.

---

## 5. Impacto sobre productos reales existentes

Los productos reales en producción tendrán, tras la migración 1: `cpu_generation = NULL`, `gpu_type = NULL`, `gpu_model = NULL`, `screen_size_inches = NULL`, `storage_gb = NULL`, `touch_screen = false` (default explícito de la migración, no NULL — verificado leyendo el SQL real).

**Confirmado, exactamente como esperas:**
- **El catálogo público (`/catalog`, `/product`) sigue funcionando idéntico** — ninguna de esas 6 columnas nuevas se lee en `src/supabase/db.ts` (el código que sirve el catálogo actual), solo las usa `src/lib/repositories/products.repository.ts` (B2, exclusivo del personalizador).
- **B3 (`checkFixedCharacteristics`) trata NULL como "no confirmado" y descarta el producto** cuando el cliente pide un valor específico (generación de CPU, GPU, táctil, pantalla) — nunca asume compatibilidad a favor de un dato ausente. Esto ya está probado (B3, tests 18/18b/19/20/20b) y confirmado en vivo (B7, escenario B5).
- **Consecuencia práctica:** el día 1 en producción, CUALQUIER búsqueda del personalizador que incluya un filtro de generación de CPU, GPU o táctil **excluirá TODOS los productos reales** (todos tienen esos campos en NULL), cayendo en "cotización especial" para esas búsquedas. Las búsquedas que NO usan esos filtros (solo RAM/almacenamiento/presupuesto) sí podrán encontrar productos reales, pero sin poder ofrecer upgrades (porque `product_upgrade_options` empieza vacía — ver §6) — es decir, solo aparecerán como `DIRECT_MATCH` si ya cumplen, nunca con upgrade sugerido, hasta que completes las specs desde el admin.
- **No rompe nada** — es el comportamiento conservador por diseño, ya verificado. La recomendación práctica es que vayas completando `cpu_generation`/`gpu_type`/`touch_screen`/`screen_size_inches`/`storage_gb` desde `/admin/productos` (B6) para los productos reales que quieras que el personalizador pueda ofrecer con filtros específicos — no es necesario hacerlo antes del deploy, solo para que esas búsquedas específicas empiecen a encontrar resultados.

---

## 6. Estrategia de upgrades/compatibilidad inicial

Confirmo tu preferencia: **Opción A — tablas vacías, configuración manual desde el panel admin.**

Razones a favor, además de la tuya (evitar precios ficticios por accidente):
- `upgrade_options.extra_cost` es dinero real que un cliente vería y podría pagar — cualquier valor de ejemplo que yo proponga sería, por definición, inventado sin tu conocimiento del costo real de un módulo de RAM o un SSD hoy.
- El panel admin (B6) ya soporta creación completa (`/admin/upgrades`) — no hace falta ningún seed para que sea usable.
- Con `product_upgrade_options` vacía, el personalizador simplemente no ofrece ningún upgrade hasta que tú lo definas — comportamiento seguro por defecto, ya verificado (B3 invariante: ausencia de fila = no compatible, nunca se infiere).

**No se copiarán** los 7 productos `[SEED]` ni ninguna cotización de STAGING — confirmado, ninguna migración de producción los incluye.

---

## 7. `quote_requests` en producción

Empezará vacía (tabla nueva). Verificado contra el SQL real de la migración 4:
- **Sin SELECT público** — la única policy es `quote_requests admin manage` (`for all`, `to authenticated`, `is_admin=true`). Confirmado también en B7 (RLS en vivo contra STAGING, mismo texto de policy).
- **Snapshots**: `base_price_snapshot`, `base_config_snapshot` (jsonb), `selected_upgrades_snapshot` (jsonb) — verificado en B4/B6/B7 que nunca se recalculan al leer, incluso tras cambiar el producto/upgrade original.
- **Código de 9 caracteres**: `code text not null unique`, sin restricción de longitud a nivel de columna (la longitud la controla `src/lib/personalizador/code.ts`, ya en 9 caracteres desde B4) — el comentario de la columna ya quedó corregido en STAGING (migración 5) y esa misma migración va incluida para producción.
- **Estados**: `check (status in ('nueva','en_revision','contactada','cotizada','aceptada','rechazada','expirada'))` — los 7 exactos, verificado leyendo el `check` real de la migración.
- **Constraint**: `quote_requests_product_or_special` (`product_id is not null or is_special_request = true`) — presente tal cual.

---

## 8. Storage

**El bucket `products` de producción NO se recrea, NO se borra nada, NO se mueven archivos.** Solo se corrigen 3 policies de `storage.objects` (Bloque C, §4) — INSERT/UPDATE/DELETE pasan a exigir `is_admin`, SELECT queda intacta.

**Las URLs actuales de imágenes seguirán funcionando exactamente igual:** confirmado en la auditoría (§7 de `docs/00-auditoria-supabase.md`) que la lectura pública de Storage (`getPublicUrl`) **no pasa por RLS en absoluto** — el bucket está marcado `público: true` a nivel de `storage.buckets`, que es un mecanismo aparte de las policies de `storage.objects`. Cambiar las policies de escritura no toca esa ruta de lectura de ninguna forma.

**Bucket `product-images` huérfano:** sigue sin tocarse — no forma parte de ningún plan de B8. Si quieres investigar su origen, es una tarea aparte, no bloqueante.

---

## 9. Variables de Vercel necesarias

| Variable | Clasificación | ¿Necesaria en producción? | Nota |
|---|---|---|---|
| `NEXT_PUBLIC_APP_ENV` | PUBLIC (build+runtime) | **Sí — debe ser `production`** | Ver explicación abajo |
| `NEXT_PUBLIC_SUPABASE_URL` | PUBLIC (build+runtime) | Sí | URL del proyecto Supabase de PRODUCCIÓN (no STAGING) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | PUBLIC (build+runtime) | Sí | Clave anónima de PRODUCCIÓN |
| `NEXT_PUBLIC_SUPABASE_BUCKET` | PUBLIC (build+runtime) | Opcional | Default `'products'` si se omite (confirmado en `src/supabase/storage.ts`) — solo necesaria si el bucket real no se llama así |
| `SUPABASE_SERVICE_ROLE_KEY` | **SERVER-ONLY (runtime)** | Sí | Nunca con prefijo `NEXT_PUBLIC_`, nunca en un archivo versionado |
| `SUPABASE_PROJECT_REF_PRODUCTION` | SERVER-ONLY (runtime), **no secreta** | Sí | Es el mismo ref que ya aparece en `NEXT_PUBLIC_SUPABASE_URL` — solo sirve para que `assertNotProduction()` detecte coherencia; no es información sensible (es el subdominio visible en la URL) |

**¿Es necesario `NEXT_PUBLIC_APP_ENV=production` en Vercel?** Sí, y es más importante que un detalle cosmético: `EnvironmentBanner` lo usa para decidir si mostrar el banner de advertencia (no debe aparecer en producción), y — más importante — es la variable que unos scripts de mantenimiento (`assertNotProduction()`, usada por scripts de seed/reset) usan para **bloquear** cualquier operación destructiva si detectan que NO es producción. En producción, ese valor debe estar puesto correctamente en `production` para que la app se comporte como tal (sin banner) — la protección de `assertNotProduction()` en sí solo se invoca desde scripts Node manuales, nunca desde la app en runtime, así que no bloquea nada del sitio.

No muestro valores reales — ninguno fue leído ni impreso en esta sesión.

---

## 10. Análisis `service_role` — revisión final

Verificado de tres formas independientes, no solo releyendo el código:

1. **Grep del import graph completo**: solo 2 archivos importan `src/supabase/admin.ts` en todo `src/` — `src/app/api/cotizaciones/[code]/route.ts` (Route Handler) y `src/app/personalizador/actions.ts` (Server Action, `"use server"`). Ninguno de los dos es un Client Component.
2. **`SUPABASE_SERVICE_ROLE_KEY` en todo `src/`**: aparece únicamente en `admin.ts`, sus tests, `assertNotProduction.mjs`/su test, y el Route Handler — nunca en un componente con `"use client"`.
3. **Grep del bundle de cliente COMPILADO real** (`.next/static/` tras un `next build` fresco): la cadena `SUPABASE_SERVICE_ROLE_KEY` **no aparece en ningún archivo** — esta es la prueba definitiva, no una inferencia sobre el código fuente.

**Nota adicional confirmada:** el panel admin (B6, `/admin/upgrades`, compatibilidad, `/admin/cotizaciones`) **tampoco usa `service_role` en ningún momento** — usa `requireAdmin()` (`src/lib/personalizadorAdmin/auth.ts`), que construye un cliente scoped con el propio `access_token` del usuario logueado, apoyándose en las policies RLS de `is_admin` ya verificadas. `service_role` solo se usa hoy en el flujo público de creación de cotizaciones (donde no hay sesión de usuario que scopear) — el mínimo estrictamente necesario.

---

## 11. WhatsApp actual

El cambio remoto (`e57d645`, ya integrado) actualizó el número corporativo a `+57 3115996339` en 7 archivos, incluida la fuente central `fetchBusinessProfileFresh()` (`src/supabase/db.ts`).

**El flujo de cotización de B5 SÍ usa la fuente correcta:** `PersonalizadorWizard.tsx` llama `getBusinessProfile()` — la misma función central que el resto del sitio, ya actualizada — para resolver el número antes de construir el link de WhatsApp de la pantalla de cotización creada.

**Hallazgo menor (no bloqueante):** ese mismo archivo tiene una constante de *fallback* — `DEFAULT_WHATSAPP_PHONE = "573202210698"` — usada solo mientras `getBusinessProfile()` todavía no resolvió o si la consulta falla. Esa constante **quedó con el número ANTIGUO** (nunca se actualizó porque el merge remoto no tocó este archivo, que es nuevo de B5). En el caso normal (perfil carga bien) esto no se nota — el número correcto llega igual. Solo importa en el caso raro de que `business_profile` no responda a tiempo. Recomiendo corregir esa constante como un cambio trivial de una línea, cuando autorices — no es parte de ningún flujo de seguridad ni de datos, así que lo dejo listado aquí en vez de tocarlo sin permiso.

No se integró WhatsApp Cloud API — el botón sigue usando `wa.me` con el código de cotización, tal como se pidió.

---

## 12. Node / Next.js / vulnerabilidades npm

**Node actual:** v18.19.1 (deprecado por Supabase, con warning en cada build — ya documentado desde B1).
**Next.js actual:** 15.1.9.

`npm audit` (solo lectura, sin `fix`): **15 vulnerabilidades (3 críticas, 10 altas, 2 moderadas)** — pero las tracé a su origen real en vez de tomar el conteo al valor nominal:

| Origen | Vulnerabilidad | Causa raíz | Clasificación |
|---|---|---|---|
| `protobufjs` (crítica) | Varias — ejecución de código, DoS | Viene ÚNICAMENTE de `firebase@11.10.0` → `@firebase/firestore` → `@grpc/proto-loader`. **`firebase` está confirmado sin un solo `import` en todo `src/`** (grep completo, cero resultados) | **PUEDE ESPERAR** — pero es la más fácil de resolver: quitar una dependencia no usada, cero riesgo funcional. Explícitamente NO la toco ahora (pediste no hacer limpieza de Firebase en B8), pero la marco como la primera tarea recomendada apenas cierre B8. |
| `sharp` (alta) | CVEs de `libvips` | Viene de `next@15.1.9` directamente (Next usa `sharp` para optimización de imágenes) — y `next.config.mjs` tiene `images: { unoptimized: true }`, así que **`sharp` probablemente ni se invoca en runtime** | **PUEDE ESPERAR** — atada a una actualización de Next (explícitamente fuera de alcance de B8) |
| `websocket-driver`/`ws` (crítica/alta) | DoS, corrupción de mensajes | Viene de `@supabase/supabase-js` → `@supabase/realtime-js`. El proyecto **no usa Supabase Realtime** (sin `.channel()`/`.on()` en ningún archivo) | **PUEDE ESPERAR** — el paquete está presente pero la función vulnerable (WebSocket) nunca se activa en este código |

**BLOQUEANTE PARA DEPLOY: ninguna.** Las tres cadenas de vulnerabilidad están en código no ejecutado (dependencia sin usar, feature de imagen desactivada, feature de realtime no usada) — no representan una superficie de ataque real contra la aplicación tal como está construida hoy.

**Recomendación concreta, en orden, para DESPUÉS de B8:**
1. Eliminar `firebase` del `package.json` (resuelve la cadena crítica de `protobufjs` por completo, riesgo cero).
2. Evaluar un bump menor de `@supabase/supabase-js` cuando toque mantenimiento normal (resuelve `ws`, sin tocar Node/Next).
3. `sharp`/Next.js: esperar a una ventana de mantenimiento donde SÍ se autorice actualizar Next.js.

No ejecuté `npm audit fix` en ningún momento, tal como se pidió.

---

## 13. Plan de deploy (FASES A–K) — NINGUNA EJECUTADA

### FASE A — Backup/verificación de producción
1. Confirmar que Supabase mantiene backups automáticos habilitados para el proyecto de producción (Point-in-Time Recovery si el plan lo incluye) — verificación en el dashboard de Supabase, no requiere SQL.
2. Exportar un dump de solo lectura del esquema actual de `products`/`profiles`/`business_profile`/`testimonials` (sin datos, solo estructura) como referencia de "antes".
3. Confirmar recuento de filas reales por tabla (`select count(*)`) como línea base — para poder confirmar después que nada se perdió.

### FASE B — Aplicar seguridad Fase 0.1 (Bloques A+B+C, y D si confirmas)
1. Ejecutar la migración de seguridad de producción (§4) vía `--db-url` explícito contra producción — nunca `--linked` apuntando a producción.
2. Verificar inmediatamente después: `service_role full access` ya no existe, `gallery_images` tiene RLS activo, las 3 policies de Storage exigen `is_admin`.

### FASE C — Verificar que la web actual sigue funcionando
1. Catálogo público, ficha de producto, WhatsApp, panel admin de productos/galería/testimonios — smoke test manual completo ANTES de tocar el esquema del personalizador (para aislar cualquier problema como causado por B o por D, no por las migraciones nuevas).

### FASE D — Aplicar migraciones del personalizador (1-5 de §2)
1. Aplicar en orden: columnas de `products`, `upgrade_options`, `product_upgrade_options`, `quote_requests`, fix del comentario.
2. Confirmar `migration list` → Local = Remote para las 6 (5 nuevas + la de seguridad).

### FASE E — Verificar DB
1. Repetir el mismo script de descubrimiento de solo lectura (`docs/fase0-descubrimiento-export.sql` o equivalente) contra producción — confirmar 8 tablas, RLS correcto en las 8, cero filas nuevas fuera de lo esperado (las 3 tablas del personalizador deben estar vacías).
2. Confirmar recuento de `products`/`profiles`/etc. sin cambios respecto a la línea base de la Fase A.

### FASE F — Configurar variables de Vercel
1. Añadir/confirmar las 6 variables de §9 en el scope "Production" de Vercel — nunca pegadas en el chat, nunca commiteadas.
2. Confirmar que STAGING (si tiene su propio proyecto Vercel o su propio scope "Preview") no comparte estas variables con producción.

### FASE G — Deploy preview
1. Deploy de un Preview de Vercel (rama o PR, sin tocar producción) apuntando a las variables de STAGING (no producción) para una última validación visual del build real.

### FASE H — Prueba en preview
1. Repetir el smoke test de §19 (abajo) contra la URL de preview.

### FASE I — Deploy a producción
1. Solo tras tu autorización explícita y separada de este plan.

### FASE J — Smoke tests en producción
1. Ver §19.

### FASE K — Rollback si algo falla
1. Ver §14.

---

## 14. Rollback

**Rollback de código:** revertir al deploy anterior de Vercel (un clic en el dashboard, "Promote to Production" sobre el deploy previo) — instantáneo, sin tocar la base de datos. Es el camino preferido para cualquier fallo que no sea de datos.

**Rollback de base de datos — NUNCA automático, y con una distinción crítica:**
- Si el fallo aparece ANTES de que exista ninguna `quote_request` real: las migraciones son 100% aditivas (columnas nuevas nullable, tablas nuevas vacías) — revertirlas es seguro (`drop table`/`alter table drop column` sobre objetos que nadie más usa todavía). Rollback disponible pero de bajo riesgo.
- Si el fallo aparece DESPUÉS de que ya existan cotizaciones reales: **no se borran tablas**. La recomendación estándar para cambios aditivos aplica exactamente aquí — es más seguro dejar las columnas/tablas nuevas en su lugar (no le hacen daño a nada, el código viejo simplemente no las lee) y resolver el problema revirtiendo el CÓDIGO (Vercel) en vez de la estructura de datos. Un rollback de esquema que borre `quote_requests` con filas reales sería una pérdida de datos de clientes — eso nunca se hace sin tu autorización explícita y específica para ese caso.
- La migración de seguridad (Bloques A/B/C) si necesita revertirse: cada bloque ya trae su rollback exacto documentado en `fase0.1-correccion-propuesta.sql`, con el texto REAL de las policies originales de producción (no reconstruido de memoria) — reversión en segundos, solo policies, nunca datos.

---

## 15. Smoke tests post-deploy

Diseñados para no usar datos ficticios que confundan a un cliente real — cualquier producto/cotización de prueba queda **oculto** (`visible_web=false` para productos, o simplemente no promocionado) y se **elimina por ID exacto** apenas termina la prueba.

| # | Prueba | Resultado esperado |
|---|---|---|
| 1 | Home (`/`) | Carga, hero, productos destacados |
| 2 | Catálogo (`/catalog`) | Lista productos reales, filtros funcionan |
| 3 | Ficha de producto (`/product?id=...`) | Specs, precio, imágenes |
| 4 | Botón WhatsApp actual | Abre `wa.me` con el número nuevo (`3115996339`) |
| 5 | Login admin (`/admin/login`) | Autentica con cuenta real `is_admin=true` |
| 6 | Editar un producto EXISTENTE (cambio trivial y reversible, ej. un espacio en la descripción) | Guarda, no rompe nada, revertir el cambio trivial después |
| 7 | `/personalizar` | Landing carga, dos opciones visibles |
| 8 | Ayúdame a elegir | Completa un flujo con un uso cualquiera — con catálogo real y `product_upgrade_options` vacía, lo esperable es terminar en "cotización especial" (comportamiento correcto, no un bug) |
| 9 | Personalizar | Igual — resultado esperado depende de qué specs ya hayas completado en productos reales |
| 10 | Crear una cotización de PRUEBA | Código generado, guardado — **anotar el ID para borrarlo después** |
| 11 | Consultar esa cotización por código (`GET /api/cotizaciones/[code]`) | 200, snapshot correcto |
| 12 | `/admin/upgrades` | Crear un upgrade de prueba, editarlo, desactivarlo — **borrar o dejar desactivado según prefieras** |
| 13 | `/admin/productos` → compatibilidad | Asignar el upgrade de prueba a un producto oculto de prueba (no a uno real visible) |
| 14 | `/admin/cotizaciones` | La cotización de prueba del paso 10 aparece, cambiar su estado, luego **eliminarla por ID exacto** |

**Limpieza obligatoria tras el smoke test:** eliminar por ID exacto cualquier upgrade/cotización de prueba creada en producción — nunca dejar datos de prueba mezclados con el catálogo real, ni siquiera ocultos, salvo que decidas conservarlos deliberadamente como upgrades reales iniciales.

---

## 16. Checklist de seguridad (a reverificar POST-deploy, mismo criterio que B7 pero contra producción)

- [ ] `anon` NO puede INSERT/UPDATE/DELETE en `products`
- [ ] `anon` NO puede escribir en `gallery_images`
- [ ] `authenticated` sin `is_admin` NO puede escribir en el bucket `products` de Storage
- [ ] `quote_requests` sin SELECT público
- [ ] Cuenta `is_admin=true` SÍ puede gestionar todo lo anterior
- [ ] `service_role` nunca llega al bundle de cliente (repetir el grep de `.next/static/` tras el build de producción real)
- [ ] Honeypot bloquea creación de cotizaciones
- [ ] Código de cotización inválido no filtra información

---

## 17. Decisiones que requieren tu autorización explícita (antes de ejecutar cualquier fase)

1. **Aplicar la migración de seguridad Fase 0.1** (Bloques A+B+C) contra producción — la corrección más importante de todo B8.
2. **Bloque D** (buckets `gallery`/`assets`) — necesito que confirmes si la subida de imágenes de galería/logo funciona hoy en producción antes de decidir si incluirlo.
3. **Estrategia de historial de migraciones** — Opción A (con un `migration repair` acotado y mostrado) vs. Opción B (migración de adopción) — ver §3.
4. **Aplicar las 5 migraciones del personalizador** contra producción.
5. **Configurar las 6 variables de entorno en Vercel** (producción).
6. **Deploy preview** en Vercel.
7. **Deploy a producción** — el paso final, separado de todo lo anterior.
8. Opcional, de baja prioridad: corregir la constante `DEFAULT_WHATSAPP_PHONE` desactualizada (§11) y aplicar el Bloque E (limpieza de policy redundante en `profiles`, §4).

---

## 18. Comandos exactos que ejecutaría después (NINGUNO EJECUTADO AHORA)

Todos usarían `--db-url` explícito contra producción (nunca `--linked`), con la misma disciplina de redacción/eliminación de credenciales ya usada en B1-B7. Ejemplos, a confirmar contigo antes de cada uno:

```bash
# FASE B — aplicar seguridad (tras tu autorización del punto 1 de §17)
supabase db push --db-url "$(cat .supabase-cli-prod.local)" --include-all=false
# (aplicaría solo la migración de seguridad nueva, si el historial ya reconoce las demás como pendientes por separado)

# FASE D — aplicar migraciones del personalizador (tras autorización del punto 4)
supabase db push --db-url "$(cat .supabase-cli-prod.local)"

# FASE E — verificación posterior
supabase migration list --db-url "$(cat .supabase-cli-prod.local)"

# Si Opción A de §3 requiere marcar la baseline como ya aplicada (tras autorización del punto 3, comando mostrado ANTES de ejecutar):
supabase migration repair --status applied 20260812220000 --db-url "$(cat .supabase-cli-prod.local)"
```

Ninguno de estos se ejecutó en esta sesión.

---

## 19. Git status / log (verificado al cierre de este plan)

```
$ git status
En la rama main
Tu rama está adelantada a 'origin/main' por 17 commits.
Cambios no rastreados: .claude/settings.local.json (esperado, siempre excluido)

$ git log --oneline --decorate -n 5
a8e6d19 (HEAD -> main) Fase 2B/B7: suite end-to-end + seguridad/RLS contra STAGING real
6583c78 Merge origin/main: número corporativo de WhatsApp actualizado (+57 3115996339)
f5ce06e Fase 2B/B6: panel admin — upgrades, compatibilidad y cotizaciones
d224120 Fase 2B/B6: extiende B2 con escritura
3731b4c Fase 2B/B5: wizard público "Ayúdame a elegir" / "Personaliza tu portátil"
```

Confirmado: todos los commits B1-B7 presentes, merge del cambio remoto presente, `origin/main` en `e57d645` sin nada nuevo pendiente de fetch, ningún commit local perdido, `.claude/settings.local.json` fuera de todo commit. **Sin push realizado.**
