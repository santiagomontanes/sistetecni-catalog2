# Fase 2B/B8 — Preflight final antes de producción

**Estado: preflight en curso, ejecución contra producción NO autorizada.** Nada de este documento fue ejecutado contra producción salvo lo explícitamente marcado como "verificado en vivo, solo lectura" en la sección 2.

---

## 1. Estado Git final

| Campo | Valor |
|---|---|
| Rama actual | `release/personalizador` |
| HEAD | `bed4efd` |
| `release/personalizador` remoto | `bed4efd` (sincronizada, incluye el fix del banner y el paquete SQL) — **pendiente confirmar si el último commit de doc se pusheó** (ver nota) |
| `main` local | `c8f7552` (19 commits adelante de `origin/main`, sin publicar) |
| `origin/main` (lo que Vercel despliega a producción) | `e57d645` — **sin cambios, producción sigue en el código anterior a todo B1-B8** |
| Tag `pre-personalizador-production` | Apunta a `c8f7552` — idéntico al HEAD actual de `main` local, sigue siendo un punto de retorno válido y exacto |
| Archivos sensibles trackeados | Ninguno — solo `.env*.example` (plantillas sin valores) |
| `.claude/settings.local.json` | Tracked desde ANTES de este proyecto (commits `95b202c`/`5b95fcb`, previos a Fase 2A) — contenido verificado benigno (solo permisos de herramientas). Ninguno de los commits B1-B8 lo modificó. |

**Nota:** el commit `bed4efd` (registro de aprobación de Preview) se hizo local — no lo pusheé porque no era estrictamente necesario para continuar (instrucción explícita: "si no es necesario, no hagas push"). Si quieres que quede visible en GitHub también, dímelo y lo publico (solo a `release/personalizador`, nunca a `main`).

---

## 2. Estado de producción — SOLO LECTURA (verificado en vivo, 2026-08-14T01:08:48Z)

Ejecutado vía `supabase migration list --db-url` y `supabase db query -f docs/fase0-descubrimiento-export.sql --db-url` (el mismo script de solo lectura ya usado en la Fase 0 original) contra producción real. Ninguna escritura — ni `ALTER`/`CREATE`/`DROP`/`INSERT`/`UPDATE`/`DELETE`, ni `migration repair`, ni `db push`. Credencial usada y eliminada al terminar, borrado verificado.

**Historial de migraciones**: los 8 archivos locales (baseline + adopción + seguridad + 5 del personalizador) aparecen con `"remote": ""` — **producción no tiene ninguna migración de este repo aplicada todavía**, exactamente como se esperaba. Confirma que el plan de la sección 3 parte de una base limpia, sin sorpresas.

**Tablas existentes**: exactamente `products`, `profiles`, `business_profile`, `testimonials`, `gallery_images` — las mismas 5 de la auditoría original, ninguna más.

**Tablas del personalizador**: `upgrade_options`, `product_upgrade_options`, `quote_requests` — **confirmado: ninguna existe todavía**, como se esperaba.

**Columnas de `products`**: 23 columnas, idénticas una por una a las de la auditoría original (incluidas las 7 huérfanas en español). **Ninguna de las 6 columnas del personalizador existe todavía** (`cpu_generation`, `gpu_type`, `gpu_model`, `touch_screen`, `screen_size_inches`, `storage_gb`) — confirmado, no supuesto.

**RLS por tabla**: `products`/`profiles`/`business_profile`/`testimonials` con RLS activo; **`gallery_images` con RLS DESACTIVADO** — confirmado en vivo, la vulnerabilidad CRÍTICA #2 sigue exactamente igual que en la auditoría original. (El propio CLI de Supabase generó además una advertencia automática de seguridad — `rls_disabled`, nivel `critical` — sobre esta misma tabla, coincidiendo de forma independiente con la auditoría manual.)

**Policies de `products`**: confirmado que **`service_role full access` (roles `public`, `ALL`) SIGUE EXISTIENDO** — la vulnerabilidad CRÍTICA #1 sigue exactamente igual, sin cambios desde la auditoría original. `products admin write` y `products public read` también presentes y sin cambios.

**Storage**: 4 buckets (`products`, `gallery`, `assets`, `product-images`), los 4 públicos, sin límite de tamaño/mime — igual que la auditoría original. **Policies de `storage.objects`**: solo el bucket `products` tiene las 4 policies conocidas (INSERT/SELECT/UPDATE/DELETE, rol `authenticated`, sin chequeo `is_admin` — vulnerabilidad ALTA #1 confirmada sin cambios). **`gallery`/`assets`/`product-images` siguen con CERO policies** — confirma en vivo, no por deducción, que el Bloque D es necesario: con `storage.objects` en RLS activo y cero policies para esos buckets, la subida de galería/logo/video debería seguir fallando en producción hoy mismo.

**Conclusión de esta verificación: el estado real de producción coincide EXACTAMENTE con lo asumido en todo este documento y en `docs/fase2b-b8-plan-produccion.md` — cero sorpresas, cero ajustes necesarios al plan.**

---

## 3. Historial de migraciones — confirmación final

**`20260812210000_adopcion_esquema_produccion.sql` — confirmado:**
- ✅ No destructiva — contenido ejecutable es únicamente `select 1;`, sin ningún DDL.
- ✅ No altera esquema funcional — cero efecto sobre tablas/columnas/policies reales.
- ✅ Sirve como ancla histórica — al aplicarse de verdad (no marcarse), queda una fila real en `supabase_migrations.schema_migrations` de producción, con su timestamp y nombre de archivo — reconstruible por cualquiera que lea el repo.
- ✅ Evita `migration repair` — se aplica con el mismo `db push` normal que las demás, ningún comando de reparación de estado.
- ✅ No miente sobre cambios que no ocurrieron — su propio contenido (comentarios) declara explícitamente que no ejecuta DDL y por qué existe; no afirma haber creado nada.

**Cómo queda el historial de producción después del push** (7 entradas, en este orden):
```
20260812210000  adopcion_esquema_produccion
20260812215000  fase01_seguridad_produccion
20260812223000  products_personalizador_columns
20260812223100  upgrade_options
20260812223200  product_upgrade_options
20260812223300  quote_requests
20260813010000  fix_quote_requests_code_comment
```
`20260812220000_baseline_esquema_actual.sql` **NO aparece en absoluto** en el historial de producción — nunca se le intenta aplicar, ni se marca como aplicada. Sigue existiendo en el repositorio (nunca se borra el archivo), y sigue siendo, correctamente, la única migración que reconstruye STAGING desde cero si algún día hiciera falta un STAGING nuevo.

**Mecanismo exacto para excluirla del `db push` de producción sin perderla del repo:**
```bash
# Antes del db push contra producción:
mv supabase/migrations/20260812220000_baseline_esquema_actual.sql /tmp/baseline-temporal-fuera-de-la-carpeta.sql

# ... aquí el db push contra producción, que ahora solo ve 7 archivos, no 8 ...

# Inmediatamente después, siempre, incluso si el push falló:
mv /tmp/baseline-temporal-fuera-de-la-carpeta.sql supabase/migrations/20260812220000_baseline_esquema_actual.sql
git status  # debe salir limpio — el archivo vuelve exactamente a su lugar, nunca se commitea su ausencia
```
Es una operación de sistema de archivos pura — nunca toca ninguna tabla de tracking, nunca usa `migration repair`, 100% reversible al instante, y el archivo jamás sale del control de Git de forma permanente (solo se mueve fuera de la carpeta que el CLI escanea, durante los segundos que dura el `db push`).

---

## 4. Seguridad final — `20260812215000_fase01_seguridad_produccion.sql`

Re-verificado bloque por bloque contra el archivo real:

| Bloque | Contenido confirmado | Idempotente | Depende de `profiles.is_admin` | Rollback documentado |
|---|---|---|---|---|
| A | `drop policy if exists "service_role full access" on products` | Sí (siempre segura de re-ejecutar) | N/A (solo elimina) | Sí, texto exacto |
| B | `enable RLS` + `gallery_images public read` (SELECT, público) + `gallery_images admin write` (ALL, `is_admin=true`) | Sí (`drop policy if exists` antes de cada `create`) | Sí, en la policy de escritura | Sí |
| C | 3 `drop policy` de las originales sin guardia de admin + 3 `create policy` nuevas (INSERT/UPDATE/DELETE del bucket `products`, todas con `is_admin=true`) | Sí | Sí | Sí |
| D | 2 `create policy` nuevas (buckets `gallery`/`assets`, ALL, `is_admin=true`) | Sí | Sí | Sí |

**No pérdida de datos:** confirmado por inspección — el archivo completo no contiene una sola sentencia `insert`/`update`/`delete`/`truncate`, solo `drop policy`/`create policy`/`alter table ... enable row level security`. Ningún archivo de Storage se toca — estas son policies de PERMISOS, no operan sobre los objetos (archivos) en sí. Las URLs públicas de imágenes ya subidas siguen funcionando exactamente igual (la lectura pública de Storage no depende de estas policies, confirmado en la auditoría original).

---

## 5. Las 5 migraciones del personalizador — confirmación final

| # | Archivo | Aditiva | No borra datos | No cambia productos existentes | Tabla nace vacía | FK/constraints | RLS/policies | Código 9 car. | Estados correctos |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `products_personalizador_columns.sql` | ✅ 6× `add column if not exists` | ✅ | ✅ (nullable, ningún valor tocado) | N/A | N/A | N/A | N/A | N/A |
| 2 | `upgrade_options.sql` | ✅ `create table if not exists` | ✅ | N/A | ✅ | N/A (tabla raíz) | ✅ lectura pública + escritura admin | N/A | N/A |
| 3 | `product_upgrade_options.sql` | ✅ | ✅ | N/A | ✅ | ✅ FK a `products`(cascade)/`upgrade_options`(cascade), UNIQUE(product_id, upgrade_option_id) | ✅ lectura pública + escritura admin | N/A | N/A |
| 4 | `quote_requests.sql` | ✅ | ✅ | N/A | ✅ | ✅ FK a `products`(restrict), constraint `product_or_special` | ✅ sin lectura pública, gestión admin | ✅ (código generado en la app, columna sin límite de longitud) | ✅ `check` con los 7 estados exactos |
| 5 | `fix_quote_requests_code_comment.sql` | ✅ `comment on column` únicamente | ✅ | N/A | N/A | N/A | N/A | Corrige el comentario para reflejar 9 caracteres | N/A |

**No se copian `[SEED]`** — confirmado, ninguna de las 5 migraciones contiene un `insert`. `upgrade_options`, `product_upgrade_options` y `quote_requests` nacen y permanecen vacías hasta que las uses desde el panel admin o un cliente real cree una cotización.

---

## 6. Impacto sobre products reales — confirmado por código y tests

**Home/catálogo/ficha de producto/admin actual — sin cambios:** `src/supabase/db.ts` (el código que sirve toda la web actual) no lee ninguna de las 6 columnas nuevas. Aunque `getProductById`/`getProductByIdAdmin` usan `select("*")` (que SÍ traerá las columnas nuevas en la respuesta de Supabase), `mapProduct()` solo desestructura las claves que conoce — las claves adicionales en el objeto de respuesta se ignoran silenciosamente, sin ningún efecto. Confirmado por lectura del código, no supuesto.

**Personalizador — exclusión conservadora, nunca inventa compatibilidad:** confirmado por código (`src/lib/personalizador/matching.ts`, función `checkFixedCharacteristics`) y por tests ya verdes:
- Test B3 #18/#18b (`src/lib/personalizador/matching.test.ts`): "producto sin cpu_generation confirmada + cliente exige generación mínima → incompatible, nunca se asume".
- Test B3 #19/#20 (mismo archivo): mismo criterio para GPU y táctil.
- Confirmado en vivo contra STAGING real en B7 (escenario B5 de `src/lib/b7/e2e.integration.test.ts`).

**Consecuencia práctica día 1 en producción:** cualquier búsqueda del personalizador que incluya un filtro de generación de CPU, GPU o pantalla táctil excluirá TODOS los productos reales hasta que completes esos campos desde `/admin/productos`. Las búsquedas que solo piden RAM/almacenamiento/presupuesto sí podrán encontrar productos reales (como `DIRECT_MATCH` si ya cumplen), pero sin upgrades sugeridos mientras `product_upgrade_options` esté vacía. Esto es el comportamiento seguro por diseño, no un defecto — nunca rompe nada, en el peor caso deriva en "cotización especial".

---

## 7. Variables de Vercel — checklist final con clasificación completa

| Variable | Estado | Pública/Server-only | ¿Cuándo se lee? | ¿Requiere redeploy tras cambiarla? |
|---|---|---|---|---|
| `NEXT_PUBLIC_APP_ENV` | DEBE CONFIRMARSE = `production` | Pública | **Build-time** (se inlinea en el bundle de cliente) | **Sí, siempre** |
| `NEXT_PUBLIC_SUPABASE_URL` | YA EXISTE | Pública | Build-time (cliente) + runtime (servidor, ambos funcionan) | Sí, para que el cliente lo tome |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | YA EXISTE | Pública | Igual que arriba | Sí |
| `NEXT_PUBLIC_SUPABASE_BUCKET` | YA EXISTE (o ausente, default `products`) | Pública | Igual que arriba | Sí, si se cambia |
| `SUPABASE_SERVICE_ROLE_KEY` | **NUEVA** | Server-only | Runtime (Node, siempre lee el valor real del proceso) | Sí — Vercel fija las variables de una función serverless en el momento del deploy, no las relee de un "entorno vivo" |
| `SUPABASE_PROJECT_REF_PRODUCTION` | **NUEVA** | Server-only, no secreta | Runtime, solo la usan scripts Node manuales (nunca la app en producción en sí) | Sí, mismo criterio |

**Hallazgo importante de esta misma sesión, confirmado empíricamente (no es una suposición genérica sobre Vercel):** el bug del banner de STAGING que corregimos (commit `7641b35`) fue EXACTAMENTE una variable `NEXT_PUBLIC_APP_ENV` bien configurada que no llegaba al navegador — la causa no era Vercel, era el patrón de lectura en el código, pero el episodio confirma en la práctica que las variables `NEXT_PUBLIC_*` viven inlineadas en el bundle desde el momento del build. **Ninguna variable de entorno en Vercel (pública o server-only) tiene efecto hasta el PRÓXIMO deploy** — no hay manera de "aplicar en caliente" un cambio de variable sin reconstruir.

---

## 8. Orden de ejecución final — analizado, no asumido

**Pregunta clave que analicé explícitamente: ¿variables de Vercel antes o después de las migraciones?**

Conclusión: **son independientes entre sí** — configurar variables en Vercel no toca la base de datos, y aplicar migraciones no toca Vercel. Ninguna tiene efecto sobre el sitio en vivo hasta sus respectivos "momentos de activación" (variables → el próximo deploy; migraciones → inmediato, pero sobre tablas que el código viejo no usa). Lo que SÍ importa es que **ambas terminen ANTES del merge/deploy de código** — ese es el único punto que dispara la ejecución del código nuevo, y ese código nuevo necesita las dos cosas listas (variables Y esquema) para no fallar en su primer uso.

**Orden final recomendado, con la razón de cada paso:**

1. **Backup/verificación de producción** (solo lectura) — línea base antes de tocar nada.
2. **Configurar variables de Vercel Production** — sin efecto hasta el próximo deploy, cero riesgo, se puede hacer con toda calma primero.
3. **Aplicar migración de adopción** — solo DB, código viejo no la nota.
4. **Aplicar migración de seguridad (A+B+C+D)** — solo DB/policies; razonado explícitamente que no rompe ninguna capacidad legítima del código viejo (el admin actual ya opera autenticado como `is_admin`, que es exactamente lo que las nuevas policies exigen — nunca se le quita nada que use de verdad, solo se le quita el hueco de acceso no autenticado).
5. **Verificar que la web actual sigue funcionando** — checkpoint crítico: confirmar ANTES de tocar el código que el catálogo/admin actuales siguen 100% intactos con las nuevas policies ya aplicadas.
6. **Aplicar las 5 migraciones del personalizador** — tablas nuevas vacías, código viejo tampoco las nota.
7. **Verificar DB** — 8 tablas, RLS correcto, 3 tablas nuevas vacías, recuento de `products`/`profiles`/etc. sin cambios respecto al paso 1.
8. **Merge/push a `main`** — **este es el único paso que dispara el auto-deploy de Vercel a producción.** Todo lo anterior (2-7) ya está listo, así que el código nuevo, desde el primer segundo que corre, encuentra exactamente lo que espera.
9. **Verificar el deployment** (build en Vercel, sin errores).
10. **Smoke tests** completos (sección 11).
11. **Rollback si algo falla** (sección 10).

**Por qué este orden y no "código primero, DB después":** si el código nuevo se desplegara ANTES de que existan `quote_requests`/`upgrade_options`/las columnas nuevas, cualquier visita a `/personalizar` o a los endpoints del personalizador fallaría con errores de "relation does not exist" — innecesario y evitable por completo invirtiendo el orden. Preparar la base de datos primero, mientras el código viejo (que ni sabe que esas tablas existen) sigue sirviendo el sitio sin ningún cambio de comportamiento, reduce la ventana de incompatibilidad a cero del lado de la base de datos — el único riesgo que queda es el propio deploy de Vercel (build/runtime del código nuevo), que es inevitable en cualquier orden.

---

## 9. Auto-deploy de `main` — consideración explícita

Confirmado: Production Branch de Vercel = `main`. Esto significa que el **paso 8** del orden de arriba (`git push origin main` o el merge equivalente) **dispara un deploy real a producción automáticamente**, sin paso manual adicional en Vercel.

Por eso el plan entero está diseñado para que, en el momento de ese push, TODO lo demás ya esté listo:
- ✅ Variables de Vercel configuradas (paso 2)
- ✅ Seguridad aplicada (paso 4)
- ✅ Migraciones del personalizador aplicadas (paso 6)
- ✅ Rollback preparado (sección 10, ya documentado, no requiere preparación adicional en el momento)

**No se hará `main` hasta que confirmes explícitamente cada uno de esos puntos** — este documento es precisamente la lista de verificación para ese momento.

---

## 10. Tag / backup

`pre-personalizador-production` apunta a `c8f7552` — commit idéntico al `main` local actual (main no se ha movido desde que se creó el tag). Sigue siendo un punto de retorno perfectamente válido para "cómo estaba `main` antes de que existiera este release".

**Recomendación: crear UN tag adicional en el momento exacto del merge**, no antes — algo como `pre-personalizador-production-deploy-vX`, apuntando al commit exacto de `release/personalizador` que se fusione a `main`. Razón: entre ahora y el merge real, `release/personalizador` podría recibir más commits (por ejemplo, si sigues probando el Preview y aparece algo más que corregir) — el tag de "justo antes del deploy" debe capturar el commit REAL que se despliega, no uno anterior. No lo creo todavía porque el merge no ha ocurrido — se crea como parte del propio procedimiento de merge (ver Bloque F, sección 13).

**¿Rama de respaldo además del tag?** No la recomiendo — sería redundante. Un tag ligero ya fija un commit para siempre (mientras no se borre), y `release/personalizador` en sí seguirá existiendo en GitHub después del merge (no hace falta borrarla), así que ya hay dos referencias apuntando al mismo estado. Una rama de respaldo adicional no añade ninguna capacidad de recuperación que el tag no tenga ya.

---

## 11. Rollback final — por caso

**Regla general, en todos los casos: si ya existen cotizaciones reales en `quote_requests`, NUNCA se borran tablas como parte de un rollback automático. El rollback de código (revertir el deploy en Vercel) siempre es el primer recurso.**

| Caso | Situación | Rollback recomendado |
|---|---|---|
| **A** | Migraciones aplicadas correctamente, pero el deploy de código falla (build error, runtime crash) | Rollback de código únicamente — "Promote" el deployment anterior en Vercel. Las migraciones (aditivas, tablas vacías) se quedan tal cual, no afectan al código viejo que vuelve a estar activo. |
| **B** | La migración de seguridad rompe alguna subida del admin (ej. galería, si la lógica de RLS resultó distinta a lo razonado) | Rollback de las policies específicas usando el bloque de rollback ya documentado en el propio archivo de la migración (reversión en segundos, sin tocar datos ni archivos) — no hace falta revertir código para esto. |
| **C** | El personalizador falla (ej. un bug no detectado en Preview) pero el catálogo actual funciona | No requiere rollback de base de datos ni de código del sitio completo — es un bug a corregir en una release posterior. El catálogo/admin actuales siguen sirviendo con normalidad porque nunca dependieron de las tablas nuevas. |
| **D** | El deploy completo rompe producción (algo no previsto, el sitio entero deja de responder) | Rollback de código INMEDIATO (Vercel "Promote" al deployment anterior) — máxima prioridad, restaura el sitio en segundos. Investigar la causa después, con el sitio ya restaurado. |
| **E** | Ya se crearon cotizaciones reales y luego hay que revertir el código | Rollback de código (Vercel), **NUNCA** borrar `quote_requests` ni ninguna tabla — esos datos son de clientes reales. Las tablas y columnas nuevas se quedan en su lugar (inertes para el código viejo, que no las usa) hasta la siguiente corrección. |

---

## 12. Smoke tests — checklist final para después del deploy

**PÚBLICO:** `/` · `/catalog` · ficha de producto · botón WhatsApp actual · `/personalizar` (landing) · Ayúdame a elegir (flujo completo) · Personalizar (flujo completo) · crear cotización normal (marcada, oculta, para borrar después) · crear cotización especial (igual) · consultar por código.

**ADMIN:** login · `/admin/productos` (listar) · editar un producto EXISTENTE con un cambio trivial y reversible · `/admin/upgrades` (crear/editar/activar-desactivar, de prueba) · compatibilidad (asignar a un producto oculto de prueba, nunca a uno real visible) · copiar compatibilidad · `/admin/cotizaciones` (la cotización de prueba debe aparecer) · cambiar su estado · **eliminarla por ID exacto al terminar**.

**SEGURIDAD (repetir en producción el mismo criterio ya verificado en STAGING en B7):** `anon` no puede escribir `products` · `anon` no puede escribir `gallery_images` · usuario autenticado normal (no admin) no puede escribir Storage · `quote_requests` sin SELECT público · cuenta admin sí gestiona todo lo anterior.

**Limpieza obligatoria tras el smoke test:** cualquier upgrade/producto/cotización de prueba creado en producción se elimina por ID exacto — nunca queda mezclado con datos reales, ni siquiera oculto, salvo que decidas conservarlo deliberadamente.

---

## 13. Plan de mantenimiento post-deploy (fuera del alcance de la ejecución actual)

| Orden | Tarea | Riesgo | Cuándo |
|---|---|---|---|
| 1 | Eliminar `firebase` de `package.json` (confirmado sin un solo `import` en `src/`) — resuelve la cadena crítica de `protobufjs` | Cero — nada lo usa | Primera tarea de la siguiente sesión de mantenimiento, no antes |
| 2 | `npm audit` de seguimiento tras quitar `firebase`, para confirmar cuántas de las 15 vulnerabilidades desaparecieron solas | Ninguno (solo lectura) | Justo después del punto 1 |
| 3 | Evaluar bump menor/patch de `@supabase/supabase-js` (resuelve `ws`/`websocket-driver`) | Bajo — el proyecto no usa Supabase Realtime | Próxima ventana de mantenimiento normal |
| 4 | Actualizar Next.js (resolvería `sharp`) | Medio — requiere probar toda la app de nuevo | Solo cuando se autorice explícitamente, sin plazo fijo |
| 5 | Actualizar Node (18 → 20+) | Medio — cambio de entorno de ejecución en Vercel | Igual que el punto 4, sin plazo fijo |

Ninguno de estos 5 puntos forma parte de la ejecución de producción de B8.

---

## 14. Paquete de comandos exactos — NINGUNO EJECUTADO

Todos usan `--db-url` explícito contra producción, nunca `--linked`. Contraseñas siempre vía archivo local gitignored (`.supabase-cli-prod.local`), nunca hardcodeadas, nunca impresas.

**Bloque A — preflight de solo lectura**
```bash
supabase migration list --db-url "$(cat .supabase-cli-prod.local)"
# + consultas de solo lectura equivalentes a docs/fase0-descubrimiento-export.sql
```

**Bloque B — preparar carpeta de migraciones sin la baseline**
```bash
mv supabase/migrations/20260812220000_baseline_esquema_actual.sql /tmp/baseline-temporal-fuera-de-la-carpeta.sql
ls supabase/migrations/*.sql   # confirmar visualmente que son 7 archivos, no 8
```

**Bloque C — aplicar a producción**
```bash
supabase db push --db-url "$(cat .supabase-cli-prod.local)"
```

**Bloque D — verificación post-push**
```bash
supabase migration list --db-url "$(cat .supabase-cli-prod.local)"
# + recuento de tablas/columnas/policies, comparado contra la línea base del Bloque A
```

**Bloque E — restaurar la baseline al repo**
```bash
mv /tmp/baseline-temporal-fuera-de-la-carpeta.sql supabase/migrations/20260812220000_baseline_esquema_actual.sql
git status   # debe quedar limpio, el archivo de vuelta en su lugar
```

**Bloque F — merge/push a main**
```bash
git tag pre-personalizador-production-deploy   # captura el commit EXACTO que se despliega
git checkout main
git merge --no-ff release/personalizador
git push origin main
git push origin pre-personalizador-production-deploy
```

**Bloque G — verificación del deployment**
```bash
# Confirmación visual en el dashboard de Vercel (build verde, deployment activo)
# + smoke tests de la sección 12, manuales
```

Ninguno de estos bloques se ejecutó en esta sesión.

---

## 15. Tabla GO / NO-GO

| CHECK | ESTADO ESPERADO | SI FALLA |
|---|---|---|
| Backup/verificación de producción disponible | ✅ Confirmado por lectura real en vivo (sección 2, 2026-08-14T01:08:48Z) — coincide exactamente con lo asumido | — |
| Migraciones revisadas | ✅ Hecho en este documento (secciones 3-5) | — |
| Producción accesible (solo lectura) | ✅ Confirmado — conexión usada y credencial eliminada | — |
| Variables de Vercel listas | Pendiente de que las configures (sección 7) | NO-GO — el código nuevo fallaría en su primer uso |
| Preview aprobado | ✅ Confirmado por ti manualmente | — |
| Build verde | ✅ Confirmado (309/309 tests, typecheck, lint, build) | — |
| Tests verdes | ✅ 309/309 | — |
| Seguridad preparada | ✅ Migración lista, revisada bloque por bloque | — |
| Rollback preparado | ✅ Documentado por caso (sección 11) | — |
| `main` sin cambios no deseados | ✅ Confirmado — `origin/main` intacto en `e57d645` | — |

**GO/NO-GO general en este momento: NO-GO** — pendiente únicamente de: (1) que configures las variables de Vercel, (2) tu autorización explícita final para cada fase de ejecución. La verificación de solo lectura de producción ya se completó y no arrojó ninguna sorpresa.

---

## 16. Riesgos restantes

1. **El único riesgo técnico real identificado**: el deploy en sí (paso 8 del orden de ejecución) — inherente a cualquier despliegue, no reducible más allá de tener todo lo demás listo de antemano (que es exactamente lo que este documento prepara).
2. **Riesgo de proceso, no técnico**: que se haga push a `main` antes de que las variables de Vercel o las migraciones estén listas — mitigado por la tabla GO/NO-GO y por no ejecutar nada sin tu autorización explícita fase por fase.
3. **Duda abierta menor**: el bucket huérfano `product-images` (detectado en la auditoría original) — no bloquea nada, pero si `NEXT_PUBLIC_SUPABASE_BUCKET` en Vercel apuntara ahí por error en vez de a `products`, las imágenes de producto no se verían. Vale la pena confirmarlo al revisar variables (sección 7), sin ser bloqueante.

---

## 17. Decisiones que todavía requieren tu aprobación

1. Confirmar/proveer la conexión de solo lectura a producción (sección 2).
2. Autorizar la configuración de las 3 variables de Vercel (sección 7).
3. Autorizar la ejecución del Bloque A (preflight de solo lectura contra producción) — de hecho ya autorizado en tu mensaje, pendiente solo de la conexión.
4. Autorizar, por separado y explícitamente, cada uno de los Bloques B-G de la sección 14, cuando llegue el momento — este documento no autoriza ninguno por sí solo.

---

Me detengo aquí. No se ejecutó SQL contra producción (salvo, cuando confirmes la conexión, las consultas de solo lectura de la sección 2), no hubo merge a `main`, no hubo push a `main`, no hubo cambios de variables en Vercel, no hubo deploy de producción.
