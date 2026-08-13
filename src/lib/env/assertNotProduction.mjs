/**
 * Guardia obligatoria para cualquier script que pueda escribir o borrar datos
 * en Supabase fuera del flujo normal de la app: seeds, tests de integración,
 * scripts de limpieza/reset de staging.
 *
 * Uso obligatorio: llamar ANTES de crear cualquier cliente de Supabase o
 * ejecutar cualquier operación — nunca después.
 *
 *   import { assertNotProduction } from "../src/lib/env/assertNotProduction.mjs";
 *   assertNotProduction("seed-staging");
 *   // ... recién aquí se crea el cliente de Supabase y se insertan datos ...
 *
 * No "adivina": si NEXT_PUBLIC_APP_ENV falta o es inválida, aborta — nunca
 * asume que "probablemente es staging". Nunca imprime SUPABASE_SERVICE_ROLE_KEY
 * ni ninguna clave — solo el ref del proyecto (que ya es público, visible en
 * la URL) a modo de confirmación.
 */
import { getEnvironment } from "./environment.mjs";

/**
 * @param {string} action descripción corta de la acción que se está por hacer
 * @param {Record<string, string | undefined>} [env]
 * @returns {void}
 */
export function assertNotProduction(action, env = process.env) {
  const info = getEnvironment(env);

  if (!info.appEnv) {
    throw new Error(
      `[assertNotProduction] "${action}" abortado: NEXT_PUBLIC_APP_ENV no está definida o no es válida ` +
        `("${info.raw ?? "(vacío)"}"). No se adivina el entorno — corrígelo antes de reintentar.`
    );
  }

  if (info.appEnv === "production") {
    throw new Error(
      `[assertNotProduction] "${action}" abortado: NEXT_PUBLIC_APP_ENV=production. ` +
        `Esta acción está bloqueada explícitamente contra producción.`
    );
  }

  if (!info.coherent) {
    throw new Error(
      `[assertNotProduction] "${action}" abortado por configuración inconsistente: ${info.warnings.join(" ")}`
    );
  }

  console.log(
    `[assertNotProduction] OK — "${action}" corre contra STAGING (ref="${info.supabaseProjectRef ?? "desconocido"}").`
  );
}
