# Fase 2B/B8 — Cierre formal (producción)

**Fecha de cierre:** 2026-08-16
**Estado:** ✅ CERRADO — personalizador "Personaliza tu portátil" desplegado, verificado y con primera cotización real validada en producción.

Este documento cierra formalmente B8. El detalle operativo completo (comandos, verificaciones READ ONLY punto por punto, sanitización) vive en `docs/fase2b-b8-preflight-final.md` — aquí se resume el resultado, no se repite el procedimiento.

---

## 1. Resumen ejecutivo

| Hito | Estado |
|---|---|
| Preview (`release/personalizador`) validado manualmente contra STAGING | ✅ |
| Bug de `EnvironmentBanner` (env vars no inlineadas en cliente) encontrado y corregido | ✅ commit `7641b35` |
| Migración de adopción aplicada en producción | ✅ Push 1 |
| Seguridad Fase 0.1 aplicada en producción | ✅ Push 2 |
| 5 migraciones del personalizador aplicadas en producción | ✅ Push 3 |
| Baseline de STAGING (`20260812220000_baseline_esquema_actual.sql`) | ✅ NUNCA aplicada a producción (confirmado en las 3 rondas de `migration list`) |
| Merge `release/personalizador` → `main` | ✅ commit `821aab2` (`--no-ff`) |
| Push a `main` / deploy automático en Vercel Production | ✅ `e57d645..821aab2` |
| Validación manual de producción (inicio, catálogo, producto, WhatsApp, admin) | ✅ confirmada por el administrador |
| `/personalizar` funcionando en producción | ✅ confirmado por el administrador |
| Primera cotización real creada y verificada | ✅ confirmada por el administrador (`sistetecni.com/personalizar` → `/admin/cotizaciones`) |
| Datos reales existentes preservados | ✅ 16 productos intactos en todo momento |

---

## 2. Migraciones aplicadas en producción, en orden

1. `20260812210000_adopcion_esquema_produccion.sql` — anclaje histórico honesto del tracking de migraciones (no-op, `select 1;`). Sin esta migración, Supabase no podía distinguir "ya aplicado antes de que existiera tracking" de "pendiente".
2. `20260812215000_fase01_seguridad_produccion.sql` — correcciones de la auditoría original (`docs/00-auditoria-supabase.md`): elimina la policy pública `service_role full access` sobrante en `products`; activa RLS + políticas en `gallery_images`; endurece las policies de `storage.objects` del bucket `products` (INSERT/UPDATE/DELETE ahora requieren `is_admin`); agrega policies admin-only para los buckets `gallery` y `assets`.
3. `20260812223000_products_personalizador_columns.sql` — 6 columnas nuevas, aditivas y nullable, en `products`.
4. `20260812223100_upgrade_options.sql` — tabla nueva, catálogo de upgrades.
5. `20260812223200_product_upgrade_options.sql` — tabla nueva, compatibilidad explícita producto↔upgrade.
6. `20260812223300_quote_requests.sql` — tabla nueva, cotizaciones con snapshot congelado.
7. `20260813010000_fix_quote_requests_code_comment.sql` — corrección menor de comentario, sin cambio de esquema.

**Nunca aplicada:** `20260812220000_baseline_esquema_actual.sql` (existe solo para que STAGING pueda reconstruirse desde cero; producción ya tenía ese esquema por otras vías, aplicarla habría sido redundante y se excluyó deliberadamente en las 3 rondas de `db push`).

Mecanismo usado en las 3 rondas: exclusión temporal de archivos fuera de `supabase/migrations/` (nunca `migration repair`), restauración verificada byte-idéntica (`git diff --quiet`) después de cada una. Detalle completo en `docs/fase2b-b8-preflight-final.md`.

---

## 3. Seguridad — estado verificado

| Verificación | Resultado |
|---|---|
| `service_role full access` en `products` | ✅ eliminada |
| `gallery_images` RLS | ✅ activo (antes: inactivo) |
| Buckets `products`/`gallery`/`assets`: escritura restringida a `is_admin` | ✅ |
| `upgrade_options`: lectura pública, escritura solo `authenticated` + `is_admin` | ✅ |
| `product_upgrade_options`: lectura pública, escritura solo `authenticated` + `is_admin` | ✅ |
| `quote_requests`: **sin** lectura pública, gestión solo `authenticated` + `is_admin` | ✅ (acceso de un cliente a su propia cotización pasa por Route Handler server-side con `service_role`, nunca por RLS pública) |
| FK, PK, UNIQUE, CHECK de las 3 tablas nuevas | ✅ verificados contra el esquema real |

---

## 4. Datos reales — preservados

- `products`: 16 filas reales en todo momento (verificado antes de Push 2, después de Push 2 y después de Push 3 — sin variación).
- Ningún dato `[SEED]` de STAGING fue copiado a producción.
- `upgrade_options` / `product_upgrade_options`: 0 filas al cierre de Push 3 (infraestructura lista, sin datos inventados).
- `quote_requests`: 1 fila — **la cotización real de validación creada manualmente por el administrador**, no una anomalía. Se conserva como primer registro real de producción.

---

## 5. Validación funcional en producción (confirmada manualmente por el administrador)

- Catálogo anterior (`/catalog`, `/product`) — intacto, sin regresión.
- Botón de WhatsApp — funcionando.
- Login admin — funcionando.
- Edición/guardado de producto desde admin — funcionando.
- Panel `/admin` completo (productos, upgrades, compatibilidad, cotizaciones) — funcionando.
- `/personalizar` (wizard público) — funcionando.
- **Cotización real de extremo a extremo**: creada desde `sistetecni.com/personalizar`, verificada en `/admin/cotizaciones` — código correcto, producto/configuración correctos, precio correcto, aparece en el panel, información coincide entre lo visto por el cliente y lo visto por el admin.

A nivel de código (no solo por confirmación visual), el snapshot congelado está garantizado estructuralmente: `quote_requests.base_price_snapshot`, `base_config_snapshot` y `selected_upgrades_snapshot` se escriben una sola vez al crear la fila y nunca se recalculan al leerla — ni el Route Handler de consulta por código ni la página admin de detalle vuelven a tocar `products` o `upgrade_options` para recomponer el precio.

---

## 6. Nota de calidad de datos — `touch_screen`

A diferencia de las otras 5 columnas nuevas de `products` (que quedaron en `null` = "no confirmado" para los 16 productos reales), `touch_screen` se definió con `default false` en la migración (`20260812223000_products_personalizador_columns.sql`). Esto significa que los 16 productos reales muestran `touch_screen = false` **por el valor por defecto de la columna, no porque cada uno haya sido confirmado individualmente como no-táctil**. Es una decisión de diseño documentada (características físicas del panel casi nunca son táctiles en el parque de equipos reacondicionados que maneja el negocio), pero es la única excepción a la regla general "null = no confirmado, nunca se asume". Si alguno de los 16 equipos reales sí es táctil, requiere corrección manual explícita — el motor de matching no lo detectará solo.

---

## 7. Riesgos y deuda pendiente

1. **Ningún producto real puede aparecer todavía en resultados del personalizador**: `storage_gb` es `null` en los 16 (y es el único campo que el motor revisa en *toda* búsqueda, sin excepción — `ramMinGb`/`storageMinGb` son siempre obligatorios y positivos). Hasta que el admin complete `storage_gb` de al menos un producto, el personalizador no puede producir resultados reales. Documentado con guía de campos entregada al usuario.
2. `upgrade_options` y `product_upgrade_options` en 0 — pendiente de creación progresiva desde `/admin/upgrades` y compatibilidad por producto. Sin precios ni compatibilidades inventadas por esta sesión.
3. Bucket huérfano `product-images` (detectado en la auditoría original, `docs/00-auditoria-supabase.md`) — sigue sin resolver. No bloqueante; vale la pena confirmar que ninguna variable de entorno apunte ahí por error.
4. Nota de calidad de datos de `touch_screen` (sección 6) — no es un bug, pero es deuda de verificación manual pendiente.
5. El agente de IA (`sistetecni-ai-agent`) aún no está conectado a Supabase producción — próxima fase, ver `docs/handoff-agente-supabase.md`.

---

## 8. Mantenimiento post-deploy recomendado

- Revisar `/admin/cotizaciones` periódicamente — es la única vía de lectura del listado completo de cotizaciones (RLS deliberadamente sin lectura pública).
- Completar progresivamente los 6 campos del personalizador en `/admin/productos`, empezando por `storage_gb` (bloqueante) en los productos que se quieran ofrecer en el wizard.
- Al crear upgrades y compatibilidades, seguir siempre el flujo manual documentado (sin inferencia, sin copiar entre productos salvo unidades verificadas como equivalentes vía D3).
- Si se agrega en el futuro un nuevo componente cliente que lea variables `NEXT_PUBLIC_*`, replicar el patrón de acceso **literal y estático** ya documentado en `src/components/EnvironmentBanner.tsx` — el bug de esta fase (acceso dinámico a `process.env` no inlineado por Next.js) puede repetirse en cualquier componente nuevo que no siga ese patrón.
- Revisar periódicamente que las policies de seguridad de la sección 3 no se hayan revertido accidentalmente por una migración futura mal escrita.

---

## 9. Referencias

- Plan original: `docs/fase2b-b8-plan-produccion.md`
- Decisiones cerradas (A-H): `docs/fase2b-b8-decisiones-cerradas.md`
- Preflight, ejecución y verificación detallada de las 3 rondas de `db push`: `docs/fase2b-b8-preflight-final.md`
- Auditoría original de seguridad: `docs/00-auditoria-supabase.md`
- Diseño funcional del personalizador: `docs/fase2a-personalizador-diseno.md`
- Handoff para la conexión futura del agente de IA: `docs/handoff-agente-supabase.md`

**B8 queda cerrado.** No quedan acciones de código ni de base de datos pendientes de esta fase. Las siguientes acciones son exclusivamente de datos (administración progresiva desde el panel) y, en una fase separada y no autorizada todavía, la conexión del agente de IA.
