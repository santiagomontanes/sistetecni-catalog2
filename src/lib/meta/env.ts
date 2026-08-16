/**
 * Configuración SERVER-ONLY del onboarding de Meta.
 *
 * Mismo patrón que src/supabase/admin.ts: guard manual en vez del paquete
 * `server-only` (no es dependencia de este proyecto y no se añade una por tres
 * líneas de guard), y lectura de variables por NOMBRE, nunca imprimiendo
 * valores.
 *
 * Ninguna de estas variables lleva prefijo NEXT_PUBLIC_, así que Next.js nunca
 * las inyecta en el bundle del navegador. El guard solo convierte un import
 * equivocado en un error inmediato y legible.
 */

if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/meta/env.ts se importó en código que corre en el navegador. " +
      "Este módulo lee META_APP_SECRET y NUNCA debe ejecutarse en el cliente — " +
      "revisa la cadena de imports que llegó hasta aquí."
  );
}

export type FuenteEnv = Record<string, string | undefined>;

export interface ConfigMeta {
  appId: string;
  appSecret: string;
  graphVersion: string;
  redirectUri: string;
}

/**
 * Kill switch. Deliberadamente estricto: solo la cadena exacta "true" habilita
 * las rutas. Cualquier otra cosa —vacío, "TRUE", "1", ausente— las deja en 404.
 * Así el código puede estar desplegado y apagado por defecto.
 */
export function onboardingHabilitado(env: FuenteEnv = process.env): boolean {
  return env.META_ONBOARDING_ENABLED === "true";
}

function requerirVariable(nombre: string, env: FuenteEnv): string {
  const valor = env[nombre];
  if (!valor) {
    // Mensaje con el NOMBRE de la variable, jamás con ningún valor.
    throw new ErrorConfigMeta(
      `Falta la variable de entorno "${nombre}". No se puede operar el callback de Meta sin ella.`
    );
  }
  return valor;
}

/** Error de configuración, distinguible de un fallo de red o de Meta. */
export class ErrorConfigMeta extends Error {
  readonly codigo = "CONFIG_INVALIDA";
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorConfigMeta";
  }
}

/**
 * Lee y valida la configuración. Lazy a propósito (igual que getAdminClient):
 * importar este módulo no falla; falla al intentar USARLO sin configuración,
 * que es cuando el error de verdad importa.
 */
export function configMeta(env: FuenteEnv = process.env): ConfigMeta {
  const graphVersion = env.META_GRAPH_API_VERSION ?? "v25.0";
  if (!/^v\d+\.\d+$/.test(graphVersion)) {
    throw new ErrorConfigMeta(
      'META_GRAPH_API_VERSION debe tener la forma "vNN.N" (por ejemplo v25.0).'
    );
  }

  const redirectUri = requerirVariable("META_OAUTH_REDIRECT_URI", env);
  let origen: URL;
  try {
    origen = new URL(redirectUri);
  } catch {
    throw new ErrorConfigMeta("META_OAUTH_REDIRECT_URI no es una URL válida.");
  }
  // HTTPS siempre. Se admite http SOLO contra loopback, para poder probar en
  // local sin certificado — mismo criterio que el agente aplica a
  // SISTETECNI_WEB_BASE_URL. Meta exige https en la URI registrada, así que
  // esta excepción nunca puede colarse en producción.
  const esLoopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(origen.hostname);
  if (origen.protocol !== "https:" && !(origen.protocol === "http:" && esLoopback)) {
    throw new ErrorConfigMeta(
      "META_OAUTH_REDIRECT_URI debe ser https (se admite http solo contra loopback para desarrollo)."
    );
  }
  if (origen.username || origen.password) {
    throw new ErrorConfigMeta("META_OAUTH_REDIRECT_URI no puede llevar credenciales embebidas.");
  }

  return {
    appId: requerirVariable("META_APP_ID", env),
    appSecret: requerirVariable("META_APP_SECRET", env),
    graphVersion,
    redirectUri,
  };
}

/**
 * Origen de confianza para construir la redirección al resultado.
 *
 * Se deriva de META_OAUTH_REDIRECT_URI —un valor que ponemos nosotros— y NO de
 * la petición entrante. Así el callback no puede convertirse en un redirector
 * abierto ni siquiera manipulando cabeceras Host.
 */
export function origenConfiable(env: FuenteEnv = process.env): string {
  return new URL(configMeta(env).redirectUri).origin;
}
