# Migraciones — SISTETECNI Catalog

**Ninguna de estas migraciones ha sido ejecutada.** Están escritas y versionadas, listas para revisión y para aplicarse primero en STAGING cuando exista (D11), nunca directamente en producción.

## Convención

Un archivo por migración, nombrado `<timestamp>_<descripcion>.sql`, en orden de aplicación. Es la misma convención que usa el [Supabase CLI](https://supabase.com/docs/guides/cli) (`supabase migration new <nombre>`), adoptada desde ya para que, cuando se instale el CLI (Fase 2B, bloque B1), reconozca estos archivos sin necesidad de renombrarlos.

## Estado actual

| Archivo | Contenido | Aplicada en STAGING | Aplicada en PRODUCTION |
|---|---|---|---|
| `20260812223000_products_personalizador_columns.sql` | 6 columnas nuevas aditivas en `products` | ❌ No | ❌ No |
| `20260812223100_upgrade_options.sql` | Tabla `upgrade_options` + RLS + policies | ❌ No | ❌ No |
| `20260812223200_product_upgrade_options.sql` | Tabla `product_upgrade_options` + RLS + policies | ❌ No | ❌ No |
| `20260812223300_quote_requests.sql` | Tabla `quote_requests` + RLS + policy | ❌ No | ❌ No |

Deben aplicarse **en este orden** — la 3 depende de que la 1 y la 2 ya existan (foreign keys), y la 4 depende de la 1.

**No incluida aquí:** `docs/fase0.1-correccion-propuesta.sql` (la corrección de seguridad de `products`/`gallery_images`/Storage) — sigue como propuesta separada, pendiente de tu autorización, sin relación con el ciclo de vida de estas 4 migraciones del personalizador. Si decides aplicarla a STAGING antes de las 4 de arriba (recomendable, para probar el personalizador contra un esquema ya corregido), es una decisión tuya de orden, no algo que este README asuma.

## Flujo previsto (Fase 2B, bloque B1 — todavía no ejecutado)

1. Crear el proyecto Supabase de STAGING (tu acción).
2. Instalar el Supabase CLI (herramienta nueva, fuera de `package.json` — se pedirá confirmación explícita antes, igual que con `zod`).
3. `supabase link --project-ref <ref-de-staging>`
4. `supabase db push` — aplica las 4 migraciones de esta carpeta, en orden, a STAGING.
5. Verificar con una consulta de descubrimiento (mismo patrón de `docs/fase0-descubrimiento-export.sql`) que el esquema quedó exactamente como se propuso.
6. Backfill de datos ficticios de prueba en STAGING.
7. Desarrollo y pruebas de la Fase 2B contra STAGING.
8. Solo con tu autorización explícita, y por separado: `supabase link --project-ref <ref-de-produccion>` + `supabase db push` contra PRODUCTION — la MISMA carpeta de migraciones, sin ningún cambio manual entre un entorno y otro.

## Reglas

- Nunca editar una migración ya aplicada (ni en staging ni en producción) — los cambios posteriores van en un archivo nuevo, con timestamp mayor.
- Cada archivo nuevo debe incluir su rollback comentado al final, mismo patrón que los 4 actuales.
- Nada se aplica a PRODUCTION sin haber pasado antes por STAGING y sin autorización explícita separada.
