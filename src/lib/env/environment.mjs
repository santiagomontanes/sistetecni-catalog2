/**
 * Detección central de entorno (STAGING vs PRODUCTION).
 *
 * Todo lo demás (EnvironmentBanner, assertNotProduction, scripts de seed/reset)
 * pasa por getEnvironment() — nunca leen NEXT_PUBLIC_APP_ENV por su cuenta.
 * Nada aquí adivina el entorno: si falta o es inválido, se reporta como tal,
 * nunca se asume un valor por defecto.
 *
 * Escrito en JavaScript plano (con JSDoc para tipos) en vez de TypeScript a
 * propósito: así se puede importar sin compilar tanto desde el código de
 * Next.js (que sí type-checkea vía environment.d.ts) como desde scripts Node
 * sueltos (scripts/seed-staging.mjs) y sus tests (`node --test`), sin
 * necesitar `tsc` ni ningún paso de build — este proyecto corre en un Node
 * cuya versión no soporta TypeScript nativo (ver docs/entornos-staging-
 * produccion.md).
 */

/** @typedef {"staging" | "production"} AppEnv */

/**
 * @typedef {object} EnvironmentInfo
 * @property {AppEnv | null} appEnv
 * @property {string | undefined} raw
 * @property {string | undefined} supabaseUrl
 * @property {string | null} supabaseProjectRef
 * @property {string | undefined} productionProjectRef
 * @property {boolean} coherent
 * @property {string[]} warnings
 */

/** @type {readonly AppEnv[]} */
const VALID_APP_ENVS = ["staging", "production"];

/**
 * @param {string | undefined} value
 * @returns {value is AppEnv}
 */
function isValidAppEnv(value) {
  return VALID_APP_ENVS.includes(/** @type {AppEnv} */ (value));
}

/**
 * Extrae el "project ref" (subdominio) de una URL de Supabase. null si no se puede.
 * @param {string | undefined} supabaseUrl
 * @returns {string | null}
 */
export function extractProjectRef(supabaseUrl) {
  if (!supabaseUrl) return null;
  try {
    const { hostname } = new URL(supabaseUrl);
    const [ref] = hostname.split(".");
    return ref || null;
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, string | undefined>} [env] fuente de variables — por
 *   defecto `process.env`. Recibir un objeto explícito (en vez de leer
 *   `process.env` siempre por dentro) es lo que hace esta función testeable
 *   sin mutar variables de entorno globales.
 * @returns {EnvironmentInfo}
 */
export function getEnvironment(env = process.env) {
  const raw = env.NEXT_PUBLIC_APP_ENV;
  const appEnv = isValidAppEnv(raw) ? raw : null;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseProjectRef = extractProjectRef(supabaseUrl);
  const productionProjectRef = env.SUPABASE_PROJECT_REF_PRODUCTION;

  /** @type {string[]} */
  const warnings = [];
  let coherent = true;

  if (!raw) {
    warnings.push("NEXT_PUBLIC_APP_ENV no está definida.");
    coherent = false;
  } else if (!appEnv) {
    warnings.push(
      `NEXT_PUBLIC_APP_ENV="${raw}" no es un valor válido (solo "staging" o "production").`
    );
    coherent = false;
  }

  if (!supabaseUrl) {
    warnings.push("NEXT_PUBLIC_SUPABASE_URL no está definida.");
    coherent = false;
  }

  // Comprobación de coherencia fuerte: si decimos estar en staging, la URL
  // NUNCA debe coincidir con el proyecto de producción conocido. Solo puede
  // evaluarse donde SUPABASE_PROJECT_REF_PRODUCTION esté disponible (server-
  // side/scripts Node) — en el navegador esa variable no existe (sin prefijo
  // NEXT_PUBLIC_) y esta comprobación se omite sin marcar coherent=false.
  if (
    appEnv === "staging" &&
    productionProjectRef &&
    supabaseProjectRef &&
    supabaseProjectRef === productionProjectRef
  ) {
    warnings.push(
      `NEXT_PUBLIC_APP_ENV=staging pero NEXT_PUBLIC_SUPABASE_URL apunta al proyecto de PRODUCCIÓN conocido (ref="${supabaseProjectRef}").`
    );
    coherent = false;
  }

  return {
    appEnv,
    raw,
    supabaseUrl,
    supabaseProjectRef,
    productionProjectRef,
    coherent,
    warnings,
  };
}
