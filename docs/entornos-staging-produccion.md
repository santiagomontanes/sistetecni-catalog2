# Entornos: STAGING vs PRODUCTION

**Estado: preparación completa del lado del código. El proyecto Supabase de STAGING (D11, Opción A) todavía NO existe — nadie lo ha creado.** Todo lo de este documento describe piezas ya escritas y (donde fue posible verificarlo sin Supabase) probadas localmente — ver `src/lib/env/` y `scripts/`. Nada se ha ejecutado contra ningún proyecto Supabase real.

---

## 1. Principio: mismos nombres de variable, valores distintos por entorno

Las variables de datos (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_BUCKET`) se llaman **igual** en ambos entornos — no `_STAGING`/`_PRODUCTION` como sufijo. Si el código tuviera que decidir en tiempo de ejecución cuál variable leer según el entorno, cada variable nueva sería una oportunidad de bug. El entorno se resuelve **fuera del código de negocio**, en una capa central única: `src/lib/env/`.

## 2. Variables — cuáles son públicas y cuáles server-only

| Variable | Alcance | Es secreta | Quién la usa |
|---|---|---|---|
| `NEXT_PUBLIC_APP_ENV` | público (navegador) | No | `EnvironmentBanner`, `getEnvironment()` en cualquier contexto |
| `NEXT_PUBLIC_SUPABASE_URL` | público | No | Cliente Supabase (browser y server), `getEnvironment()` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | público | No (por diseño de Supabase — la protección real es RLS) | Cliente Supabase del navegador |
| `NEXT_PUBLIC_SUPABASE_BUCKET` | público | No | Subida/lectura de Storage |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | **Sí — nunca en el navegador, nunca en logs** | Server Actions/Route Handlers/scripts que necesiten bypasear RLS |
| `SUPABASE_PROJECT_REF_PRODUCTION` | server-only (no necesita estarlo por secreto — el ref ya es público en la URL — pero no hace falta exponerlo al navegador) | No | `assertNotProduction()`, para la validación de coherencia |

`APP_ENV` del brief conceptual se implementa como `NEXT_PUBLIC_APP_ENV`: Next.js solo expone al navegador las variables con ese prefijo, y el `EnvironmentBanner` (componente de cliente) necesita leerla — por eso lleva el prefijo, aunque conceptualmente sea "la misma" variable que describiste.

## 3. La capa central: `src/lib/env/`

Implementada en JavaScript plano + `.d.ts` (no TypeScript directo) — **motivo:** este proyecto corre sobre Node 18.19.1 (confirmado en esta sesión), que no soporta ejecutar `.ts` nativamente, y añadir un compilador/test-runner nuevo (`tsx`, `ts-node`) sería una dependencia nueva sin necesidad real. Con `.mjs` + `.d.ts`:
- Next.js lo type-checa igual (vía el `.d.ts`) al importarlo desde componentes `.tsx`.
- Los scripts sueltos (`scripts/seed-staging.mjs`) lo importan sin compilar nada.
- Los tests corren con `node --test`, sin dependencias nuevas.

**Archivos:**
```
src/lib/env/
  environment.mjs              getEnvironment(), extractProjectRef()
  environment.d.ts             tipos para consumidores TypeScript
  environment.test.mjs         17 tests, node:test — ejecutados y en verde
  assertNotProduction.mjs      la guardia obligatoria para scripts destructivos
  assertNotProduction.d.ts
  assertNotProduction.test.mjs
```

### `getEnvironment(env?)`

Función central y pura — recibe un objeto de variables (por defecto `process.env`), nunca lee `process.env` "a escondidas" dentro de otras funciones. Devuelve `{ appEnv, raw, supabaseUrl, supabaseProjectRef, productionProjectRef, coherent, warnings }`.

Valida:
1. `NEXT_PUBLIC_APP_ENV` existe y es exactamente `"staging"` o `"production"` — cualquier otro valor (u ausencia) → `appEnv: null`, `coherent: false`. **Nunca asume un valor por defecto.**
2. `NEXT_PUBLIC_SUPABASE_URL` existe.
3. Si `appEnv === "staging"` y `SUPABASE_PROJECT_REF_PRODUCTION` está disponible (contexto server-side): el ref extraído de la URL actual **no debe coincidir** con el de producción. Si coincide → `coherent: false`, con el warning explícito.

### `assertNotProduction(action, env?)`

Construida sobre `getEnvironment()`. Lanza (`throw`) — no retorna un booleano — para que sea imposible ignorar el resultado por accidente:

1. `appEnv` es `null` (no definida o inválida) → **aborta**. No adivina.
2. `appEnv === "production"` → **aborta siempre**, sin excepción — es literalmente su propósito.
3. `!coherent` (incluye el caso "staging apuntando a la URL de producción") → **aborta**.
4. Si nada de lo anterior disparó: imprime una única línea de confirmación con el **ref del proyecto** (dato público) — **nunca** `SUPABASE_SERVICE_ROLE_KEY` ni ninguna clave. Verificado con un test dedicado (`assertNotProduction.test.mjs`, caso "nunca incluye la service_role key en su mensaje").

**Uso obligatorio, ya implementado:** primera línea ejecutable de `scripts/seed-staging.mjs`, antes de importar siquiera `@supabase/supabase-js`. Cualquier script futuro de reset/limpieza de staging (Fase 2B, bloque B7) debe seguir el mismo patrón.

### Tests — ejecutados, en verde

```
$ npm run test:env
# tests 17
# pass 17
# fail 0
```
Cubren: extracción de project ref, los 3 tipos de incoherencia (`APP_ENV` ausente, inválida, o apuntando a producción conocida), y que la service key nunca se filtra en un mensaje de error.

## 4. Archivos `.env.*`, uno por entorno

| Archivo | Contenido | ¿Se versiona en Git? |
|---|---|---|
| `.env.example` | Plantilla genérica (uso histórico) | ✅ Sí — sin valores reales |
| `.env.staging.example` | Plantilla para STAGING, incluye `SUPABASE_PROJECT_REF_PRODUCTION` | ✅ Sí — sin valores reales |
| `.env.production.example` | Plantilla para PRODUCTION | ✅ Sí — sin valores reales |
| `.env.staging.local` | Valores REALES de STAGING | ❌ **Nunca** — `.env*.local` en `.gitignore` |
| `.env.production.local` | Valores REALES de PRODUCTION | ❌ **Nunca** |
| `.env.local` | Lo que Next.js realmente lee — generado, no editado a mano | ❌ **Nunca** |

`.gitignore` cubre `.env*.local` (patrón, no solo el nombre exacto `.env.local`) — verificado antes de tocar nada de esto en esta sesión.

## 5. Cómo se cambia de entorno en local — copia, no symlink

**Cambio de diseño respecto a la propuesta anterior de este documento.** La primera versión proponía un symlink (`.env.local → .env.staging.local`). Se descartó:

- **Riesgo real detectado:** escribir en `.env.local` con un editor de texto sigue el symlink y modifica silenciosamente el archivo fuente (`.env.staging.local`) sin que se note — alguien podría creer que está tocando un archivo "desechable" y en realidad estar editando la fuente de verdad de staging.
- **Alternativa elegida:** `scripts/switch-env.mjs` **copia** el contenido de `.env.<entorno>.local` hacia `.env.local`, anteponiendo un encabezado autogenerado ("NO EDITAR A MANO — edita .env.staging.local"). Editar `.env.local` por error ya no daña nada: la próxima vez que se corra el comando, se sobrescribe igual.
- El comando imprime con qué `NEXT_PUBLIC_APP_ENV` quedó el archivo (leído del contenido real, no una suposición) y, si el destino es `production`, una advertencia visual adicional. **Nunca imprime la URL completa ni ninguna clave.**

```bash
npm run env:staging      # copia .env.staging.local → .env.local
npm run env:production   # copia .env.production.local → .env.local (con advertencia extra)
```

**Por qué esto NO es la barrera de seguridad real (y no pretende serlo):** aunque alguien corra `env:production` y después intente ejecutar `seed-staging` sin darse cuenta, `assertNotProduction()` (sección 3) lo bloquea en ese momento — la seguridad real no depende de que el desarrollador recuerde en qué entorno está, depende de que el script se niegue a actuar si detecta `production`. El comando `env:*` es solo conveniencia y visibilidad, nunca el único control.

**Primer uso (cuando exista el proyecto de staging):**
```bash
cp .env.staging.example .env.staging.local   # completar con los valores reales del proyecto de STAGING
npm run env:staging
npm run dev
```

## 6. Vercel (despliegues, no local — sin tocar en esta sesión)

Vercel permite valores distintos para la misma variable según el **scope** de entorno (Production / Preview / Development) — no hace falta un segundo proyecto de Vercel. Scope Production → valores reales actuales; scope Preview → valores de STAGING, una vez exista. Acción tuya, en el dashboard de Vercel, cuando decidas desplegar una preview contra staging.

## 7. Banner de entorno — implementado

`src/components/EnvironmentBanner.tsx`, montado una sola vez en `src/app/layout.tsx` (cubre toda la app, pública y admin, porque el layout raíz envuelve ambas). Comportamiento:

| `NEXT_PUBLIC_APP_ENV` | Qué se muestra |
|---|---|
| `"production"` | Nada — sin banner, cero fricción visual en producción normal |
| `"staging"` | Franja ámbar fija arriba: "⚠ STAGING — datos de prueba, no es el sitio real (ref)" |
| ausente / inválida | Franja roja: "⚠ ENTORNO NO CONFIGURADO" — el silencio en este caso sería peor: es la misma confusión que se busca evitar, solo que al revés |

Es un aviso visual únicamente — la barrera real para acciones destructivas es `assertNotProduction()` (sección 3), que no depende de que nadie mire la pantalla.

## 8. Seed de datos ficticios para STAGING — escrito, no ejecutado

`scripts/seed-staging.mjs` — 7 productos ficticios (prefijo `[SEED]` en el título, IDs fijos reconocibles `10000000-...`), 4 `upgrade_options`, y las filas de `product_upgrade_options` necesarias para cubrir: equipo que ya cumple, que necesita RAM, que necesita SSD, que admite ambos, que no admite ninguno, uno agotado, y uno por encima de presupuesto típico. Llama a `assertNotProduction("seed-staging")` como primera línea ejecutable, antes de crear el cliente de Supabase.

**No se ha ejecutado** — no hay proyecto de STAGING contra el cual correrlo, y tampoco están instaladas las dependencias del proyecto (`node_modules`) en esta sesión (ver el cierre de este documento).

## 9. Qué NO hacer

- **No copiar datos de producción a staging** — el seed es 100% inventado.
- **No poner valores reales en ningún `.env.*.example`** — quedan vacíos a propósito.
- **No pegar claves en el chat ni en `docs/`.**
- **No usar la `service_role` de PRODUCTION durante desarrollo/pruebas.**
- **No editar `.env.local` a mano** — editar `.env.staging.local`/`.env.production.local` y volver a correr `npm run env:*`.

## 10. Resumen para cuando crees el proyecto de STAGING (tu acción)

1. Crear un proyecto nuevo en supabase.com (plan gratuito alcanza).
2. `supabase link` + `supabase db push` — aplica `supabase/migrations/` (ver su README).
3. Copiar `.env.staging.example` → `.env.staging.local`, completar con las credenciales del proyecto nuevo, y también con `SUPABASE_PROJECT_REF_PRODUCTION` (el ref de tu proyecto de PRODUCCIÓN real — para que `assertNotProduction()` pueda comparar).
4. `npm run env:staging && npm install && npm run seed:staging` — puebla los datos ficticios.
5. `npm run dev` — confirmar que el banner muestre "STAGING".
