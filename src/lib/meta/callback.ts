/**
 * Orquestación del callback de Embedded Signup.
 *
 * Vive aquí y no en el Route Handler para poder probarlo de forma hermética:
 * recibe una URL y un `fetch` inyectable, y devuelve un objeto plano con SOLO
 * metadata no sensible. El handler es un envoltorio fino que traduce eso a una
 * redirección, igual que src/app/personalizador/actions.ts hace con su núcleo.
 *
 * ── CONTRATO DE ENTRADA: DEFENSIVO ───────────────────────────────────────
 * La documentación oficial de Meta-hosted Embedded Signup NO afirma que el
 * flujo redirija con `?code=…`. Describe el mecanismo `postMessage` del SDK y,
 * para el flujo alojado, un webhook `account_update` con `event=PARTNER_ADDED`.
 * Así que este módulo NO asume un contrato: mira qué llegó y actúa en
 * consecuencia. "No llegó `code`" es una OBSERVACIÓN válida y esperable de la
 * primera ejecución, no un fallo de OAuth.
 */
import { ErrorGraph, inspeccionarToken, intercambiarCodePorToken, listarNumerosDeWaba } from "./graph";
import type { FetchImpl } from "./graph";
import type { ConfigMeta } from "./env";
import { validarState, type ResultadoState } from "./state";
import {
  enmascararTelefono,
  nombresDeParametros,
  normalizarE164,
  sanearIdentificador,
} from "./redactar";

/** El único número que esta incorporación puede dar por bueno. */
export const NUMERO_OBJETIVO_E164 = "573115996339";

export type Coincidencia = "COINCIDE" | "NO_COINCIDE" | "DESCONOCIDO";
export type EstadoCallback = "ok" | "error" | "observacion";

export interface ResultadoCallback {
  estado: EstadoCallback;
  /** Código interno, siempre de nuestro vocabulario. Nunca texto de Meta. */
  codigo: string;
  state: ResultadoState;
  /** Solo NOMBRES de parámetros recibidos. Jamás sus valores. */
  parametros: string[];
  wabaId: string | null;
  phoneNumberId: string | null;
  telefonoEnmascarado: string | null;
  coincide: Coincidencia;
  tokenValido: boolean | null;
  scopes: string[];
}

/**
 * Errores que Meta puede devolver en la redirección, mapeados a vocabulario
 * nuestro. Lo que no esté en esta tabla se agrupa: nunca se refleja el valor
 * recibido, que es texto de fuera.
 */
const ERRORES_META: Record<string, string> = {
  access_denied: "ERROR_META_CANCELADO",
  server_error: "ERROR_META_SERVIDOR",
  temporarily_unavailable: "ERROR_META_NO_DISPONIBLE",
};

function codigoDeErrorGraph(err: unknown): string {
  if (err instanceof ErrorGraph) {
    switch (err.codigo) {
      case "TIMEOUT":
        return "TIMEOUT_META";
      case "INTERCAMBIO_FALLIDO":
        return "INTERCAMBIO_FALLIDO";
      case "RESPUESTA_INVALIDA":
        return "RESPUESTA_INVALIDA";
      case "RED":
        return "RED_NO_DISPONIBLE";
      default:
        return "GRAPH_ERROR";
    }
  }
  return "ERROR_INESPERADO";
}

export interface OpcionesCallback {
  config: ConfigMeta;
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
  ahora?: number;
}

export async function manejarCallback(
  url: URL,
  { config, fetchImpl, timeoutMs, ahora = Date.now() }: OpcionesCallback
): Promise<ResultadoCallback> {
  const params = url.searchParams;
  const parametros = nombresDeParametros(params);

  const base: ResultadoCallback = {
    estado: "observacion",
    codigo: "SIN_CODE",
    state: validarState(params.get("state"), config.appSecret, { ahora }),
    parametros,
    wabaId: sanearIdentificador(params.get("waba_id")),
    phoneNumberId: sanearIdentificador(params.get("phone_number_id")),
    telefonoEnmascarado: null,
    coincide: "DESCONOCIDO",
    tokenValido: null,
    scopes: [],
  };

  // 1) Meta reporta un error explícito. Se mapea; el texto crudo se descarta.
  const errorMeta = params.get("error");
  if (errorMeta) {
    return { ...base, estado: "error", codigo: ERRORES_META[errorMeta] ?? "ERROR_META_OTRO" };
  }

  // 2) Sin `code` no hay nada que intercambiar. No es un fallo de OAuth: es la
  //    observación que necesitamos para saber qué contrato usa Hosted ES.
  const code = params.get("code");
  if (!code) return base;

  // 3) El code vive 30 segundos: se intercambia LO PRIMERO, sin trabajo previo.
  let token: string;
  try {
    token = await intercambiarCodePorToken(code, { config, fetchImpl, timeoutMs });
  } catch (err) {
    return { ...base, estado: "error", codigo: codigoDeErrorGraph(err) };
  }

  // A partir de aquí `token` existe SOLO en esta variable local. No se
  // registra, no se devuelve, no se persiste, y muere con la petición.
  const resultado: ResultadoCallback = { ...base, estado: "ok", codigo: "OK" };

  // 4) Metadata del token sin mostrarlo.
  try {
    const meta = await inspeccionarToken(token, { config, fetchImpl, timeoutMs });
    resultado.tokenValido = meta.esValido;
    resultado.scopes = meta.scopes;
  } catch {
    // Diagnóstico opcional: que falle no invalida el intercambio.
    resultado.tokenValido = null;
  }

  // 5) Identidad del número. Sin WABA ID no hay nada que consultar.
  if (!resultado.wabaId) {
    return { ...resultado, codigo: "OK_SIN_WABA_ID" };
  }

  try {
    const numeros = await listarNumerosDeWaba(resultado.wabaId, token, {
      config,
      fetchImpl,
      timeoutMs,
    });

    const elegido =
      numeros.find((n) => n.id === resultado.phoneNumberId) ??
      (numeros.length === 1 ? numeros[0] : undefined);

    const objetivo = numeros.find(
      (n) => normalizarE164(n.displayPhoneNumber) === NUMERO_OBJETIVO_E164
    );

    const mostrado = objetivo ?? elegido;
    resultado.telefonoEnmascarado = mostrado
      ? enmascararTelefono(mostrado.displayPhoneNumber)
      : null;
    if (mostrado && !resultado.phoneNumberId) resultado.phoneNumberId = sanearIdentificador(mostrado.id);

    resultado.coincide = objetivo ? "COINCIDE" : "NO_COINCIDE";
  } catch (err) {
    return { ...resultado, estado: "error", codigo: codigoDeErrorGraph(err) };
  }

  // 6) FIN. No se llama a POST /<WABA_ID>/subscribed_apps: identificar y
  //    conectar están separados a propósito (ver graph.ts).
  return resultado;
}

/** Traduce el resultado a parámetros de URL, todos no sensibles. */
export function aParametrosDeResultado(r: ResultadoCallback): URLSearchParams {
  const p = new URLSearchParams({
    estado: r.estado,
    codigo: r.codigo,
    coincide: r.coincide,
    state: r.state,
  });
  if (r.wabaId) p.set("waba", r.wabaId);
  if (r.phoneNumberId) p.set("numero", r.phoneNumberId);
  if (r.telefonoEnmascarado) p.set("tel", r.telefonoEnmascarado);
  if (r.parametros.length > 0) p.set("params", r.parametros.join(","));
  if (r.tokenValido !== null) p.set("token", r.tokenValido ? "valido" : "invalido");
  if (r.scopes.length > 0) p.set("scopes", String(r.scopes.length));
  return p;
}
