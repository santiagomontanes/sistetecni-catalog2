# Fase 2B/B8 — Cierre de las 8 decisiones pendientes

Complementa `docs/fase2b-b8-plan-produccion.md`. Nada de este documento fue ejecutado — es exclusivamente resolución de decisiones, con el detalle pedido (10 puntos por decisión) para que puedas aprobar cada una por separado antes de tocar producción.

---

## A. Historial de migraciones

**1. Identificador:** A
**2. Qué debes decidir:** cómo introducir el historial de migraciones en producción sin declarar aplicado algo que no ocurrió, y dejando una base reproducible a futuro.
**3. Opciones:**
   - **A1 — `migration repair` acotado**: marcar la baseline (`20260812220000`) como `applied` en el historial de producción sin ejecutar su contenido.
   - **A2 — Migración de adopción explícita**: un archivo nuevo, versionado en el repo, con timestamp anterior a las 5 migraciones del personalizador, cuyo contenido es exclusivamente declarativo (comentarios SQL, sin ningún DDL real) — documenta que el esquema base ya existe y por qué, y se **ejecuta de verdad** (no se marca, se aplica), quedando en el historial del CLI como cualquier otra migración real.

**4. Mi recomendación: A2.**

Razón del cambio respecto a mi primera mención de esto en el plan original: reconsiderando tu criterio explícito ("no quiero marcar como aplicada ninguna migración que realmente no haya ocurrido" + "queremos historial reproducible a futuro"), `migration repair` tiene un defecto estructural para ese segundo objetivo — es un comando que solo modifica una tabla de estado *dentro* de la base de datos remota; **no deja ningún rastro en Git**. Dentro de un año, nadie podría reconstruir por qué el historial de producción "empieza" en ese punto solo leyendo el repositorio — dependería de que alguien recuerde que se corrió un `repair` una vez. Una migración de adopción real, en cambio, es un archivo `.sql` commiteado, con su propio comentario explicando la procedencia (citando `docs/00-auditoria-supabase.md` como fuente), que CUALQUIERA que corra `supabase db push` contra un proyecto limpio reproduciría exactamente — es honesta (se ejecuta de verdad, no se finge) y además cumple tu objetivo de reproducibilidad, que `repair` no cumple.

**5. Riesgo de cada opción:**
   - A1: bajo en términos de esquema (no cambia nada), pero dejaría un historial no auto-explicativo — el riesgo es de proceso/documentación, no técnico.
   - A2: esencialmente cero — el archivo no ejecuta DDL real, solo dejará una fila más en la tabla de tracking del CLI.

**6. Dificultad de rollback:**
   - A1: otro `migration repair --status reverted` — un comando más contra producción.
   - A2: eliminar el archivo del repo; si ya se aplicó, un `migration repair --status reverted` igual de simple (mismo mecanismo, pero partiendo de un estado más claro).

**7. Qué cambia en producción:** en ambas, nada en el esquema real — solo la tabla interna `supabase_migrations.schema_migrations`.

**8. ¿Afecta la web actual?** No, ninguna de las dos.

**9. ¿Bloqueante para deploy?** Sí, en la práctica — sin resolver esto primero, un `db push` real intentaría aplicar también la baseline completa (con sus `create policy` que fallarían o entrarían en conflicto con lo que ya existe en producción).

**10. Comando/SQL exacto (A2, recomendada):**
```sql
-- supabase/migrations/20260812210000_adopcion_esquema_produccion.sql
-- Declara que products/profiles/business_profile/testimonials/gallery_images
-- (estructura de columnas, sin RLS/policies — eso lo cubre la migración de
-- seguridad por separado) ya existían en producción antes de este repo,
-- confirmado por docs/00-auditoria-supabase.md (auditoría real,
-- 2026-08-13). No ejecuta ningún DDL — es un ancla de historial honesta.
select 1; -- no-op intencional, deja constancia en el historial del CLI
```
```bash
supabase db push --db-url "$(cat .supabase-cli-prod.local)"
```

---

## B. Seguridad Fase 0.1

**1. Identificador:** B
**2. Qué debes decidir:** qué bloques de `fase0.1-correccion-propuesta.sql` van a producción y en qué orden.
**3. Opciones:** solo A+B · A+B+C · A+B+C+D (E queda aparte, ver nota).
**4. Mi recomendación: A + B + C + D, en ese orden, en una sola migración.** Ver §C de este documento — la duda sobre el Bloque D queda resuelta por código/auditoría, sin necesitar que pruebes nada en vivo.
**5. Riesgo:** A — ninguno (elimina un permiso que nunca debió existir; `service_role` nunca lo necesitó). B — ninguno (agrega protección donde no había ninguna; el código de la app nunca escribió como `anon`). C — mínimo (restringe escritura a admins; el panel siempre actuó autenticado como admin). D — mínimo, y con evidencia de que probablemente **arregla** algo ya roto, no restringe algo que funciona.
**6. Dificultad de rollback:** cada bloque trae su rollback exacto ya escrito en `fase0.1-correccion-propuesta.sql`, con el texto real de producción — reversión de policies en segundos, nunca toca datos.
**7. Qué cambia en producción:** 1 policy eliminada (`products`), RLS activado + 2 policies nuevas (`gallery_images`), 3 policies reemplazadas + 2 policies nuevas en `storage.objects`.
**8. ¿Afecta la web actual?** No — SELECT nunca se toca en ningún bloque; el panel admin sigue funcionando porque siempre pasó por sesión `is_admin=true`, que ya cumplía el único chequeo que ahora queda como camino exclusivo.
**9. ¿Bloqueante para deploy?** Sí — es la corrección más importante de todo B8, bloqueante antes de exponer `quote_requests` con datos reales de clientes.
**10. Comando/SQL exacto:** contenido íntegro de Bloques A+B+C+D de `fase0.1-correccion-propuesta.sql` (E queda fuera, es cosmético y sin relación con el personalizador — ver nota), en un archivo `<timestamp>_fase01_seguridad_produccion.sql`, aplicado vía `supabase db push --db-url "$(cat .supabase-cli-prod.local)"`.

*Nota sobre el Bloque E: no lo incluyo en esta migración porque no tiene relación con el personalizador ni es de ningún modo urgente (dos policies redundantes en `profiles`, cero riesgo, cero funcionalidad afectada) — mejor como un cambio aparte, cuando quieras, sin mezclarlo con la migración de seguridad que sí es bloqueante.*

---

## C. Galería / logo / Storage — resuelto por código, sin pregunta abierta

**Confirmado leyendo `src/supabase/storage.ts` y cada punto de llamada real (no inferido):**

| Bucket | Constante en código | Usado por | Función | Página admin que lo invoca |
|---|---|---|---|---|
| Productos | `products` (o `NEXT_PUBLIC_SUPABASE_BUCKET` si está seteada) | `uploadProductImage`, `deleteProductImageByUrl` | Subir/borrar imágenes de un producto | `src/components/AdminProductForm.tsx` |
| Galería | `gallery` (hardcoded, sin override) | `uploadGalleryImage` | Subir imagen de galería | `src/app/admin/(panel)/galeria/page.tsx` |
| Logo + video hero | `assets` (hardcoded, sin override) | `uploadAssetFile` | Subir logo (imagen) o video del hero — misma función para ambos, con `upsert:true` (sobrescribe) | `src/app/admin/(panel)/configuracion/page.tsx` (logo) y `src/app/admin/(panel)/media/page.tsx` (video) |

**¿Funcionan hoy en producción la subida a `gallery`/`assets`? Determinado por lógica, no por prueba manual — respuesta: NO, deberían estar fallando ahora mismo.**

Esto se deduce con certeza combinando dos hechos ya confirmados por la auditoría real (`docs/00-auditoria-supabase-raw.json`), no por inferencia sobre el comportamiento de la app:
1. `storage.objects` tiene RLS **activado** (dato real, confirmado).
2. Existen **cero** policies con `bucket_id` igual a `'gallery'` o `'assets'` (dato real, confirmado — 0 filas en el resultado de policies para esos buckets).

En Postgres, RLS activado + ninguna policy permissive aplicable a una operación = esa operación se deniega estructuralmente para cualquier rol que no sea el *owner* de la tabla o `service_role` (que bypasea RLS por completo) — y el panel admin nunca usa `service_role` para Storage, siempre sube archivos con la sesión del navegador del admin autenticado. No hay ninguna otra vía por la que esa subida pudiera estar funcionando hoy. Esta es una conclusión matemática sobre las policies ya auditadas, no una suposición sobre si "probablemente" falla.

**Conclusión:** el Bloque D no es una restricción nueva sobre algo que funciona — es la corrección de una función que ya está rota. Queda incluido en la migración de seguridad (§B) sin necesitar que pruebes nada manualmente antes.

---

## D. Migraciones del personalizador

**1. Identificador:** D
**2. Qué debes decidir:** confirmar las 5 migraciones exactas y su orden.
**3. Opciones:** ninguna — son las que ya existen, verificadas contra el archivo real, no hay alternativa que evaluar.
**4. Confirmación (no recomendación — son las únicas correctas):**

| Orden | Archivo | Verificado aditivo/idempotente |
|---|---|---|
| 1 | `20260812223000_products_personalizador_columns.sql` | `alter table products add column if not exists` × 6 — aditivo e idempotente |
| 2 | `20260812223100_upgrade_options.sql` | `create table if not exists` — idempotente |
| 3 | `20260812223200_product_upgrade_options.sql` | `create table if not exists`, FK hacia `products`(1)/`upgrade_options`(2) — depende de que 1 y 2 ya se hayan aplicado |
| 4 | `20260812223300_quote_requests.sql` | `create table if not exists`, FK hacia `products`(1) | depende de que 1 ya se haya aplicado |
| 5 | `20260813010000_fix_quote_requests_code_comment.sql` | `comment on column` — cosmético, depende de que 4 exista |

**5. Riesgo:** ninguno — releí el SQL completo de las 5, ninguna usa `drop`, `truncate`, `delete`, ni toca una columna existente de `products`/`profiles`/`business_profile`/`testimonials`.
**6. Rollback:** cada migración trae su bloque de rollback comentado al final (`drop table`/`drop column` sobre objetos nuevos que nadie más usa todavía).
**7. Qué cambia en producción:** 6 columnas nuevas en `products` (todas `nullable`), 3 tablas nuevas vacías.
**8. ¿Afecta la web actual?** No — ninguna columna nueva se lee en `src/supabase/db.ts` (el código que sirve el catálogo/admin actuales).
**9. ¿Bloqueante para deploy?** Si el objetivo es publicar el personalizador, sí. Si solo quisieras publicar la corrección de seguridad (§B) sin el personalizador todavía, no lo son — son independientes entre sí.
**10. Comando exacto:** `supabase db push --db-url "$(cat .supabase-cli-prod.local)"` (tras A y B ya aplicadas).

---

## E. Datos iniciales — confirmación

**1. Identificador:** E
**2. Qué debes decidir:** nada nuevo — confirmación de la preferencia que ya expresaste.
**3. Opciones:** A) tablas vacías + configuración manual · B) seed inicial de upgrades reales.
**4. Confirmo tu recomendación: Opción A.** `upgrade_options` y `product_upgrade_options` nacen vacías; las configuras desde `/admin/upgrades` y `/admin/productos` → Compatibilidad (B6, ya construido y probado). Ningún producto `[SEED]` ni cotización de STAGING se copia — ninguna migración de producción los incluye (confirmado, ninguna de las 5 tiene un `insert`).
**5. Riesgo:** ninguno — es la opción más conservadora posible.
**6. Rollback:** N/A, no hay nada que insertar de por sí.
**7. Qué cambia en producción:** nada más allá de la creación de las tablas vacías (ya cubierto en §D).
**8. ¿Afecta la web actual?** No.
**9. ¿Bloqueante?** No — el personalizador simplemente no ofrecerá upgrades hasta que los configures, comportamiento seguro por diseño (ausencia de fila = no compatible, ya verificado en B3/B6/B7).
**10. Comando:** ninguno — es ausencia de acción, no un paso a ejecutar.

---

## F. Variables de Vercel

**1. Identificador:** F
**2. Qué debes decidir:** qué variables agregar/modificar realmente en el proyecto de Vercel de producción (sin ver valores).
**3-4. Lista clasificada** (no puedo saber cuáles ya existen configuradas en tu proyecto de Vercel real — eso solo lo ves tú en el dashboard; clasifico según lo que el código necesita):

| Variable | Estado esperado | Motivo |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **YA EXISTENTE** (la web actual ya funciona contra el proyecto de producción) | Sin cambio necesario — verificar que sigue apuntando al proyecto correcto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **YA EXISTENTE** | Igual que arriba |
| `NEXT_PUBLIC_SUPABASE_BUCKET` | **YA EXISTENTE o AUSENTE (con default `'products'`)** | Sin cambio — solo revisar si apunta a `product-images` por error (duda huérfana de la auditoría original, sin resolver, no bloqueante) |
| `SUPABASE_SERVICE_ROLE_KEY` | **NUEVA — necesaria a partir de B4/B6/B7** | La web actual (pre-personalizador) nunca la necesitó; el personalizador sí (creación pública de cotizaciones y, aunque el panel admin usa un camino distinto, `admin.ts` la requiere para el Route Handler `GET /api/cotizaciones/[code]`) |
| `SUPABASE_PROJECT_REF_PRODUCTION` | **NUEVA** | No existía antes de la Fase 2B; requerida por `assertNotProduction()` (solo la usan scripts Node manuales, nunca la app en runtime — impacto cero en el sitio si falta, pero conviene tenerla para consistencia con STAGING) |
| `NEXT_PUBLIC_APP_ENV` | **CAMBIO NECESARIO si no existe, o CONFIRMAR si ya existe** | Debe valer exactamente `production` — si no está seteada, `EnvironmentBanner` podría no comportarse como se espera (aunque su ausencia no rompe nada, solo deja de ocultar el banner correctamente) |

No muestro ni pido valores reales — esto es solo la lista de nombres y su estado esperado.

**5. Riesgo:** bajo — son variables de configuración, no cambios de código. El único riesgo real es un error humano de copy-paste (ej. pegar la URL de STAGING en el scope de producción) — mitigado revisando cada valor dos veces antes de guardar.
**6. Rollback:** trivial — Vercel guarda historial de variables, y de todas formas un deploy anterior no depende de que cambies nada aquí retroactivamente.
**7. Qué cambia en producción:** el runtime del servidor gana acceso a 2 variables nuevas; nada del código cambia.
**8. ¿Afecta la web actual?** No, si `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` no se tocan.
**9. ¿Bloqueante?** Sí, para que el personalizador funcione en producción — no para la web actual.
**10. Comando:** ninguno vía CLI — se configura en Vercel Dashboard → Project Settings → Environment Variables, scope "Production". No lo ejecuto yo.

---

## G. Node / Next.js / vulnerabilidades npm

**1. Identificador:** G
**2. Qué debes decidir:** qué mantenimiento hacer inmediatamente después del deploy vs. qué puede esperar.
**3. Opciones:** ya confirmado en el plan — ninguna es bloqueante. Aquí solo secuencio el "después".
**4. Recomendación concreta, en orden, INMEDIATAMENTE DESPUÉS del deploy (no antes, no bloqueante):**
   1. **Eliminar `firebase` de `package.json`** — resuelve la cadena crítica de `protobufjs` por completo. Confirmado sin un solo `import` en `src/`. Riesgo de esta limpieza: cero (nada lo usa), pero la excluyo explícitamente de B8 porque pediste no tocar Firebase en este bloque — la marco como la primera tarea de la siguiente sesión de mantenimiento.
   2. **Evaluar un bump menor/patch de `@supabase/supabase-js`** cuando decidas abrir una ventana de mantenimiento normal — resolvería la cadena de `ws`/`websocket-driver`. No urgente: el proyecto no usa Supabase Realtime.

**Puede esperar indefinidamente (sin plazo fijo):**
   - Actualización de Next.js (resolvería `sharp`) — está explícitamente fuera de alcance mientras no autorices un upgrade de Next.
   - Actualización de Node — mismo criterio.

**5. Riesgo de NO hacer nada de esto:** bajo en el corto plazo (las 3 cadenas están en código no ejecutado: dependencia sin usar, feature de imagen desactivada, feature de realtime no usada) — pero crece con el tiempo si `firebase` sigue arrastrando actualizaciones transitivas nuevas sin que nadie lo revise.
**6. Rollback:** trivial en los 3 casos — son cambios de `package.json`/`package-lock.json`, revertibles con `git revert`.
**7. Qué cambia en producción:** nada de esto se toca en B8 — es una recomendación para después.
**8. ¿Afecta la web actual?** No aplica — no se ejecuta nada de esto ahora.
**9. ¿Bloqueante?** No, ninguna.
**10. Comando (para la sesión de mantenimiento futura, NO ahora):** `npm uninstall firebase` (tras confirmar de nuevo, en ese momento, que sigue sin uso).

---

## H. Push / Deploy — secuencia y respaldo

**1. Identificador:** H
**2. Qué debes decidir:** cuándo hacer push de los 18 commits locales, cuándo el preview deploy, cuándo el deploy a producción, y si conviene un tag/branch de respaldo antes.
**3. Opciones de secuencia:**
   - **H1 (recomendada):** tag de respaldo → push → preview deploy (automático en Vercel al hacer push, o manual) → smoke test en preview → SOLO ENTONCES, tras tu autorización separada, promover a producción.
   - **H2:** push directo sin tag, confiando en el propio historial de Git como respaldo.
**4. Mi recomendación: H1, con un tag ligero ANTES del push.**

Un tag (`git tag pre-b8-deploy` sobre el commit actual, `8a62dc7`) es una operación local, instantánea, cero riesgo, que te da un punto de retorno nombrado y fácil de encontrar ("volver a como estaba todo antes de tocar producción") sin depender de recordar un hash de commit. No reemplaza al rollback de código de Vercel (§14 del plan) — lo complementa a nivel de Git.

**Secuencia exacta recomendada:**
1. `git tag pre-b8-deploy` (local, sin push del tag todavía — o con push, tu decides, es solo una etiqueta).
2. Push de los 18 commits a `origin/main` — esto por sí solo NO despliega nada a menos que Vercel esté configurado para auto-deploy en push a `main` (necesito que confirmes cómo está configurado tu proyecto de Vercel: ¿auto-deploy en cada push a `main`, o deploy manual?). Si es auto-deploy, un push a `main` iría directo a producción — en ese caso, antes de hacer push habría que asegurarse de que TODAS las fases previas (variables de Vercel, migraciones, seguridad) ya estén aplicadas, o usar una rama distinta para el push inicial.
3. Preview deploy (rama separada o el mecanismo de Preview de Vercel) — validación visual final.
4. Deploy a producción — solo tras tu autorización explícita y separada de todo lo demás.

**5. Riesgo:** el único riesgo real de este punto es el que acabo de señalar — si Vercel hace auto-deploy en push a `main`, hacer push de los 18 commits podría disparar un deploy a producción con código que espera columnas/tablas que todavía no existen (si el push ocurre antes de aplicar las migraciones). **Necesito que confirmes el modo de deploy de tu proyecto de Vercel antes de recomendar el momento exacto del push** — esta es la única pregunta genuinamente abierta de todo este documento, porque no puedo verlo desde el código del repositorio.
**6. Dificultad de rollback:** el tag nunca se toca (es solo un puntero); revertir un push ya hecho a `origin/main` es más delicado (implica force-push o un revert commit) — exactamente por eso el tag debe crearse ANTES, no después.
**7. Qué cambia en producción:** el push en sí, nada (Git remoto no es producción); el deploy, todo el código nuevo.
**8. ¿Afecta la web actual?** Solo el deploy a producción la afecta — el push y el tag no.
**9. ¿Bloqueante?** El push es un prerrequisito técnico para cualquier deploy vía Vercel+Git, pero el ORDEN respecto a las migraciones es lo que realmente importa (ver riesgo).
**10. Comando exacto:**
```bash
git tag pre-b8-deploy
git push origin main          # (o a una rama de preview, según cómo esté configurado Vercel — pendiente de tu confirmación)
git push origin pre-b8-deploy # empuja el tag también, opcional
```
Ninguno ejecutado en esta sesión.

---

## Tabla final

| DECISIÓN | RECOMENDACIÓN | BLOQUEANTE | APROBACIÓN NECESARIA |
|---|---|---|---|
| A — Historial de migraciones | Migración de adopción explícita (A2), no `migration repair` | Sí (antes de aplicar D) | Sí |
| B — Seguridad Fase 0.1 | Bloques A+B+C+D en una sola migración | Sí | Sí |
| C — Galería/logo/Storage | Resuelto por código: incluir Bloque D, sin necesitar prueba manual | (parte de B) | No — ya resuelto |
| D — Migraciones del personalizador | Las 5 existentes, en el orden confirmado | Solo si quieres publicar el personalizador ya | Sí |
| E — Datos iniciales | Tablas vacías, configuración manual (tu preferencia, confirmada) | No | No — ya confirmado |
| F — Variables de Vercel | Agregar `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_PROJECT_REF_PRODUCTION`; confirmar `NEXT_PUBLIC_APP_ENV=production` | Sí (para que el personalizador funcione) | Sí |
| G — Node/Next/npm | Quitar `firebase` y evaluar bump de `@supabase/supabase-js` DESPUÉS del deploy; Next/Node esperan | No | No — ya confirmado, ninguna acción ahora |
| H — Push/Deploy | Tag de respaldo → push → preview → producción (orden exacto depende de cómo esté configurado el auto-deploy de Vercel) | Sí | Sí — y necesito que confirmes el modo de deploy de Vercel |

**Pregunta genuinamente abierta (la única que no puedo resolver desde el código):** ¿tu proyecto de Vercel hace auto-deploy a producción en cada push a `main`, o el deploy a producción es un paso manual separado? Determina el orden seguro entre "push" y "aplicar migraciones".

Me detengo aquí. No se ejecutó SQL, `migration repair`, `db push`, cambios de RLS, push, deploy, cambios en Vercel ni nada contra producción.
