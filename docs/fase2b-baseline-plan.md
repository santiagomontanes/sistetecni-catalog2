# Fase 2B/B1 — Plan de migración BASELINE (diseño, nada ejecutado)

**Estado: PLAN únicamente. Ningún comando de este documento se ejecutó.** Ningún `link`, `pull`, `dump` ni `push` corrió en esta sesión. El proyecto CLI linked no se tocó.

**Sobre el incidente de contraseña:** no vi, no usé ni almacené ninguna contraseña de STAGING en esta sesión — el `db push` que falló lo ejecutaste tú, fuera de mi alcance. Ninguna credencial aparece en este documento ni aparecerá en los comandos que proponga: todo se diseña para que la contraseña de conexión directa a Postgres (necesaria para `db pull`/`db dump`, distinta de `NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`) viaje solo por variables de entorno que tú definas en tu propia terminal, nunca escritas en el chat ni impresas por mí.

---

## Causa raíz confirmada

Las 4 migraciones de la Fase 2B son **incrementales** (`ALTER TABLE public.products ADD COLUMN...`, FKs hacia `public.products`) — asumen que el esquema base de la web (`products`, `profiles`, `business_profile`, `testimonials`, `gallery_images`) ya existe. Un proyecto STAGING recién creado está vacío. Falta una **migración baseline**, cronológicamente anterior, que cree ese esquema base antes de que las 4 migraciones del personalizador intenten extenderlo.

## Investigación: herramientas oficiales disponibles (verificado en esta máquina, sin conectar a nada)

```
$ supabase db pull --help   → soporta --schema, --db-url, --linked, --project-ref
$ supabase db dump --help   → soporta --schema, --db-url; sin --data-only = SOLO esquema
$ supabase db push --help   → soporta --dry-run, --db-url
$ supabase migration list --help → soporta --db-url (comparación remota de solo lectura)
$ which pg_dump             → no instalado en esta máquina
```

Hallazgo útil: **`supabase db dump` es el equivalente oficial de `pg_dump --schema-only`, empaquetado en el propio CLI** — no hace falta instalar `pg_dump` por separado (que de hecho no está instalado aquí). Y **ambos comandos (`db pull`, `db dump`) aceptan `--db-url`**, lo que permite apuntar a producción de forma puntual **sin usar `supabase link`** — es decir, sin tocar el estado persistente de "proyecto vinculado" del CLI en ningún momento. Esto es clave para el punto 4.

---

## 1. Estrategia exacta

1. **Nunca cambiar el `link` persistente del CLI.** Todo comando que necesite tocar producción se ejecuta con `--db-url` apuntando explícitamente a producción, como una operación puntual y aislada — el CLI nunca "recuerda" haber estado apuntando a producción.
2. Generar el baseline con `supabase db pull --schema public --db-url "$PROD_DB_URL"` contra producción — **de solo lectura en cuanto a esquema/datos** (no modifica columnas, filas, ni policies; internamente hace consultas de introspección + compara contra la tabla de tracking de migraciones que Supabase ya instala en todo proyecto).
3. Tratar el archivo generado como **borrador**, nunca aceptarlo verbatim: revisión línea por línea antes de convertirlo en la migración baseline definitiva.
4. Cruzar ese borrador contra **la auditoría que ya tenemos** (`docs/00-auditoria-supabase.md`, obtenida por ti mismo vía SQL Editor, sin ningún riesgo adicional de credenciales) — si algo no coincide con lo ya confirmado, se investiga antes de aceptar el baseline.
5. Curar a mano las 2 diferencias intencionales ya identificadas (ver punto 6/7) — el baseline de STAGING no debe heredar la policy `service_role full access` de `products` ni el RLS desactivado de `gallery_images`, porque ambas ya están documentadas como vulnerabilidades reales en `docs/00-auditoria-supabase.md`, con corrección ya escrita (sin aplicar) en `docs/fase0.1-correccion-propuesta.sql`.
6. Storage: **no** se dumpea el schema `storage` completo (contiene tablas internas que Supabase ya instala en cualquier proyecto nuevo — intentar recrearlas causaría conflictos). Las policies de `storage.objects` se transcriben a mano desde el texto exacto que ya capturamos en la auditoría, aplicando la misma corrección de "solo admin escribe" en vez de "cualquier autenticado" (Fase 0.1, ALTA #1).
7. Los buckets de Storage (`products`, `gallery`, `assets`) **no son objetos de esquema** (son filas en `storage.buckets`, no DDL) — se documentan como paso de configuración aparte, no como parte de la migración SQL.

## 2. Comandos de solo lectura que serían necesarios (para ejecutar más adelante, no ahora)

```bash
# Variable de entorno en TU terminal — nunca escrita en el chat, nunca impresa por mí.
export PROD_DB_URL="postgresql://postgres:<password>@db.<ref-produccion>.supabase.co:5432/postgres"

# A. Generar el borrador de baseline (migration-shaped, listo para revisar)
supabase db pull --schema public --db-url "$PROD_DB_URL" baseline_esquema_actual

# B. Verificación cruzada independiente (dump crudo, para comparar contra A)
supabase db dump --schema public --db-url "$PROD_DB_URL" -f /tmp/prod_schema_public_check.sql

# C. Confirmar que ninguno de los dos escribió nada — re-vinculado a STAGING,
#    listar qué migraciones existen ahí (debe seguir vacío)
supabase migration list --db-url "$STAGING_DB_URL"

unset PROD_DB_URL   # limpiar la variable de la sesión de terminal al terminar
```

No se ejecuta nada de esto en esta sesión — quedan aquí documentados para cuando lo autorices.

## 3. Qué proyecto debe estar "linked" en cada momento

| Momento | Proyecto conectado | Cómo |
|---|---|---|
| Generar baseline (A, B) | PRODUCCIÓN, puntual | `--db-url`, **nunca `supabase link`** — el link persistente no cambia |
| Verificar estado de STAGING (C) | STAGING | `--db-url` también, por el mismo motivo — evita depender de qué esté "linked" en ese momento |
| Aplicar baseline + 4 migraciones (futuro, con tu autorización aparte) | STAGING exclusivamente | Preferible seguir usando `--db-url` explícito en vez de depender de un `link` persistente |

**Recomendación de fondo: evitar `supabase link` en todo este flujo**, precisamente por el incidente reciente — cada comando declara explícitamente a qué apunta, en vez de depender de un estado guardado que alguien podría olvidar cuál es.

## 4. Cómo evitar confundir producción y staging

- `--db-url` explícito en cada comando (punto 3) — nunca un estado persistente ambiguo.
- La contraseña de conexión directa viaja solo por variable de entorno, tecleada una vez en tu propia terminal, nunca en el chat — exactamente la lección del incidente reciente.
- Antes de cualquier `db push` futuro: `--dry-run` primero (soportado, confirmado arriba) para ver qué aplicaría sin aplicarlo.
- Nunca ejecutar la operación contra producción y la operación contra staging en la misma línea de comandos consecutiva sin verificar de por medio — separar en pasos distintos, con una verificación de solo lectura (punto 2C) entre uno y otro.
- `assertNotProduction()` (ya implementada, Fase 2B/B1) sigue siendo la barrera para cualquier script de la aplicación (seed, etc.) — esto complementa, no reemplaza, esa protección a nivel del CLI de Supabase, que es una superficie distinta.

## 5. Nombre/timestamp propuesto

```
supabase/migrations/20260812220000_baseline_esquema_actual.sql
```

`220000` (22:00:00) es anterior a `223000` (22:30:00), la primera de las 4 migraciones existentes — ordena correctamente antes que todas sin tocarlas.

## 6. Qué incluirá

- Las 5 tablas reales de `public`: `products`, `business_profile`, `testimonials`, `profiles`, `gallery_images` — columnas, tipos, nullability y defaults exactamente como los confirmó `docs/00-auditoria-supabase.md`.
- PK de las 5 tablas; el `UNIQUE` de `products.erp_id`; los índices reales (`idx_products_erp_id`, más los de PK).
- `ENABLE ROW LEVEL SECURITY` en `products`, `business_profile`, `testimonials`, `profiles` (igual que producción hoy) **y también en `gallery_images`** — ver diferencia intencional abajo.
- Policies de `products`, `business_profile`, `testimonials`, `profiles` — el texto exacto ya capturado, **excepto** `service_role full access` de `products`.
- Policies de `gallery_images` — las correctas (lectura pública + escritura solo `is_admin`), no las que hoy no existen en producción.
- Policies de `storage.objects` para el bucket `products` — transcritas de la auditoría, pero con INSERT/UPDATE/DELETE restringidos a `is_admin` (no "cualquier autenticado").

## 7. Qué excluirá

- `auth.*` completo — nunca tocado, nunca pulled.
- Las tablas internas del schema `storage` (`storage.buckets`, `storage.objects` como estructura) — ya existen en cualquier proyecto Supabase nuevo; recrearlas causaría conflicto. Solo se transcriben sus *policies*, no sus tablas.
- Cualquier fila de datos — cero `INSERT`, solo DDL.
- El bucket huérfano `product-images` (Fase 0.1 lo marcó como no referenciado en el código conocido) — no se replica en STAGING a menos que confirmes que sí está en uso real.
- La policy `"service_role full access"` de `products` (roles=`public`, `using(true)`) — es la vulnerabilidad ya documentada, no tiene sentido reproducirla ni siquiera para pruebas.
- El estado "RLS desactivado" de `gallery_images` — ver más abajo.

### Diferencias intencionales entre el baseline de producción y el baseline de STAGING

| Objeto | Producción hoy (auditado, sin tocar) | Baseline de STAGING (propuesto) | Por qué |
|---|---|---|---|
| `products`, policy `service_role full access` | Existe, `roles=public`, abre INSERT/UPDATE/DELETE a cualquiera (CRÍTICA #1) | **No se incluye** | Es un error de configuración documentado, no una característica — replicarlo solo reproduce el hueco de seguridad en el entorno de pruebas, exactamente lo que pediste evitar |
| `gallery_images`, RLS | Desactivado, sin policies (CRÍTICA #2) | **RLS activado + policies correctas** | Mismo criterio que el punto anterior — no estaba nombrado explícitamente en tu mensaje, pero es la misma categoría de problema ya documentado en `docs/fase0.1-correccion-propuesta.sql`; lo aplico por consistencia y lo dejo señalado aquí para que lo confirmes o lo rechaces |
| `storage.objects`, bucket `products` | INSERT/UPDATE/DELETE abiertos a cualquier autenticado (ALTA #1) | Restringido a `is_admin` | Mismo criterio |

**Esto NO es aplicar la Fase 0.1 a producción** — producción sigue exactamente igual, sin tocar. Es decidir con qué esquema arranca un proyecto STAGING que todavía no existe con datos. Aun así, **quiero tu confirmación explícita antes de construir el archivo real**, porque generalicé tu instrucción puntual sobre `service_role full access` a las otras 2 vulnerabilidades ya documentadas de la misma auditoría — no fue algo que nombraras una por una.

## 8. Orden completo de migraciones resultante

```
supabase/migrations/
  20260812220000_baseline_esquema_actual.sql          ← NUEVA (este plan)
  20260812223000_products_personalizador_columns.sql
  20260812223100_upgrade_options.sql
  20260812223200_product_upgrade_options.sql
  20260812223300_quote_requests.sql
```

## 9. Cómo comprobar que el `db push` fallido no dejó cambios parciales en STAGING

El error ocurrió en la primera sentencia de la primera migración (`ALTER TABLE public.products...` sobre una tabla que no existe) — Supabase CLI aplica cada archivo de migración dentro de su propia transacción, así que un fallo ahí no debería haber dejado nada a medias, y las migraciones 2–4 nunca se habrían intentado. Aun así, no lo doy por sentado — verificación concreta (de solo lectura, reutilizando lo que ya construimos):

1. `supabase migration list --db-url "$STAGING_DB_URL"` — confirmar que STAGING no tiene ninguna migración marcada como aplicada.
2. Re-ejecutar `docs/fase0-descubrimiento-export.sql` contra STAGING (mismo script ya usado y probado contra producción) — confirmar `tablas_columnas: []`, `rls_tablas: []`, `policies_public: []` — es decir, STAGING sigue exactamente en su estado recién creado, vacío.

## 10. Cómo verificar, después, que STAGING quedó con el esquema correcto

Una vez aplicados baseline + 4 migraciones (con tu autorización, en su momento):

1. `supabase migration list --db-url "$STAGING_DB_URL"` — las 5 deben aparecer aplicadas, con checksums coincidentes.
2. Re-ejecutar `docs/fase0-descubrimiento-export.sql` contra STAGING y confirmar: 8 tablas en `public` (5 del baseline + `upgrade_options`, `product_upgrade_options`, `quote_requests`), RLS activado en las 8 (a diferencia de producción, donde `gallery_images` hoy aparece desactivado), y que **ninguna** policy tenga `roles: ["public"]` para comandos distintos de `SELECT`.
3. Confirmar que las policies de `storage.objects` para `products` exigen `is_admin`, no solo `authenticated`.

---

## Comparación `db pull` vs `db dump` — y cuál usar

| | `supabase db pull` | `supabase db dump` |
|---|---|---|
| Qué produce | Un archivo de migración, listo para `supabase/migrations/` | Un `.sql` crudo (equivalente a `pg_dump --schema-only`) |
| Requiere revisión manual | Sí, igual | Sí, más — no viene con la forma de "migración" |
| Instalación adicional | Ninguna | Ninguna — confirmado: es el propio CLI, no hace falta `pg_dump` (que de hecho no está instalado aquí) |
| Mejor uso aquí | **Fuente principal** del baseline | **Verificación cruzada** independiente antes de aceptar el resultado de `db pull` |

**Recomendación: `db pull` como método principal** — es el flujo oficialmente documentado por Supabase para "adoptar" el esquema de un proyecto existente como línea base, y entrega directamente el artefacto en el formato que ya usamos. Complementarlo con un `db dump --schema public` de verificación cruzada antes de aceptar el resultado, dado lo sensible que resultó este paso tras el incidente de contraseña — dos fuentes independientes que deben coincidir dan más confianza que confiar en una sola.

**Alternativa más conservadora, para tu consideración:** ya tenemos el esquema completo de `public` capturado y verificado en `docs/00-auditoria-supabase.md`, obtenido sin ningún riesgo de credenciales (fue un `SELECT` que tú mismo corriste en el SQL Editor). Si prefieres minimizar todavía más el contacto con producción tras el incidente reciente, podría construir el baseline **a partir de esos datos ya capturados**, usando `db pull`/`db dump` únicamente como verificación posterior en vez de como fuente primaria. Dijiste explícitamente que preferías no reconstruir "solo de memoria" — esta opción no sería "de memoria", sería a partir de un resultado real ya auditado, pero quería dejarla explícita como alternativa, ya que implica cero conexiones nuevas a producción.

---

*Nada de este plan fue ejecutado. Ningún `link`, `pull`, `dump` ni `push` corrió. Detengo aquí, a la espera de tu decisión sobre: (a) el método (db pull vs. usar la auditoría ya capturada), (b) si confirmas extender la exclusión de vulnerabilidades a `gallery_images` y Storage además de `service_role full access`, y (c) autorización explícita para ejecutar cualquier comando.*
