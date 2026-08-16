/**
 * Única capa que habla con Graph — y el único módulo que llega a ver el token.
 *
 * ── INVARIANTES ──────────────────────────────────────────────────────────
 * 1. Nada de aquí escribe en consola. Ni una línea. El logging se decide en el
 *    borde (route.ts) y solo con campos ya saneados.
 * 2. Los errores llevan un CÓDIGO interno, nunca el cuerpo de la respuesta de
 *    Meta: ese cuerpo puede reflejar los parámetros de la petición, y en la
 *    petición viajan el `code` y el App Secret.
 * 3. Toda llamada tiene timeout explícito. Sin él, una petición colgada dejaría
 *    la función serverless corriendo hasta que la mate la plataforma.
 * 4. Las URLs se construyen con URLSearchParams, nunca concatenando.
 */
import type { ConfigMeta } from "./env";

export type CodigoGraph =
  | "TIMEOUT"
  | "INTERCAMBIO_FALLIDO"
  | "RESPUESTA_INVALIDA"
  | "GRAPH_ERROR"
  | "RED";

export class ErrorGraph extends Error {
  readonly codigo: CodigoGraph;
  constructor(codigo: CodigoGraph, detalle = "") {
    // El mensaje solo lleva el código y, como mucho, el estado HTTP. Nunca el
    // cuerpo devuelto por Meta.
    super(detalle ? `${codigo}: ${detalle}` : codigo);
    this.name = "ErrorGraph";
    this.codigo = codigo;
  }
}

export type FetchImpl = typeof fetch;

interface OpcionesLlamada {
  config: ConfigMeta;
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
}

/** 8 s, el mismo orden de magnitud que usa el agente contra Meta. */
export const TIMEOUT_POR_DEFECTO_MS = 8_000;

/** Tope de cuerpo que aceptamos leer. Las respuestas reales rondan 1 KB. */
const MAX_BYTES_RESPUESTA = 256 * 1024;

async function pedirJson(
  url: URL,
  { metodo = "GET", token, fetchImpl = fetch, timeoutMs = TIMEOUT_POR_DEFECTO_MS }:
    { metodo?: "GET" | "POST"; token?: string; fetchImpl?: FetchImpl; timeoutMs?: number }
): Promise<unknown> {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), timeoutMs);

  let respuesta: Response;
  try {
    respuesta = await fetchImpl(url, {
      method: metodo,
      signal: control.signal,
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } catch (err) {
    // AbortError y fallo de red se distinguen: el primero es nuestro timeout.
    const nombre = err instanceof Error ? err.name : "";
    throw new ErrorGraph(nombre === "AbortError" || nombre === "TimeoutError" ? "TIMEOUT" : "RED");
  } finally {
    clearTimeout(temporizador);
  }

  const crudo = await respuesta.text();
  if (crudo.length > MAX_BYTES_RESPUESTA) {
    throw new ErrorGraph("RESPUESTA_INVALIDA", "cuerpo demasiado grande");
  }

  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    throw new ErrorGraph("RESPUESTA_INVALIDA", `http ${respuesta.status}`);
  }

  if (!respuesta.ok) {
    // Se conserva SOLO el estado HTTP. El objeto `error` de Meta se descarta.
    throw new ErrorGraph("GRAPH_ERROR", `http ${respuesta.status}`);
  }

  return cuerpo;
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/**
 * Intercambia el authorization code por un business token.
 *
 * Forma documentada por Meta (Facebook Login for Business):
 *   GET https://graph.facebook.com/<VERSION>/oauth/access_token
 *       ?client_id=<APP_ID>&client_secret=<APP_SECRET>&code=<CODE>
 *
 * El ejemplo oficial NO incluye `redirect_uri` ni `grant_type`, así que no se
 * envían: añadir parámetros no documentados es la vía rápida a un
 * OAuthException por desajuste.
 *
 * El valor devuelto NO se registra en ningún sitio. Quien lo recibe lo mantiene
 * en una variable local y lo deja morir con la petición.
 */
export async function intercambiarCodePorToken(
  code: string,
  { config, fetchImpl, timeoutMs }: OpcionesLlamada
): Promise<string> {
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/oauth/access_token`);
  url.search = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    code,
  }).toString();

  let cuerpo: unknown;
  try {
    cuerpo = await pedirJson(url, { fetchImpl, timeoutMs });
  } catch (err) {
    // Un fallo aquí casi siempre es code caducado (TTL de 30 s) o ya usado.
    if (err instanceof ErrorGraph && err.codigo === "GRAPH_ERROR") {
      throw new ErrorGraph("INTERCAMBIO_FALLIDO", err.message.replace("GRAPH_ERROR: ", ""));
    }
    throw err;
  }

  const token = esObjeto(cuerpo) ? cuerpo.access_token : undefined;
  if (typeof token !== "string" || token.length === 0) {
    throw new ErrorGraph("RESPUESTA_INVALIDA", "sin access_token");
  }
  return token;
}

export interface MetadataToken {
  appId: string | null;
  esValido: boolean;
  expiraEn: number | null;
  scopes: string[];
}

/**
 * Inspecciona el token SIN mostrarlo: GET /debug_token?input_token=…
 *
 * Se autentica con el token de app (`<APP_ID>|<APP_SECRET>`), que es la forma
 * documentada de credencial de app para este endpoint. Devuelve únicamente
 * metadata; el token inspeccionado no sale de esta función.
 */
export async function inspeccionarToken(
  token: string,
  { config, fetchImpl, timeoutMs }: OpcionesLlamada
): Promise<MetadataToken> {
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/debug_token`);
  url.search = new URLSearchParams({
    input_token: token,
    access_token: `${config.appId}|${config.appSecret}`,
  }).toString();

  const cuerpo = await pedirJson(url, { fetchImpl, timeoutMs });
  const datos = esObjeto(cuerpo) && esObjeto(cuerpo.data) ? cuerpo.data : {};

  const scopes = Array.isArray(datos.scopes)
    ? datos.scopes.filter((s): s is string => typeof s === "string").slice(0, 20)
    : [];

  return {
    appId: typeof datos.app_id === "string" ? datos.app_id : null,
    esValido: datos.is_valid === true,
    expiraEn: typeof datos.expires_at === "number" ? datos.expires_at : null,
    scopes,
  };
}

export interface NumeroWaba {
  id: string;
  displayPhoneNumber: string;
  verifiedName: string | null;
}

/**
 * Lista los números de una WABA.
 *
 * Endpoint documentado en la Phone Number Management API:
 *   GET /<VERSION>/<WABA_ID>/phone_numbers
 * Campos confirmados en esa referencia: `id`, `display_phone_number`,
 * `verified_name`, entre otros.
 */
export async function listarNumerosDeWaba(
  wabaId: string,
  token: string,
  { config, fetchImpl, timeoutMs }: OpcionesLlamada
): Promise<NumeroWaba[]> {
  const url = new URL(
    `https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(wabaId)}/phone_numbers`
  );
  url.search = new URLSearchParams({
    fields: "id,display_phone_number,verified_name",
  }).toString();

  const cuerpo = await pedirJson(url, { token, fetchImpl, timeoutMs });
  const datos = esObjeto(cuerpo) && Array.isArray(cuerpo.data) ? cuerpo.data : [];

  return datos.flatMap((fila): NumeroWaba[] => {
    if (!esObjeto(fila)) return [];
    const id = typeof fila.id === "string" ? fila.id : null;
    const display =
      typeof fila.display_phone_number === "string" ? fila.display_phone_number : null;
    if (!id || !display) return [];
    return [
      {
        id,
        displayPhoneNumber: display,
        verifiedName: typeof fila.verified_name === "string" ? fila.verified_name : null,
      },
    ];
  });
}

/**
 * ⚠️ NO SE LLAMA TODAVÍA — deliberadamente.
 *
 * Suscribir la app a una WABA (`POST /<WABA_ID>/subscribed_apps`) es la
 * operación que conecta de verdad el agente con una cuenta. En esta primera
 * ejecución queremos separar identificar de conectar: si el flujo devolviera
 * una WABA que no es la nuestra, una suscripción automática ya nos habría
 * enganchado a la cuenta de otro.
 *
 * Queda implementada para cuando la autorices explícitamente. Hay un test que
 * comprueba que el callback NUNCA emite esta petición.
 */
export async function suscribirAppAWaba(
  wabaId: string,
  token: string,
  { config, fetchImpl, timeoutMs }: OpcionesLlamada
): Promise<boolean> {
  const url = new URL(
    `https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(wabaId)}/subscribed_apps`
  );
  const cuerpo = await pedirJson(url, { metodo: "POST", token, fetchImpl, timeoutMs });
  return esObjeto(cuerpo) && cuerpo.success === true;
}
