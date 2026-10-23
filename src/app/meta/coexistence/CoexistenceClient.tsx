"use client";

/**
 * UI del onboarding por Coexistence. Todo lo testeable vive en
 * `src/lib/meta/coexistence.ts` (parseo de eventos, parámetros de FB.login,
 * acumulador de piezas, cerrojo de una vez) y en el endpoint server-side; aquí
 * solo está el pegamento con el navegador.
 *
 * ── FLUJO ───────────────────────────────────────────────────────────────
 * 1. SDK listo → botón "Conectar WhatsApp Business".
 * 2. FB.login + eventos postMessage → llegan `code`, `wabaId`, `phoneNumberId`.
 *    El `code` NO se consume: vive en memoria (el acumulador).
 * 3. Se muestran los IDs candidatos + advertencia + botón explícito
 *    "Verificar y conectar este WhatsApp".
 * 4. Un solo clic → UNA petición a `/api/meta/coexistence/confirm` que
 *    verifica Y suscribe. El botón se bloquea al instante (cerrojo).
 * 5. Éxito → se muestra el número conectado. El agente NO se toca todavía.
 *
 * ── SEGURIDAD ───────────────────────────────────────────────────────────
 * - Al navegador solo llegan valores PÚBLICOS (APP_ID, CONFIG_ID). Cero token.
 * - El `code` NUNCA entra en estado de React, ni en localStorage/sessionStorage/
 *   cookie/URL/consola. Vive en el acumulador (una variable) hasta el POST.
 * - Si Meta rechaza el code por vencido/usado, NO se reintenta: se ofrece
 *   relanzar Embedded Signup (code nuevo).
 * - Se ignora todo `postMessage` cuyo origin no sea de Meta.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import ProtectedAdmin from "@/components/ProtectedAdmin";
import {
  construirParametrosFbLogin,
  crearAcumuladorPiezas,
  crearCerrojoUnaVez,
  crearCronologia,
  describirEventoParaDiagnostico,
  diffTrazas,
  esOrigenConfiable,
  extraerCodigoFbLogin,
  hitoDeEvento,
  interpretarMensajeEmbeddedSignup,
  ErrorConfigCoexistence,
  EXITO_COEXISTENCE,
  FEATURE_TYPE_COEXISTENCE,
  type AcumuladorPiezas,
  type CandidatosConexion,
  type CerrojoUnaVez,
  type ClaseEvento,
  type Cronologia,
  type DescriptorEvento,
  type HitoCronologia,
  type ResultadoEmbeddedSignup,
  type TrazaIntento,
} from "@/lib/meta/coexistence";
import { callCoexistenceConfirm, type VerificadoConfirm } from "@/lib/callCoexistenceConfirm";

/** Metadata de diagnóstico calculada en el servidor (sin secretos). */
export interface DiagnosticoServidor {
  appIdPublicoPresente: boolean;
  appIdServidorPresente: boolean;
  appIdPublicoCoincideConServer: boolean | null;
  appIdEnmascarado: string;
  configIdPresente: boolean;
  configIdEnmascarado: string;
  graphApiVersion: string;
  oauthRedirectPresente: boolean;
  appSecretPresente: boolean;
}

const CLAVE_TRAZAS = "meta_coexistence_trazas_v1";
const MAX_TRAZAS = 6;

function leerTrazas(): TrazaIntento[] {
  try {
    const crudo = window.localStorage.getItem(CLAVE_TRAZAS);
    const arr = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(arr) ? (arr as TrazaIntento[]) : [];
  } catch {
    return [];
  }
}

function guardarTraza(traza: TrazaIntento): TrazaIntento[] {
  const previas = leerTrazas().filter((t) => t.etiqueta !== traza.etiqueta);
  const siguiente = [traza, ...previas].slice(0, MAX_TRAZAS);
  try {
    window.localStorage.setItem(CLAVE_TRAZAS, JSON.stringify(siguiente));
  } catch {
    /* modo incógnito / almacenamiento bloqueado: el diagnóstico sigue en pantalla */
  }
  return siguiente;
}

// Lecturas ESTÁTICAS Y LITERALES de process.env — la única forma que el bundler
// de Next inlinea en el cliente (ver src/components/EnvironmentBanner.tsx).
const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID;
const CONFIG_ID = process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID;
const GRAPH_VERSION = process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION || "v23.0";

const SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";

type EstadoSdk = "cargando" | "listo" | "error";
type Fase = "sdk" | "abierto" | "confirmado" | "verificando" | "verificado" | "error-servidor";

interface FbLoginResponse {
  authResponse?: { code?: string } | null;
  status?: string;
}

interface FacebookSdk {
  init(params: { appId: string; autoLogAppEvents?: boolean; xfbml?: boolean; version: string }): void;
  login(cb: (response: FbLoginResponse) => void, params: unknown): void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

interface EventoRegistrado extends ResultadoEmbeddedSignup {
  id: number;
  recibidoEn: string;
}

const CLASE_COLOR: Record<ClaseEvento, string> = {
  exito: "border-success bg-surface",
  "exito-inesperado": "border-amber-500 bg-surface",
  cancelado: "border-border bg-surface",
  error: "border-red-600 bg-surface",
  info: "border-border bg-surface",
};

/** Textos SEGUROS por código de error del servidor. Nada crudo de Graph. */
const MENSAJE_ERROR_SERVIDOR: Record<string, string> = {
  AUTH_REQUIRED: "Tu sesión no es válida o caducó. Vuelve a entrar al panel e inténtalo de nuevo.",
  FORBIDDEN: "Tu usuario no tiene permisos de administrador para esta operación.",
  COEXISTENCE_DISABLED: "El flujo de Coexistence está desactivado en este entorno.",
  BODY_INVALIDO: "La petición al servidor no tenía el formato esperado.",
  CODE_INVALIDO: "El código de autorización venció. Vuelve a iniciar la conexión con Meta.",
  INTERCAMBIO_FALLIDO: "El código de autorización venció. Vuelve a iniciar la conexión con Meta.",
  TOKEN_INVALIDO: "El token devuelto por Meta no es válido.",
  APP_ID_NO_COINCIDE: "El token no pertenece a esta aplicación de Meta. No se ha conectado nada.",
  WABA_INVALIDA: "No se pudo consultar la WABA indicada.",
  PHONE_NUMBER_NO_PERTENECE_A_WABA:
    "El número indicado NO pertenece a esa WABA. No se ha suscrito ni modificado nada.",
  SUBSCRIPCION_FALLIDA: "La verificación fue correcta pero Meta rechazó la suscripción. Inténtalo de nuevo.",
  META_TIMEOUT: "Meta tardó demasiado en responder. Inténtalo de nuevo.",
  META_ERROR: "Error de comunicación con Meta. Inténtalo de nuevo.",
  ERROR_INTERNO: "Error interno del servidor.",
};

/** Códigos por los que el `code` está gastado y hay que relanzar el asistente. */
const CODIGO_VENCIDO = new Set(["INTERCAMBIO_FALLIDO", "CODE_INVALIDO"]);

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export default function CoexistenceClient({ diagnosticoServidor }: { diagnosticoServidor: DiagnosticoServidor }) {
  return (
    <ProtectedAdmin>
      <CoexistenceInner diagnosticoServidor={diagnosticoServidor} />
    </ProtectedAdmin>
  );
}

function CoexistenceInner({ diagnosticoServidor }: { diagnosticoServidor: DiagnosticoServidor }) {
  const [estadoSdk, setEstadoSdk] = useState<EstadoSdk>("cargando");
  const [fase, setFase] = useState<Fase>("sdk");
  const [eventos, setEventos] = useState<EventoRegistrado[]>([]);
  const [candidatos, setCandidatos] = useState<CandidatosConexion | null>(null);
  const [tieneCodigo, setTieneCodigo] = useState(false);
  const [mensajeCallback, setMensajeCallback] = useState<string | null>(null);
  const [errorConfig, setErrorConfig] = useState<string | null>(null);
  const [verificado, setVerificado] = useState<VerificadoConfirm | null>(null);
  const [codigoError, setCodigoError] = useState<string | null>(null);

  // Diagnóstico
  const [hitos, setHitos] = useState<HitoCronologia[]>([]);
  const [ultimoDescriptor, setUltimoDescriptor] = useState<DescriptorEvento | null>(null);
  const [etiquetaTraza, setEtiquetaTraza] = useState("A");
  const [trazas, setTrazas] = useState<TrazaIntento[]>([]);
  const [fbInitOk, setFbInitOk] = useState(false);

  const contador = useRef(0);
  const accRef = useRef<AcumuladorPiezas | null>(null);
  const cerrojoRef = useRef<CerrojoUnaVez | null>(null);
  const cronoRef = useRef<Cronologia | null>(null);
  const codigoRecibidoRef = useRef(false);
  const ultimoEventoRef = useRef<string | null>(null);
  const errorIdMetaRef = useRef<string | null>(null);

  const obtenerCrono = useCallback((): Cronologia => {
    if (!cronoRef.current) cronoRef.current = crearCronologia();
    return cronoRef.current;
  }, []);
  const anotar = useCallback(
    (hito: HitoCronologia) => {
      obtenerCrono().registrar(hito);
      setHitos([...obtenerCrono().entradas.map((e) => e.hito)]);
    },
    [obtenerCrono]
  );

  const configCompleta = Boolean(APP_ID && CONFIG_ID);

  // Acumulador y cerrojo únicos. Lazy + StrictMode-safe.
  const obtenerAcc = useCallback((): AcumuladorPiezas => {
    if (!accRef.current) accRef.current = crearAcumuladorPiezas();
    return accRef.current;
  }, []);
  const obtenerCerrojo = useCallback((): CerrojoUnaVez => {
    if (!cerrojoRef.current) cerrojoRef.current = crearCerrojoUnaVez();
    return cerrojoRef.current;
  }, []);

  // Trazas guardadas (comparación A vs B). Solo en el navegador.
  useEffect(() => {
    setTrazas(leerTrazas());
  }, []);

  // ── Escucha de postMessage de Embedded Signup ───────────────────────────
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // DIAGNÓSTICO: se describe TODO mensaje de un origin de Meta —incluso
      // eventos que no sabemos procesar— para poder comparar en qué paso se
      // queda el 311. Solo metadata segura: booleanos, `type`/`event` y
      // NOMBRES de clave; jamás un valor arbitrario.
      const descriptor = describirEventoParaDiagnostico(event.data, event.origin);
      if (descriptor.originPermitido) {
        setUltimoDescriptor(descriptor);
        anotar("MESSAGE_RECEIVED");
        if (descriptor.event) ultimoEventoRef.current = descriptor.event;
        const hito = descriptor.event ? hitoDeEvento(descriptor.event) : null;
        if (hito) anotar(hito);
      }

      if (!esOrigenConfiable(event.origin)) return;
      const resultado = interpretarMensajeEmbeddedSignup(event.data);
      if (!resultado) return;

      // `error_id` solo si es un identificador numérico (los códigos de Meta lo son).
      if (resultado.event === "ERROR") {
        const raw =
          typeof event.data === "string"
            ? safeParse(event.data)
            : event.data;
        const errId =
          raw && typeof raw === "object" && "data" in raw && raw.data && typeof raw.data === "object"
            ? (raw.data as Record<string, unknown>).error_id
            : undefined;
        errorIdMetaRef.current =
          typeof errId === "string" && /^\d{1,20}$/.test(errId) ? errId : null;
      }

      contador.current += 1;
      setEventos((previos) => [
        ...previos,
        { ...resultado, id: contador.current, recibidoEn: new Date().toLocaleTimeString() },
      ]);

      obtenerAcc().registrarEvento(resultado);
      setCandidatos(obtenerAcc().candidatos);

      if (resultado.event === EXITO_COEXISTENCE) {
        setFase((f) => (f === "sdk" || f === "abierto" ? "confirmado" : f));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [obtenerAcc, anotar]);

  // ── Inicialización del SDK ──────────────────────────────────────────────
  const inicializarSdk = useCallback(() => {
    anotar("SDK_LOADED");
    if (!window.FB || !APP_ID) {
      setEstadoSdk("error");
      return;
    }
    try {
      window.FB.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: false, version: GRAPH_VERSION });
      setEstadoSdk("listo");
      setFbInitOk(true);
      anotar("FB_INIT");
    } catch {
      setEstadoSdk("error");
    }
  }, [anotar]);

  // ── Lanzar Embedded Signup ─────────────────────────────────────────────
  const conectar = useCallback(() => {
    // Estado limpio: se descarta cualquier code/candidato anterior (relanzar
    // tras un code vencido pasa por aquí).
    obtenerAcc().reiniciar();
    obtenerCerrojo().soltar();
    setCandidatos(null);
    setTieneCodigo(false);
    setVerificado(null);
    setCodigoError(null);
    setErrorConfig(null);
    setMensajeCallback(null);

    if (!window.FB || estadoSdk !== "listo") return;

    let params: ReturnType<typeof construirParametrosFbLogin>;
    try {
      params = construirParametrosFbLogin(CONFIG_ID);
    } catch (err) {
      setErrorConfig(
        err instanceof ErrorConfigCoexistence
          ? err.message
          : "No se pudo construir la petición de Embedded Signup."
      );
      return;
    }

    setFase("abierto");
    anotar("LOGIN_OPENED");
    ultimoEventoRef.current = null;
    errorIdMetaRef.current = null;
    codigoRecibidoRef.current = false;

    window.FB.login((response) => {
      // El `code` vive SOLO en esta variable local y en el acumulador. No se
      // imprime, no se guarda en estado de React, no se registra.
      const code = extraerCodigoFbLogin(response);
      if (code) {
        obtenerAcc().registrarCodigo(code);
        codigoRecibidoRef.current = true;
        setTieneCodigo(true);
        setMensajeCallback("Meta devolvió un código de autorización.");
      } else {
        setMensajeCallback(
          "El asistente se cerró sin devolver un código de autorización (cancelado o incompleto)."
        );
      }
    }, params);
  }, [estadoSdk, obtenerAcc, obtenerCerrojo, anotar]);

  // ── Guardar la traza del intento actual (comparación A vs B) ───────────
  const construirTraza = useCallback(
    (etiqueta: string): TrazaIntento => {
      const cand = obtenerAcc().candidatos;
      const ev = ultimoEventoRef.current;
      const resultado: TrazaIntento["resultado"] =
        fase === "verificado"
          ? "verificado"
          : fase === "error-servidor"
            ? "error-servidor"
            : ev === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"
              ? "coexistence-finish"
              : ev === "FINISH" || ev === "FINISH_ONLY_WABA"
                ? "standard-finish"
                : ev === "CANCEL"
                  ? "cancel"
                  : ev === "ERROR"
                    ? "error"
                    : "en-curso";
      return {
        etiqueta,
        timestamp: new Date().toISOString(),
        resultado,
        ultimoEvento: ev,
        currentStep: ultimoDescriptor?.currentStep ?? null,
        wabaIdPresente: Boolean(cand?.wabaId),
        phoneNumberIdPresente: Boolean(cand?.phoneNumberId),
        fbLoginCodeRecibido: codigoRecibidoRef.current,
        errorIdMeta: errorIdMetaRef.current,
        codigoServidor: codigoError,
        origin: ultimoDescriptor?.origin ?? null,
        featureType: FEATURE_TYPE_COEXISTENCE,
        sessionInfoVersion: "3",
        hitos: obtenerCrono().entradas.map((e) => e.hito),
      };
    },
    [fase, codigoError, ultimoDescriptor, obtenerAcc, obtenerCrono]
  );

  const guardarTrazaActual = useCallback(() => {
    setTrazas(guardarTraza(construirTraza(etiquetaTraza.trim() || "A")));
  }, [construirTraza, etiquetaTraza]);

  // ── Verificar y conectar (UNA operación explícita) ─────────────────────
  const verificarYConectar = useCallback(async () => {
    // Doble clic → 1 POST.
    if (!obtenerCerrojo().intentar()) return;

    const piezas = obtenerAcc().piezas;
    if (!piezas) {
      obtenerCerrojo().soltar();
      return;
    }

    setFase("verificando");
    setCodigoError(null);

    const r = await callCoexistenceConfirm(piezas);

    // El `code` queda gastado pase lo que pase: se descarta.
    obtenerAcc().reiniciar();

    if (r.ok) {
      setVerificado(r.verificado);
      setFase("verificado");
      // El cerrojo NO se suelta: no hay reintento posible tras el éxito.
    } else {
      setCodigoError(r.codigo);
      setFase("error-servidor");
      setCandidatos(null);
      setTieneCodigo(false);
      obtenerCerrojo().soltar();
    }
  }, [obtenerAcc, obtenerCerrojo]);

  const botonSignupDeshabilitado = estadoSdk !== "listo" || !configCompleta;
  const listoParaConfirmar = Boolean(candidatos && tieneCodigo);
  const botonConfirmDeshabilitado =
    !listoParaConfirmar || fase === "verificando" || fase === "verificado";
  const codeVencido = fase === "error-servidor" && codigoError !== null && CODIGO_VENCIDO.has(codigoError);

  const pasos: Array<{ titulo: string; estado: "pendiente" | "activo" | "hecho" }> = [
    { titulo: "SDK de Facebook listo", estado: estadoSdk === "listo" ? "hecho" : estadoSdk === "error" ? "pendiente" : "activo" },
    { titulo: "Asistente de Meta abierto", estado: fase === "sdk" ? "pendiente" : fase === "abierto" ? "activo" : "hecho" },
    {
      titulo: "Meta identificó los activos",
      estado:
        fase === "confirmado" ? "activo" : ["verificando", "verificado", "error-servidor"].includes(fase) ? "hecho" : "pendiente",
    },
    {
      titulo: "Verificar y suscribir (servidor)",
      estado: fase === "verificando" ? "activo" : fase === "verificado" ? "hecho" : "pendiente",
    },
    { titulo: "WhatsApp conectado a la app de Meta", estado: fase === "verificado" ? "hecho" : "pendiente" },
  ];

  return (
    <>
      <Script
        id="facebook-jssdk"
        src={SDK_SRC}
        strategy="afterInteractive"
        crossOrigin="anonymous"
        onLoad={inicializarSdk}
        onReady={inicializarSdk}
        onError={() => setEstadoSdk("error")}
      />

      <article className="mx-auto max-w-3xl">
        <header className="border-b border-border pb-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Uso interno · temporal · no indexable
          </p>
          <h1 className="mt-2 text-2xl font-bold leading-tight text-text sm:text-3xl">
            Conectar WhatsApp Business (Coexistence)
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Lanza el asistente de Meta (Embedded Signup) en modo{" "}
            <span className="font-mono text-text">whatsapp_business_app_onboarding</span> para un
            número que <strong>ya usa la app WhatsApp Business</strong>. Cuando Meta identifica los
            activos, tú confirmas la verificación y la suscripción con un botón. El número del
            agente <strong>no se toca</strong>.
          </p>
        </header>

        {/* Advertencia de Coexistence */}
        <section className="mt-6 rounded-2xl border border-amber-500 bg-amber-50 p-5 text-sm text-black">
          <p className="font-semibold">⚠ Antes de continuar</p>
          <p className="mt-2 leading-relaxed">
            Este flujo es para un número que ya usa WhatsApp Business App. <strong>No continúes</strong>{" "}
            si Meta pide eliminar, migrar o desconectar la cuenta fuera de WhatsApp Business.
            Coexistence mantiene la app y la API a la vez; no es una migración y no vuelve a registrar
            el número.
          </p>
        </section>

        {/* Progreso */}
        <section className="mt-8">
          <ol className="space-y-2">
            {pasos.map((p, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span
                  aria-hidden="true"
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                    p.estado === "hecho"
                      ? "border-success bg-success text-white"
                      : p.estado === "activo"
                        ? "border-primary text-primary"
                        : "border-border text-muted"
                  }`}
                >
                  {p.estado === "hecho" ? "✓" : i + 1}
                </span>
                <span className={p.estado === "pendiente" ? "text-muted" : "text-text"}>{p.titulo}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Estado del SDK y configuración */}
        <section className="mt-8 grid gap-3 sm:grid-cols-2">
          <EstadoTarjeta
            titulo="Facebook JavaScript SDK"
            valor={estadoSdk === "listo" ? "inicializado" : estadoSdk === "cargando" ? "cargando…" : "error al cargar"}
            ok={estadoSdk === "listo"}
          />
          <EstadoTarjeta
            titulo="Configuración pública"
            valor={
              configCompleta
                ? "APP ID y CONFIG ID presentes"
                : !APP_ID
                  ? "falta NEXT_PUBLIC_META_APP_ID"
                  : "falta NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID"
            }
            ok={configCompleta}
          />
        </section>

        <dl className="mt-4 rounded-2xl border border-border bg-surface p-5 text-sm">
          <FilaDl etiqueta="APP ID" valor={APP_ID ?? "—"} />
          <FilaDl etiqueta="CONFIG ID" valor={CONFIG_ID ?? "—"} />
          <FilaDl etiqueta="Versión Graph (SDK)" valor={GRAPH_VERSION} />
        </dl>

        {/* Paso 1 — lanzar el asistente */}
        <section className="mt-8">
          <button
            type="button"
            onClick={conectar}
            disabled={botonSignupDeshabilitado}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {codeVencido || fase === "error-servidor" ? "Volver a iniciar la conexión con Meta" : "Conectar WhatsApp Business"}
          </button>
          {botonSignupDeshabilitado ? (
            <p className="mt-2 text-xs text-muted">
              El botón se habilita cuando el SDK está inicializado y la configuración pública está completa.
            </p>
          ) : null}
          {errorConfig ? <p className="mt-2 text-sm font-medium text-red-600">{errorConfig}</p> : null}
        </section>

        {/* Resultado del callback de FB.login (sin el code) */}
        {mensajeCallback ? (
          <section
            className={`mt-6 rounded-2xl border p-5 text-sm ${
              tieneCodigo ? "border-success" : "border-border"
            } bg-surface`}
          >
            <p className="font-semibold text-text">
              {tieneCodigo ? "Meta devolvió un código de autorización" : "Sin código de autorización"}
            </p>
            <p className="mt-2 text-muted">{mensajeCallback}</p>
          </section>
        ) : null}

        {/* Paso 2 — confirmación explícita */}
        {candidatos && fase !== "verificado" ? (
          <section className="mt-6 rounded-2xl border border-primary bg-surface p-6">
            <h2 className="text-lg font-semibold text-text">Activos identificados por Meta</h2>
            <dl className="mt-4 text-sm">
              <FilaDl etiqueta="WABA ID candidato" valor={candidatos.wabaId} />
              <FilaDl etiqueta="Phone Number ID candidato" valor={candidatos.phoneNumberId} />
              <FilaDl etiqueta="Código de autorización" valor={tieneCodigo ? "recibido (en memoria)" : "pendiente"} />
            </dl>
            <p className="mt-4 rounded-xl border border-amber-500 bg-amber-50 p-4 text-sm text-black">
              Meta identificó estos activos. Al continuar se verificará que pertenecen a esta app y,
              si todo es correcto, se suscribirá la app SISTETECNI a esta cuenta de WhatsApp.
            </p>
            <button
              type="button"
              onClick={() => void verificarYConectar()}
              disabled={botonConfirmDeshabilitado}
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {fase === "verificando" ? "Verificando y conectando…" : "Verificar y conectar este WhatsApp"}
            </button>
          </section>
        ) : null}

        {/* Error del servidor */}
        {fase === "error-servidor" && codigoError ? (
          <section className="mt-6 rounded-2xl border border-red-600 bg-surface p-5 text-sm">
            <p className="font-semibold text-text">La operación no se completó</p>
            <p className="mt-2 text-muted">
              {MENSAJE_ERROR_SERVIDOR[codigoError] ?? "No se pudo completar. Inténtalo de nuevo."}
            </p>
            <p className="mt-2 font-mono text-xs text-muted">código: {codigoError}</p>
            {codeVencido ? (
              <p className="mt-2 text-xs text-muted">
                El código de Meta es de un solo uso: pulsa &laquo;Volver a iniciar la conexión con
                Meta&raquo; arriba para obtener uno nuevo.
              </p>
            ) : null}
          </section>
        ) : null}

        {/* Éxito */}
        {fase === "verificado" && verificado ? (
          <section className="mt-6 rounded-2xl border border-success bg-surface p-6">
            <h2 className="text-lg font-semibold text-text">WhatsApp conectado a la app de Meta</h2>
            <p className="mt-2 rounded-xl border border-primary bg-surface p-3 text-sm font-semibold text-text">
              Número conectado: <span className="font-mono">{verificado.displayPhoneNumber}</span>
            </p>
            <dl className="mt-4 text-sm">
              <FilaDl etiqueta="WABA ID" valor={verificado.wabaId} />
              <FilaDl etiqueta="Phone Number ID" valor={verificado.phoneNumberId} />
              <FilaDl etiqueta="Nombre verificado" valor={verificado.verifiedName ?? "—"} />
              <FilaDl etiqueta="Token válido" valor={verificado.tokenValido ? "Sí" : "No"} />
              <FilaDl etiqueta="App ID coincide" valor={verificado.appIdCoincide ? "Sí" : "No"} />
              <FilaDl etiqueta="Suscripción" valor="hecha" />
            </dl>
            <p className="mt-5 rounded-xl border border-amber-500 bg-amber-50 p-4 text-sm font-medium text-black">
              WhatsApp quedó conectado a la app de Meta. El agente todavía continúa atendiendo el
              número anterior — el cambio de <span className="font-mono">WHATSAPP_PHONE_NUMBER_ID</span>{" "}
              se hace aparte, de forma manual y controlada, tras comprobar arriba que el número es el
              esperado.
            </p>
          </section>
        ) : null}

        {/* Eventos de Embedded Signup (diagnóstico) */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-text">Eventos de Embedded Signup</h2>
          <p className="mt-1 text-sm text-muted">
            Para Coexistence el éxito esperado es{" "}
            <span className="font-mono text-text">{EXITO_COEXISTENCE}</span>.
          </p>

          {eventos.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Todavía no se ha recibido ningún evento.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {eventos.map((ev) => (
                <li key={ev.id} className={`rounded-2xl border p-4 ${CLASE_COLOR[ev.clase]}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-sm font-semibold text-text">{ev.event}</span>
                    <span className="text-xs text-muted">{ev.recibidoEn}</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                    <Campo etiqueta="waba_id" valor={ev.wabaId} />
                    <Campo etiqueta="phone_number_id" valor={ev.phoneNumberId} />
                    <Campo etiqueta="business_id" valor={ev.businessId} />
                    <Campo etiqueta="paso" valor={ev.paso} />
                  </dl>
                  {ev.clase === "exito-inesperado" ? (
                    <p className="mt-2 text-xs font-medium text-amber-700">
                      Este es el evento del onboarding estándar, no el de Coexistence. No habilita el
                      botón de conexión.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Diagnóstico técnico */}
        <details className="mt-8 rounded-2xl border border-border bg-surface p-6 text-sm">
          <summary className="cursor-pointer text-base font-semibold text-text">Diagnóstico técnico</summary>
          <p className="mt-2 text-xs text-muted">
            Solo metadata segura. Nunca aparecen aquí el code, el access token, el App Secret, el{" "}
            <span className="font-mono">authResponse</span> completo, cookies ni la sesión.
          </p>

          <h3 className="mt-4 text-sm font-semibold text-text">Configuración</h3>
          <dl className="mt-2">
            <FilaDl etiqueta="APP ID público (FB.init)" valor={diagnosticoServidor.appIdEnmascarado} />
            <FilaDl
              etiqueta="APP ID público = APP ID servidor"
              valor={
                diagnosticoServidor.appIdPublicoCoincideConServer === null
                  ? "no demostrable (falta uno de los dos)"
                  : diagnosticoServidor.appIdPublicoCoincideConServer
                    ? "Sí"
                    : "NO — el popup y el exchange usan apps distintas"
              }
            />
            <FilaDl etiqueta="CONFIG ID presente" valor={diagnosticoServidor.configIdPresente ? "Sí" : "NO"} />
            <FilaDl etiqueta="CONFIG ID (parcial)" valor={diagnosticoServidor.configIdEnmascarado} />
            <FilaDl etiqueta="META_APP_SECRET presente (servidor)" valor={diagnosticoServidor.appSecretPresente ? "Sí" : "NO"} />
            <FilaDl etiqueta="META_OAUTH_REDIRECT_URI presente" valor={diagnosticoServidor.oauthRedirectPresente ? "Sí" : "NO"} />
            <FilaDl etiqueta="Graph version (SDK)" valor={GRAPH_VERSION} />
          </dl>

          <h3 className="mt-4 text-sm font-semibold text-text">Runtime</h3>
          <dl className="mt-2">
            <FilaDl etiqueta="origin actual" valor={typeof window !== "undefined" ? window.location.origin : "—"} />
            <FilaDl etiqueta="SDK cargado" valor={estadoSdk === "listo" ? "Sí" : estadoSdk} />
            <FilaDl etiqueta="FB.init completado" valor={fbInitOk ? "Sí" : "No"} />
            <FilaDl etiqueta="featureType usado" valor={FEATURE_TYPE_COEXISTENCE} />
            <FilaDl etiqueta="sessionInfoVersion" valor="3" />
          </dl>

          <h3 className="mt-4 text-sm font-semibold text-text">Cronología</h3>
          {hitos.length === 0 ? (
            <p className="mt-2 text-xs text-muted">(sin hitos todavía)</p>
          ) : (
            <ol className="mt-2 space-y-1 font-mono text-xs text-text">
              {obtenerCrono().entradas.map((e, i) => (
                <li key={i}>
                  {String(e.enMs).padStart(6, " ")} ms · {e.hito}
                </li>
              ))}
            </ol>
          )}

          <h3 className="mt-4 text-sm font-semibold text-text">Último evento de Meta</h3>
          {ultimoDescriptor ? (
            <dl className="mt-2">
              <FilaDl etiqueta="origin permitido" valor={ultimoDescriptor.originPermitido ? "Sí" : "No"} />
              <FilaDl etiqueta="origin" valor={ultimoDescriptor.origin ?? "—"} />
              <FilaDl etiqueta="type" valor={ultimoDescriptor.type ?? "—"} />
              <FilaDl etiqueta="event" valor={ultimoDescriptor.event ?? "—"} />
              <FilaDl etiqueta="dataKeys" valor={ultimoDescriptor.dataKeys.join(", ") || "—"} />
              <FilaDl etiqueta="current_step" valor={ultimoDescriptor.currentStep ?? "—"} />
            </dl>
          ) : (
            <p className="mt-2 text-xs text-muted">(no se ha recibido ningún evento de un origin de Meta)</p>
          )}

          <h3 className="mt-4 text-sm font-semibold text-text">Comparar intentos (A vs B)</h3>
          <p className="mt-1 text-xs text-muted">
            Ejecuta el flujo con el número que funciona, guarda como <strong>A</strong>. Repite con el
            311, guarda como <strong>B</strong>. La tabla muestra en qué campo divergen. Las trazas se
            guardan solo en este navegador (localStorage), sin teléfonos completos ni secretos.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted">
              etiqueta:{" "}
              <input
                value={etiquetaTraza}
                onChange={(e) => setEtiquetaTraza(e.target.value.slice(0, 24))}
                className="w-24 rounded border border-border bg-white px-2 py-1 font-mono text-xs text-text"
              />
            </label>
            <button
              type="button"
              onClick={guardarTrazaActual}
              className="rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary hover:text-white"
            >
              Guardar traza del intento actual
            </button>
          </div>

          {trazas.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs">
              {trazas.map((t) => (
                <li key={t.etiqueta} className="font-mono text-muted">
                  <span className="text-text">{t.etiqueta}</span> · {t.resultado} · evento={t.ultimoEvento ?? "—"} ·
                  step={t.currentStep ?? "—"} · code={t.fbLoginCodeRecibido ? "sí" : "no"} · waba=
                  {t.wabaIdPresente ? "sí" : "no"} · pnid={t.phoneNumberIdPresente ? "sí" : "no"}
                  {t.errorIdMeta ? ` · errorId=${t.errorIdMeta}` : ""}
                  {t.codigoServidor ? ` · servidor=${t.codigoServidor}` : ""}
                </li>
              ))}
            </ul>
          ) : null}

          <DiffTrazas trazas={trazas} />
        </details>

        {/* Qué NO hace esta fase */}
        <section className="mt-8 rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
          <h2 className="text-base font-semibold text-text">Qué NO hace esta fase</h2>
          <ul className="mt-3 space-y-2">
            <li>No llama a <span className="font-mono text-text">/register</span> del número.</li>
            <li>No persiste el token: existe solo en memoria del servidor durante la petición.</li>
            <li>
              No cambia <span className="font-mono text-text">WHATSAPP_PHONE_NUMBER_ID</span>,{" "}
              <span className="font-mono text-text">WHATSAPP_WABA_ID</span>,{" "}
              <span className="font-mono text-text">WHATSAPP_ACCESS_TOKEN</span> ni el `.env`/systemd del agente.
            </li>
            <li>No escribe en Supabase.</li>
          </ul>
        </section>
      </article>
    </>
  );
}

function DiffTrazas({ trazas }: { trazas: TrazaIntento[] }) {
  const a = trazas.find((t) => t.etiqueta === "A") ?? null;
  const b = trazas.find((t) => t.etiqueta === "B") ?? null;
  if (!a || !b) {
    return (
      <p className="mt-3 text-xs text-muted">
        Guarda una traza con etiqueta <span className="font-mono">A</span> y otra con{" "}
        <span className="font-mono">B</span> para ver el diff.
      </p>
    );
  }
  const filas = diffTrazas(a, b);
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[28rem] text-left text-xs">
        <thead className="bg-surface text-muted">
          <tr>
            <th className="px-3 py-2">campo que diverge</th>
            <th className="px-3 py-2">A</th>
            <th className="px-3 py-2">B (311)</th>
          </tr>
        </thead>
        <tbody className="font-mono text-text">
          {filas.length === 0 ? (
            <tr>
              <td className="px-3 py-2 text-muted" colSpan={3}>
                A y B coinciden en los campos comparados.
              </td>
            </tr>
          ) : (
            filas.map((f) => (
              <tr key={f.campo} className="border-t border-border">
                <td className="px-3 py-2">{f.campo}</td>
                <td className="px-3 py-2 break-all">{JSON.stringify(f.a)}</td>
                <td className="px-3 py-2 break-all">{JSON.stringify(f.b)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function EstadoTarjeta({ titulo, valor, ok }: { titulo: string; valor: string; ok: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${ok ? "border-success" : "border-border"} bg-surface`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{titulo}</div>
      <div className="mt-1 text-sm font-semibold text-text">{valor}</div>
    </div>
  );
}

function FilaDl({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <dt className="text-muted">{etiqueta}</dt>
      <dd className="font-mono break-all text-right text-text">{valor}</dd>
    </div>
  );
}

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border py-1 last:border-b-0">
      <span className="text-muted">{etiqueta}</span>
      <span className="font-mono break-all text-text">{valor ?? "—"}</span>
    </div>
  );
}
