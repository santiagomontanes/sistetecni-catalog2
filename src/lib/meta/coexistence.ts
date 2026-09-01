/**
 * Lógica PURA y CLIENT-SAFE del onboarding por Coexistence (Embedded Signup vía
 * Facebook JavaScript SDK) para un número que YA usa la WhatsApp Business App.
 *
 * ── POR QUÉ ESTE MÓDULO EXISTE ───────────────────────────────────────────
 * La página `/meta/coexistence` es un componente "use client" y no se puede
 * testear de forma hermética. Todo lo que se puede probar sin un navegador —
 * validar el origen de un `postMessage`, interpretar el evento de Embedded
 * Signup, construir los parámetros EXACTOS de `FB.login`, resumir la respuesta
 * del callback sin filtrar el `code`— vive aquí y se prueba con `node --test`.
 *
 * ── INVARIANTES ─────────────────────────────────────────────────────────
 * 1. Este módulo NO conoce ningún secreto. Solo maneja el APP ID y el CONFIG
 *    ID, ambos públicos, y siempre recibidos como argumento.
 * 2. NUNCA devuelve, registra ni copia el `authResponse.code`. Lo único que
 *    sale de aquí sobre el code es un booleano "llegó / no llegó".
 * 3. De un `postMessage` entrante solo salen identificadores numéricos de Meta
 *    (WABA ID, phone number ID, business ID) ya saneados. El resto se descarta.
 * 4. No importa nada con prefijo NEXT_PUBLIC_ ni nada server-only: es
 *    reutilizable en cualquier contexto.
 */
import { sanearIdentificador } from "./redactar";

// ─────────────────────────────────────────────────────────────────────────
// Origen de los mensajes
// ─────────────────────────────────────────────────────────────────────────

/**
 * Orígenes desde los que Meta emite los `postMessage` de Embedded Signup.
 * Cualquier `message` cuyo `origin` no esté aquí se ignora ENTERO, sin mirar
 * su contenido: es la primera línea de defensa contra un iframe hostil que
 * intente inyectar un evento `FINISH` falso con IDs de otra cuenta.
 */
export const ORIGENES_META_CONFIABLES: readonly string[] = [
  "https://www.facebook.com",
  "https://web.facebook.com",
  "https://business.facebook.com",
  "https://m.facebook.com",
];

export function esOrigenConfiable(origin: unknown): boolean {
  return typeof origin === "string" && ORIGENES_META_CONFIABLES.includes(origin);
}

// ─────────────────────────────────────────────────────────────────────────
// Eventos de Embedded Signup
// ─────────────────────────────────────────────────────────────────────────

/**
 * Eventos que el flujo de Embedded Signup emite por `postMessage`.
 * Para Coexistence el éxito esperado es
 * `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`; el estándar `FINISH` corresponde
 * al onboarding normal (número nuevo) y aquí NO debería aparecer.
 */
export const EVENTOS_EMBEDDED_SIGNUP = {
  FINISH: "FINISH",
  FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
  FINISH_ONLY_WABA: "FINISH_ONLY_WABA",
  CANCEL: "CANCEL",
  ERROR: "ERROR",
} as const;

export type EventoEmbeddedSignup =
  (typeof EVENTOS_EMBEDDED_SIGNUP)[keyof typeof EVENTOS_EMBEDDED_SIGNUP];

const EVENTOS_CONOCIDOS: readonly string[] = Object.values(EVENTOS_EMBEDDED_SIGNUP);

/** Éxito específico de Coexistence. */
export const EXITO_COEXISTENCE: EventoEmbeddedSignup =
  EVENTOS_EMBEDDED_SIGNUP.FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING;

export type ClaseEvento = "exito" | "exito-inesperado" | "cancelado" | "error" | "info";

export interface ResultadoEmbeddedSignup {
  /** Evento reconocido, siempre de nuestro vocabulario. */
  event: EventoEmbeddedSignup;
  clase: ClaseEvento;
  wabaId: string | null;
  phoneNumberId: string | null;
  businessId: string | null;
  /** Paso del asistente cuando Meta lo informa (p. ej. en CANCEL). Saneado. */
  paso: string | null;
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/** Texto libre de Meta → etiqueta corta y acotada. Nunca se refleja crudo. */
function sanearPaso(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.replace(/[^a-z0-9_\- ]/gi, "").trim().slice(0, 48);
  return limpio.length > 0 ? limpio : null;
}

function claseDeEvento(event: EventoEmbeddedSignup): ClaseEvento {
  switch (event) {
    case EVENTOS_EMBEDDED_SIGNUP.FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING:
      return "exito";
    case EVENTOS_EMBEDDED_SIGNUP.FINISH:
    case EVENTOS_EMBEDDED_SIGNUP.FINISH_ONLY_WABA:
      return "exito-inesperado";
    case EVENTOS_EMBEDDED_SIGNUP.CANCEL:
      return "cancelado";
    case EVENTOS_EMBEDDED_SIGNUP.ERROR:
      return "error";
    default:
      return "info";
  }
}

/**
 * Interpreta el `data` de un `MessageEvent` de Embedded Signup.
 *
 * El SDK de Facebook envía —según la documentación de Embedded Signup— un
 * objeto con `type: "WA_EMBEDDED_SIGNUP"`, un `event` y un `data` con los
 * identificadores. Algunos entornos lo mandan como string JSON; se admite.
 *
 * Devuelve `null` (no lanza) cuando el mensaje no es un evento de Embedded
 * Signup reconocible: en `window` llegan `postMessage` de mil sitios y este
 * filtro tiene que ser silencioso.
 */
export function interpretarMensajeEmbeddedSignup(
  data: unknown
): ResultadoEmbeddedSignup | null {
  let payload: unknown = data;

  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }

  if (!esObjeto(payload)) return null;
  if (payload.type !== "WA_EMBEDDED_SIGNUP") return null;

  const eventRaw = payload.event;
  if (typeof eventRaw !== "string" || !EVENTOS_CONOCIDOS.includes(eventRaw)) {
    return null;
  }
  const event = eventRaw as EventoEmbeddedSignup;

  const cuerpo = esObjeto(payload.data) ? payload.data : {};

  return {
    event,
    clase: claseDeEvento(event),
    wabaId: sanearIdentificador(asString(cuerpo.waba_id)),
    phoneNumberId: sanearIdentificador(asString(cuerpo.phone_number_id)),
    businessId: sanearIdentificador(asString(cuerpo.business_id)),
    paso: sanearPaso(cuerpo.current_step),
  };
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : null;
}

// ─────────────────────────────────────────────────────────────────────────
// Parámetros de FB.login
// ─────────────────────────────────────────────────────────────────────────

export class ErrorConfigCoexistence extends Error {
  readonly codigo = "CONFIG_COEXISTENCE_INVALIDA";
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorConfigCoexistence";
  }
}

/**
 * `featureType` EXACTO que activa el onboarding de un número que ya usa la
 * WhatsApp Business App. Cualquier otro valor lanza el onboarding estándar
 * (número nuevo), que NO es lo que este flujo quiere.
 */
export const FEATURE_TYPE_COEXISTENCE = "whatsapp_business_app_onboarding" as const;

export interface ParametrosFbLogin {
  config_id: string;
  response_type: "code";
  override_default_response_type: true;
  extras: {
    setup: Record<string, never>;
    featureType: typeof FEATURE_TYPE_COEXISTENCE;
    sessionInfoVersion: "3";
  };
}

/**
 * Construye el segundo argumento de `FB.login(callback, ...)`.
 *
 * Falla de forma explícita y legible si falta el CONFIG ID — es el error de
 * configuración más probable y sin él el flujo ni siquiera arranca.
 */
export function construirParametrosFbLogin(configId: unknown): ParametrosFbLogin {
  if (typeof configId !== "string" || configId.trim().length === 0) {
    throw new ErrorConfigCoexistence(
      'Falta NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID. No se puede lanzar Embedded Signup sin el config_id.'
    );
  }
  // Los config IDs de Meta son numéricos. Si llega otra cosa, es un valor mal
  // pegado (una URL, un placeholder) y es mejor detenerse aquí.
  if (!/^\d{6,32}$/.test(configId.trim())) {
    throw new ErrorConfigCoexistence(
      "NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID no parece un config_id de Meta (se esperan solo dígitos)."
    );
  }

  return {
    config_id: configId.trim(),
    response_type: "code",
    override_default_response_type: true,
    extras: {
      setup: {},
      featureType: FEATURE_TYPE_COEXISTENCE,
      sessionInfoVersion: "3",
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Respuesta del callback de FB.login
// ─────────────────────────────────────────────────────────────────────────

export type EstadoRespuestaFbLogin = "codigo-recibido" | "sin-codigo" | "cancelado";

export interface ResumenRespuestaFbLogin {
  estado: EstadoRespuestaFbLogin;
  /** SOLO un booleano. El valor del `code` no sale nunca de aquí. */
  tieneCodigo: boolean;
  /** Longitud del code, útil para un diagnóstico mínimo sin revelarlo. */
  longitudCodigo: number;
}

/**
 * Resume `response` de `FB.login` SIN tocar el `code`.
 *
 * `FB.login` con `response_type: "code"` devuelve
 * `response.authResponse.code`. Ese valor es un authorization code de un solo
 * uso: no se imprime, no se registra, no se devuelve. Esta función existe
 * precisamente para que el componente nunca tenga que mirar dentro de
 * `authResponse`.
 */
export function resumirRespuestaFbLogin(response: unknown): ResumenRespuestaFbLogin {
  const auth =
    esObjeto(response) && esObjeto(response.authResponse) ? response.authResponse : null;

  const code = auth && typeof auth.code === "string" ? auth.code : null;

  if (code && code.length > 0) {
    return { estado: "codigo-recibido", tieneCodigo: true, longitudCodigo: code.length };
  }

  // `FB.login` llama al callback con `authResponse: null` cuando el usuario
  // cierra el popup sin completar.
  return { estado: "cancelado", tieneCodigo: false, longitudCodigo: 0 };
}

/**
 * Extrae el `code` de la respuesta de `FB.login`. Se aísla aquí para que el
 * componente NUNCA toque `authResponse` directamente. Devuelve `null` si no
 * hay code.
 */
export function extraerCodigoFbLogin(response: unknown): string | null {
  const auth =
    esObjeto(response) && esObjeto(response.authResponse) ? response.authResponse : null;
  const code = auth && typeof auth.code === "string" ? auth.code : null;
  return code && code.length > 0 ? code : null;
}

// ─────────────────────────────────────────────────────────────────────────
// Acumulador de las 3 piezas (code + wabaId + phoneNumberId)
// ─────────────────────────────────────────────────────────────────────────

export interface PiezasConexion {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}

/** Identificadores candidatos (sin el code). Se pueden pintar en la UI. */
export interface CandidatosConexion {
  wabaId: string;
  phoneNumberId: string;
}

export interface AcumuladorPiezas {
  /** Alimenta el `code` del callback de `FB.login`. Cualquier orden. */
  registrarCodigo(code: unknown): void;
  /**
   * Alimenta un evento de Embedded Signup YA interpretado y de origen
   * confiable. SOLO `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` aporta
   * identificadores; `FINISH` estándar, `CANCEL` y `ERROR` se ignoran.
   */
  registrarEvento(resultado: ResultadoEmbeddedSignup | null): void;
  /** wabaId + phoneNumberId cuando el evento de Coexistence los trajo, o null. */
  readonly candidatos: CandidatosConexion | null;
  /** true cuando hay `code` (aunque falten los identificadores). */
  readonly tieneCodigo: boolean;
  /** Las 3 piezas —incluido el `code`— cuando están todas, o null. */
  readonly piezas: PiezasConexion | null;
  /** Descarta todo (para "el code venció → repetir Embedded Signup"). */
  reiniciar(): void;
}

/**
 * Acumula las tres piezas —`code`, `wabaId`, `phoneNumberId`— sin asumir el
 * orden en que llegan, y SIN disparar nada por su cuenta.
 *
 * ── POR QUÉ NO DISPARA NADA ─────────────────────────────────────────────
 * La verificación + suscripción es UNA operación explícita que el
 * administrador confirma con un botón. El acumulador solo dice "ya tengo las
 * tres piezas"; quien hace el POST es el componente, tras el clic.
 *
 * ── GARANTÍAS ───────────────────────────────────────────────────────────
 * 1. Cada pieza se acepta SOLO la primera vez: un evento o un callback
 *    duplicado no cambian los candidatos ya fijados.
 * 2. `FINISH` estándar, `CANCEL`, `ERROR` y un evento nulo (origen no
 *    confiable) no aportan identificadores.
 * 3. `reiniciar()` borra el `code` y los identificadores: se usa cuando Meta
 *    rechaza el code por vencido y hay que relanzar el asistente.
 */
export function crearAcumuladorPiezas(): AcumuladorPiezas {
  let code: string | null = null;
  let wabaId: string | null = null;
  let phoneNumberId: string | null = null;

  return {
    registrarCodigo(valor: unknown) {
      if (!code && typeof valor === "string" && valor.length > 0) code = valor;
    },
    registrarEvento(resultado: ResultadoEmbeddedSignup | null) {
      if (!resultado || resultado.event !== EXITO_COEXISTENCE) return;
      if (!wabaId && resultado.wabaId) wabaId = resultado.wabaId;
      if (!phoneNumberId && resultado.phoneNumberId) phoneNumberId = resultado.phoneNumberId;
    },
    get candidatos() {
      return wabaId && phoneNumberId ? { wabaId, phoneNumberId } : null;
    },
    get tieneCodigo() {
      return code !== null;
    },
    get piezas() {
      return code && wabaId && phoneNumberId ? { code, wabaId, phoneNumberId } : null;
    },
    reiniciar() {
      code = null;
      wabaId = null;
      phoneNumberId = null;
    },
  };
}

/**
 * Cerrojo de "una sola vez" para el clic del botón. `intentar()` devuelve
 * `true` la primera vez y `false` en cualquier llamada posterior — hasta un
 * `soltar()` explícito (para permitir reintento tras un error recuperable).
 *
 * Se testea aquí porque es la garantía de "doble clic → 1 POST" y no se puede
 * probar de forma hermética dentro de React.
 */
export interface CerrojoUnaVez {
  intentar(): boolean;
  soltar(): void;
  readonly tomado: boolean;
}

export function crearCerrojoUnaVez(): CerrojoUnaVez {
  let tomado = false;
  return {
    intentar() {
      if (tomado) return false;
      tomado = true;
      return true;
    },
    soltar() {
      tomado = false;
    },
    get tomado() {
      return tomado;
    },
  };
}
