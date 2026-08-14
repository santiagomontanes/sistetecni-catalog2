# Migraciones — SISTETECNI Catalog

## Estado actual (actualizado en Fase 2B/B8)

### Aplicadas y verificadas en STAGING (Fase 2B/B1, confirmado Local=Remote en B7)

| Archivo | Contenido | STAGING | PRODUCCIÓN |
|---|---|---|---|
| `20260812220000_baseline_esquema_actual.sql` | Reconstrucción del esquema real de producción (5 tablas base + 3 correcciones de seguridad A/B/C) — **exclusiva de STAGING**, nunca debe aplicarse a producción (ver nota abajo) | ✅ Aplicada | ❌ **Nunca** — ver `docs/fase2b-b8-plan-produccion.md` §2 |
| `20260812223000_products_personalizador_columns.sql` | 6 columnas nuevas aditivas en `products` | ✅ Aplicada | ⏳ Preparada, pendiente de tu autorización de ejecución |
| `20260812223100_upgrade_options.sql` | Tabla `upgrade_options` + RLS + policies | ✅ Aplicada | ⏳ Preparada |
| `20260812223200_product_upgrade_options.sql` | Tabla `product_upgrade_options` + RLS + policies | ✅ Aplicada | ⏳ Preparada |
| `20260812223300_quote_requests.sql` | Tabla `quote_requests` + RLS + policy | ✅ Aplicada | ⏳ Preparada |
| `20260813010000_fix_quote_requests_code_comment.sql` | Corrige comentario desactualizado de `quote_requests.code` | ✅ Aplicada | ⏳ Preparada |

### Preparadas para PRODUCCIÓN (Fase 2B/B8) — NO aplicadas todavía en ningún entorno

| Archivo | Contenido | STAGING | PRODUCCIÓN |
|---|---|---|---|
| `20260812210000_adopcion_esquema_produccion.sql` | Ancla de historial honesta — declara que el esquema base ya existía en producción antes de este repo, sin ejecutar DDL real (`select 1`) | No necesaria (STAGING ya tiene la baseline) pero inofensiva si se aplica | ⏳ Preparada |
| `20260812215000_fase01_seguridad_produccion.sql` | Bloques A+B+C+D de `docs/fase0.1-correccion-propuesta.sql`, idempotente (`drop policy if exists` antes de cada `create`) | Inofensiva si se aplica (recrea policies ya idénticas) | ⏳ Preparada — corrección bloqueante antes de exponer `quote_requests` |

**Por qué la baseline NUNCA va a producción:** fue escrita para reconstruir un STAGING vacío desde cero. Sus `create policy` no tienen `drop policy if exists` porque STAGING nacía sin ninguna — en producción, esas mismas policies YA existen con el mismo nombre (`products public read`, `products admin write`, etc.), así que un `create policy` sin guardia fallaría. Las dos migraciones nuevas de arriba cubren, de forma segura e idempotente, exactamente lo que producción necesita de la baseline (adopción del esquema base + las mismas 3 correcciones de seguridad, más el Bloque D).

**Mecanismo para aplicar a producción sin tocar la baseline:** dado que `supabase db push` aplica TODAS las migraciones locales no reconocidas como aplicadas en el remoto, y la baseline seguiría apareciendo como "pendiente" para producción (nunca se le aplicó nada), el procedimiento documentado (`docs/fase2b-b8-plan-produccion.md`, actualizado en B8) es mover temporalmente `20260812220000_baseline_esquema_actual.sql` fuera de esta carpeta durante el `db push` contra producción, y devolverlo a su lugar inmediatamente después — una operación de archivos local, nunca `migration repair`, nunca toca ninguna tabla de tracking.

## Convención

Un archivo por migración, nombrado `<timestamp>_<descripcion>.sql`, en orden de aplicación — convención estándar del [Supabase CLI](https://supabase.com/docs/guides/cli).

## Reglas

- Nunca editar una migración ya aplicada (ni en staging ni en producción) — los cambios posteriores van en un archivo nuevo, con timestamp mayor.
- Cada archivo nuevo debe incluir su rollback comentado al final.
- Nada se aplica a PRODUCTION sin autorización explícita separada, verificada fase por fase (ver `docs/fase2b-b8-decisiones-cerradas.md`).
- Las migraciones destinadas a producción se escriben **idempotentes** (`drop policy if exists` + `create`, `if not exists`) para que sean inofensivas si alguna vez se aplican también contra STAGING por accidente.
