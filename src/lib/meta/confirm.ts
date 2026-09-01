/**
 * Núcleo del endpoint `POST /api/meta/coexistence/confirm`.
 *
 * UNA sola operación explícita: a partir de `{ code, wabaId, phoneNumberId }`
 * verifica los activos Y —solo si todo cuadra— suscribe la app a la WABA. El
 * `code` de Meta se consume aquí y NO antes: mientras el administrador no pulsa
 * "Verificar y conectar", el `code` sigue vivo en memoria del navegador.
 *
 * Igual que `callback.ts`: toda la lógica vive aquí, hermética y testeable
 * (`fetch` y autorizador inyectables); el Route Handler es un envoltorio fino.
 *
 * ── SECUENCIA (en esta MISMA request, en este orden) ─────────────────────
 *   1. auth server-side autoritativa (`requireAdmin`)
 *   2. body estricto (Zod `.strict()`)
 *   3. intercambiarCodePorToken(code)          → token
 *   4. inspeccionarToken(token)                → esValido === true
 *   5. token.appId === config.appId
 *   6. listarNumerosDeWaba(wabaId)             → phoneNumberId ∈ WABA
 *   7. SOLO DESPUÉS: suscribirAppAWaba(wabaId, token, { config })
 *   8. respuesta saneada
 *
 * Ninguna operación de conexión (paso 7) ocurre antes de que 3–6 pasen. Si
 * cualquiera falla, `subscribed_apps` NUNCA se llega a pedir (hay tests).
 *
 * ── LO QUE NUNCA SALE DE AQUÍ ────────────────────────────────────────────
 * El `code`, el business token, el App Secret, la respuesta cruda de Graph,
 * cualquier URL de Graph, cualquier stack trace. El token vive SOLO en una
 * variable local de `manejarConfirm` y muere con la petición: no se devuelve,
 * no se registra, no se persiste, no va a cookies ni a `localStorage`.
 *
 * ── /register ───────────────────────────────────────────────────────────
 * NUNCA se llama a `POST /<PHONE_NUMBER_ID>/register`. La vinculación del
 * teléfono la hace el propio Embedded Signup con
 * `featureType: whatsapp_business_app_onboarding`. Hay un test que lo prohíbe.
 */
import { z } from "zod";
import { requireAdmin, AdminAuthError } from "../personalizadorAdmin/auth";
import { ErrorConfigMeta, type ConfigMeta } from "./env";
import {
  ErrorGraph,
  intercambiarCodePorToken,
  inspeccionarToken,
  listarNumerosDeWaba,
  suscribirAppAWaba,
  type FetchImpl,
} from "./graph";

/** Códigos internos. Nunca sale de aquí texto crudo de Graph. */
export type CodigoConfirm =
  | "OK"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "COEXISTENCE_DISABLED"
  | "BODY_INVALIDO"
  | "CODE_INVALIDO"
  | "INTERCAMBIO_FALLIDO"
  | "TOKEN_INVALIDO"
  | "APP_ID_NO_COINCIDE"
  | "WABA_INVALIDA"
  | "PHONE_NUMBER_NO_PERTENECE_A_WABA"
  | "SUBSCRIPCION_FALLIDA"
  | "META_TIMEOUT"
  | "META_ERROR"
  | "ERROR_INTERNO";

export interface VerificadoConfirm {
  appIdCoincide: true;
  tokenValido: true;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string | null;
}

export type RespuestaConfirm =
  | {
      ok: true;
      status: 200;
      cuerpo: {
        ok: true;
        suscrito: true;
        verificado: VerificadoConfirm;
        siguientePaso: "CAMBIAR_NUMERO_AGENTE";
      };
    }
  | { ok: false; status: number; cuerpo: { ok: false; codigo: Exclude<CodigoConfirm, "OK"> } };

/**
 * Body ACEPTADO. `.strict()` rechaza cualquier propiedad de más: un `token`,
 * `appSecret`, `businessId`, `redirectUri`, `configId`, una URL o un teléfono
 * visible que alguien intente colar desde el navegador hacen que el body
 * entero se rechace con `BODY_INVALIDO`.
 */
const ESQUEMA_BODY = z
  .object({
    // El code es de un solo uso y caduca en ~30 s. Se valida su forma, nunca
    // se registra, y se pasa TAL CUAL a Graph.
    code: z
      .string()
      .min(10, "code demasiado corto")
      .max(2048, "code demasiado largo")
      .regex(/^[A-Za-z0-9_.\-]+$/, "code con caracteres no válidos"),
    wabaId: z.string().regex(/^\d{1,32}$/, "wabaId debe ser numérico"),
    phoneNumberId: z.string().regex(/^\d{1,32}$/, "phoneNumberId debe ser numérico"),
  })
  .strict();

export type BodyConfirm = z.infer<typeof ESQUEMA_BODY>;

/** Tope de tamaño del body. Una petición real ronda 1 KB. */
export const MAX_BYTES_BODY = 8 * 1024;

export interface ContextoAdmin {
  userId: string;
}

export interface OpcionesConfirm {
  /** Kill switch ya resuelto por el borde (`coexistenceHabilitado()`). */
  habilitado: boolean;
  /** Bearer token de la sesión Supabase, tal cual llegó en `Authorization`. */
  authToken: unknown;
  /** Body ya parseado a objeto (o `null` si no era JSON válido). */
  body: unknown;
  /** Configuración server-side (`configMeta()`), inyectada por el borde. */
  config: ConfigMeta;
  /**
   * Autorizador server-side. Por defecto delega en `requireAdmin` (valida el
   * JWT contra Supabase y comprueba `is_admin` / `erp_role` activo). Inyectable
   * para tests herméticos.
   */
  autorizar?: (authToken: unknown) => Promise<ContextoAdmin>;
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
}

const error = (
  status: number,
  codigo: Exclude<CodigoConfirm, "OK">
): RespuestaConfirm => ({ ok: false, status, cuerpo: { ok: false, codigo } });

/** `AdminAuthError` → 401 si es falta/expiración de sesión, 403 si es permisos. */
function codigoDeAuthError(err: AdminAuthError): RespuestaConfirm {
  return /no autenticado|inválida|expirada/i.test(err.message)
    ? error(401, "AUTH_REQUIRED")
    : error(403, "FORBIDDEN");
}

type Etapa = "exchange" | "waba" | "suscripcion";

/** `ErrorGraph` → código interno. El detalle de Graph se descarta. */
function codigoDeGraph(err: ErrorGraph, etapa: Etapa): RespuestaConfirm {
  switch (err.codigo) {
    case "TIMEOUT":
      return error(504, "META_TIMEOUT");
    case "INTERCAMBIO_FALLIDO":
      return error(422, "INTERCAMBIO_FALLIDO");
    case "GRAPH_ERROR":
      // Un 4xx tiene distinto significado según dónde ocurra.
      if (etapa === "waba") return error(422, "WABA_INVALIDA");
      if (etapa === "suscripcion") return error(422, "SUBSCRIPCION_FALLIDA");
      return error(422, "INTERCAMBIO_FALLIDO");
    case "RESPUESTA_INVALIDA":
    case "RED":
    default:
      return error(502, "META_ERROR");
  }
}

export async function manejarConfirm(opciones: OpcionesConfirm): Promise<RespuestaConfirm> {
  const {
    habilitado,
    authToken,
    body,
    config,
    autorizar = (t) => requireAdmin(t) as Promise<ContextoAdmin>,
    fetchImpl,
    timeoutMs,
  } = opciones;

  // 0) Kill switch. Apagado, la ruta "no existe".
  if (!habilitado) return error(404, "COEXISTENCE_DISABLED");

  // 1) Sesión administrativa AUTORITATIVA (server-side). No se confía en ningún
  //    booleano del navegador ni en un userId enviado por el cliente.
  if (typeof authToken !== "string" || authToken.trim().length === 0) {
    return error(401, "AUTH_REQUIRED");
  }
  try {
    await autorizar(authToken);
  } catch (err) {
    if (err instanceof AdminAuthError) return codigoDeAuthError(err);
    throw err; // fallo inesperado → lo traduce el borde a ERROR_INTERNO
  }

  // 2) Body estricto.
  const parsed = ESQUEMA_BODY.safeParse(body);
  if (!parsed.success) {
    const enCode = parsed.error.issues.some((i) => i.path[0] === "code");
    return error(400, enCode ? "CODE_INVALIDO" : "BODY_INVALIDO");
  }
  const { code, wabaId, phoneNumberId } = parsed.data;

  // 3) code → business token. Infraestructura EXISTENTE (graph.ts), sin
  //    duplicar. A partir de aquí `token` vive SOLO en esta variable local.
  let token: string;
  try {
    token = await intercambiarCodePorToken(code, { config, fetchImpl, timeoutMs });
  } catch (err) {
    if (err instanceof ErrorGraph) return codigoDeGraph(err, "exchange");
    return error(502, "META_ERROR");
  }

  // 4) Inspección del token.
  let meta;
  try {
    meta = await inspeccionarToken(token, { config, fetchImpl, timeoutMs });
  } catch (err) {
    if (err instanceof ErrorGraph) return codigoDeGraph(err, "exchange");
    return error(502, "META_ERROR");
  }

  // 5) El token TIENE que ser válido y de NUESTRA app. Antes de esto NO se
  //    consulta la WABA ni se suscribe nada.
  if (!meta.esValido) return error(422, "TOKEN_INVALIDO");
  if (meta.appId !== config.appId) return error(422, "APP_ID_NO_COINCIDE");

  // 6) Números reales de la WABA indicada.
  let numeros;
  try {
    numeros = await listarNumerosDeWaba(wabaId, token, { config, fetchImpl, timeoutMs });
  } catch (err) {
    if (err instanceof ErrorGraph) return codigoDeGraph(err, "waba");
    return error(502, "META_ERROR");
  }

  const encontrado = numeros.find((n) => n.id === phoneNumberId);
  if (!encontrado) return error(422, "PHONE_NUMBER_NO_PERTENECE_A_WABA");

  // 7) SOLO AHORA: suscribir la app a la WABA. Es la primera operación que
  //    "conecta" de verdad, y ninguna validación anterior se ha saltado.
  //
  //    `POST /<WABA_ID>/subscribed_apps` es idempotente según la documentación
  //    de Meta: repetir la llamada con la app ya suscrita responde
  //    `{ success: true }` igual (no verificado contra Meta real — ver
  //    docs/erp/12). El `code` es de un solo uso, así que una segunda petición
  //    de confirm con el mismo code falla en el paso 3 y nunca llega aquí.
  let exito: boolean;
  try {
    exito = await suscribirAppAWaba(wabaId, token, { config, fetchImpl, timeoutMs });
  } catch (err) {
    if (err instanceof ErrorGraph) return codigoDeGraph(err, "suscripcion");
    return error(502, "META_ERROR");
  }
  if (exito !== true) return error(422, "SUBSCRIPCION_FALLIDA");

  // 8) Éxito. Solo metadata no sensible.
  return {
    ok: true,
    status: 200,
    cuerpo: {
      ok: true,
      suscrito: true,
      verificado: {
        appIdCoincide: true,
        tokenValido: true,
        wabaId,
        phoneNumberId,
        displayPhoneNumber: encontrado.displayPhoneNumber,
        verifiedName: encontrado.verifiedName,
      },
      siguientePaso: "CAMBIAR_NUMERO_AGENTE",
    },
  };
}

/**
 * `ErrorConfigMeta` solo lleva NOMBRES de variables, nunca valores; el borde
 * lo distingue para loguear el nombre, pero al navegador solo va `ERROR_INTERNO`.
 */
export function esErrorConfig(err: unknown): err is ErrorConfigMeta {
  return err instanceof ErrorConfigMeta;
}
