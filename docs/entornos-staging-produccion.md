# Entornos: STAGING vs PRODUCTION

**Estado: diseño/configuración. El proyecto Supabase de STAGING (D11, aprobada — Opción A) todavía no existe — nadie lo ha creado.** Este documento prepara al repositorio para recibirlo, pero crearlo en Supabase es una acción tuya (Fase 2B, bloque B1).

---

## 1. Principio: mismos nombres de variable, valores distintos por entorno

Las variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_BUCKET`) se llaman **igual** en ambos entornos — no `_STAGING`/`_PRODUCTION` como sufijo. Es deliberado: si el código tuviera que decidir en tiempo de ejecución cuál variable leer según el entorno, cada nueva variable sería una oportunidad de bug ("¿usé la de staging o la de production aquí?"). En cambio, el entorno se resuelve **fuera del código**, en qué archivo/configuración se cargó — el código de la aplicación (`src/supabase/client.ts`, futuros Server Actions) nunca necesita saber en qué entorno está para leer sus credenciales, solo para decidir si mostrar el aviso visual del punto 3.

Lo único que identifica el entorno explícitamente es una variable nueva, no secreta:

```
NEXT_PUBLIC_APP_ENV=staging      # o "production"
```

## 2. Archivos, uno por entorno

| Archivo | Contenido | ¿Se versiona en Git? |
|---|---|---|
| `.env.example` | Plantilla genérica (uso histórico previo a esta separación) | ✅ Sí — sin valores reales |
| `.env.staging.example` | Plantilla para STAGING | ✅ Sí — sin valores reales |
| `.env.production.example` | Plantilla para PRODUCTION | ✅ Sí — sin valores reales |
| `.env.staging.local` | Valores REALES de STAGING | ❌ **Nunca** — cubierto por `.env*.local` en `.gitignore` |
| `.env.production.local` | Valores REALES de PRODUCTION | ❌ **Nunca** — igual |
| `.env.local` | Lo que Next.js realmente lee | ❌ **Nunca** — es un symlink, no un archivo con contenido propio (punto 3) |

`.gitignore` se actualizó (`.env*.local`) para cubrir cualquier variante presente o futura, no solo `.env.local` a secas — el `.gitignore` anterior solo bloqueaba `.env.local`/`.env`, no habría protegido `.env.staging.local` automáticamente.

## 3. Cómo se cambia de entorno en local (sin nueva dependencia)

Next.js solo carga automáticamente `.env.local` — no existe un modo "staging" nativo. En vez de mantener dos copias que puedan quedar desincronizadas, `.env.local` es un **symlink** hacia el archivo real activo:

```bash
npm run env:staging      # .env.local → .env.staging.local (uso normal durante la Fase 2B)
npm run env:production   # .env.local → .env.production.local (excepcional, con cuidado)
```

Cambiar de entorno es un comando explícito y visible — nunca un accidente silencioso. Como cada archivo `.env.*.local` trae su propio `NEXT_PUBLIC_APP_ENV`, la app siempre sabe con certeza en cuál está corriendo, sin adivinar.

**Primer uso (cuando exista el proyecto de staging):**
```bash
cp .env.staging.example .env.staging.local   # completar con los valores reales del proyecto de STAGING
cp .env.production.example .env.production.local  # completar con los valores reales de PRODUCTION (solo si vas a necesitarlo en local — normalmente no)
npm run env:staging
npm run dev
```

## 4. Vercel (despliegues, no local)

Vercel permite valores distintos para la misma variable según el **scope** de entorno (Production / Preview / Development) — no hace falta crear un segundo proyecto de Vercel:

- Scope **Production** → valores de PRODUCTION (los que ya están configurados hoy).
- Scope **Preview** (y opcionalmente Development) → valores de STAGING, una vez exista ese proyecto Supabase.

Esto es configuración del dashboard de Vercel — **no se toca en este documento ni en esta sesión**, es una acción tuya cuando decidas desplegar una preview contra staging.

## 5. Banner visible de entorno (previsto para la Fase 2B, bloque B1 — no implementado todavía)

Un componente simple en `AdminShell.tsx` (y opcionalmente en el layout del wizard público) que lee `process.env.NEXT_PUBLIC_APP_ENV` y muestra una franja de color inconfundible ("⚠ ESTÁS EN STAGING — datos de prueba") cuando el valor no es `"production"`. Sin esto, alguien podría estar mirando el panel admin de staging y creer que está viendo datos reales. Se construye en el bloque B1 de la Fase 2B (ver plan), no en esta fase de preparación.

## 6. Qué NO hacer

- **No copiar datos de producción a staging.** STAGING se puebla con productos/imágenes/testimonios **ficticios**, creados a mano o con un seed de prueba — nunca un `pg_dump`/exportación de la base real. Evita mezclar datos personales de clientes reales en un entorno con menos cuidado operativo.
- **No poner ningún valor real en `.env.example`, `.env.staging.example` ni `.env.production.example`** — son plantillas versionadas, quedan vacías a propósito.
- **No pegar claves en el chat ni en ningún documento de `docs/`** — mismo criterio ya establecido desde la Fase 0.
- **No usar la `service_role` de PRODUCTION en ningún momento durante desarrollo/pruebas** — con staging existiendo, ya no hay ninguna razón para que código en desarrollo toque la `service_role` real.

## 7. Resumen para cuando crees el proyecto de STAGING (tu acción, no de esta sesión)

1. Crear un proyecto nuevo en supabase.com (plan gratuito alcanza para pruebas).
2. Aplicar ahí las migraciones versionadas de `supabase/migrations/` (ver `supabase/migrations/README.md`) — el mismo SQL que eventualmente irá a producción.
3. Copiar `.env.staging.example` → `.env.staging.local`, completar con las credenciales de ese proyecto nuevo.
4. Poblar con datos ficticios (unos pocos productos de prueba, marcados claramente como tales).
5. `npm run env:staging && npm run dev` — confirmar que el banner (una vez exista, B1) muestre "STAGING".
