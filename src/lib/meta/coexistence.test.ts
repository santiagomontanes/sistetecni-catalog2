/**
 * Tests de la lógica pura del onboarding por Coexistence. Sin navegador y sin
 * ninguna llamada real a Meta. Cubren exactamente lo que pide el encargo:
 *
 *  - SDK no cargado / config ausente → el componente puede deshabilitar el botón
 *    (aquí: construirParametrosFbLogin lanza un error claro).
 *  - FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING → se extraen los IDs.
 *  - CANCEL → estado cancelado.
 *  - ERROR → clase "error", sin texto crudo de Meta.
 *  - el authorization code nunca se refleja entero.
 *  - un postMessage de origen desconocido se rechaza.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ORIGENES_META_CONFIABLES,
  esOrigenConfiable,
  interpretarMensajeEmbeddedSignup,
  construirParametrosFbLogin,
  resumirRespuestaFbLogin,
  extraerCodigoFbLogin,
  crearAcumuladorPiezas,
  crearCerrojoUnaVez,
  crearCronologia,
  describirEventoParaDiagnostico,
  diffTrazas,
  enmascararConfigId,
  hitoDeEvento,
  HITOS_CRONOLOGIA,
  CLAVES_DATA_CONOCIDAS,
  ErrorConfigCoexistence,
  EXITO_COEXISTENCE,
  FEATURE_TYPE_COEXISTENCE,
  type TrazaIntento,
} from "./coexistence";

const CODE_FALSO = "AQD-authorization-code-de-prueba-que-no-vale-nada-1234567890";

// ─────────────────────────────────────────────────────────────
// Origen del postMessage
// ─────────────────────────────────────────────────────────────

test("solo se aceptan postMessage de orígenes de Meta conocidos", () => {
  for (const origen of ORIGENES_META_CONFIABLES) {
    assert.equal(esOrigenConfiable(origen), true, origen);
  }
  for (const hostil of [
    "https://facebook.com.evil.example",
    "https://www.facebook.com.evil.example",
    "http://www.facebook.com",
    "https://evil.example",
    "null",
    "",
    undefined,
    null,
    42,
  ]) {
    assert.equal(esOrigenConfiable(hostil as unknown), false, String(hostil));
  }
});

// ─────────────────────────────────────────────────────────────
// Interpretación del evento
// ─────────────────────────────────────────────────────────────

test("FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING: extrae waba_id, phone_number_id y business_id", () => {
  const r = interpretarMensajeEmbeddedSignup({
    type: "WA_EMBEDDED_SIGNUP",
    event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
    data: {
      waba_id: "102290129340398",
      phone_number_id: "106540352242922",
      business_id: "598523443395425",
    },
  });

  assert.ok(r);
  assert.equal(r.event, EXITO_COEXISTENCE);
  assert.equal(r.clase, "exito");
  assert.equal(r.wabaId, "102290129340398");
  assert.equal(r.phoneNumberId, "106540352242922");
  assert.equal(r.businessId, "598523443395425");
});

test("FINISH estándar se reconoce pero se marca como éxito inesperado en Coexistence", () => {
  const r = interpretarMensajeEmbeddedSignup({
    type: "WA_EMBEDDED_SIGNUP",
    event: "FINISH",
    data: { waba_id: "1", phone_number_id: "2" },
  });
  assert.ok(r);
  assert.equal(r.clase, "exito-inesperado");
});

test("CANCEL: estado cancelado, con el paso saneado si Meta lo envía", () => {
  const r = interpretarMensajeEmbeddedSignup({
    type: "WA_EMBEDDED_SIGNUP",
    event: "CANCEL",
    data: { current_step: "PHONE_NUMBER_SETUP" },
  });
  assert.ok(r);
  assert.equal(r.event, "CANCEL");
  assert.equal(r.clase, "cancelado");
  assert.equal(r.paso, "PHONE_NUMBER_SETUP");
  assert.equal(r.wabaId, null);
});

test("ERROR: clase error y ningún texto crudo de Meta en el resultado", () => {
  const r = interpretarMensajeEmbeddedSignup({
    type: "WA_EMBEDDED_SIGNUP",
    event: "ERROR",
    data: { error_message: "<script>alert('meta dice esto')</script>" },
  });
  assert.ok(r);
  assert.equal(r.clase, "error");
  assert.ok(!JSON.stringify(r).includes("alert"), "el mensaje de Meta no se refleja");
  assert.ok(!JSON.stringify(r).includes("script"));
});

test("acepta el payload como string JSON", () => {
  const r = interpretarMensajeEmbeddedSignup(
    JSON.stringify({
      type: "WA_EMBEDDED_SIGNUP",
      event: "CANCEL",
      data: {},
    })
  );
  assert.ok(r);
  assert.equal(r.event, "CANCEL");
});

test("ignora silenciosamente mensajes que no son de Embedded Signup", () => {
  for (const ajeno of [
    undefined,
    null,
    "hola",
    "{no es json",
    42,
    { type: "OTRA_COSA", event: "FINISH" },
    { type: "WA_EMBEDDED_SIGNUP", event: "EVENTO_INVENTADO" },
    { type: "WA_EMBEDDED_SIGNUP" },
    { event: "FINISH", data: {} },
    ["WA_EMBEDDED_SIGNUP"],
  ]) {
    assert.equal(interpretarMensajeEmbeddedSignup(ajeno as unknown), null, JSON.stringify(ajeno));
  }
});

test("los identificadores no numéricos se descartan (no se reflejan al HTML)", () => {
  const r = interpretarMensajeEmbeddedSignup({
    type: "WA_EMBEDDED_SIGNUP",
    event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
    data: {
      waba_id: "../../etc/passwd",
      phone_number_id: "<img onerror=x>",
      business_id: "998877665544",
    },
  });
  assert.ok(r);
  assert.equal(r.wabaId, null);
  assert.equal(r.phoneNumberId, null);
  assert.equal(r.businessId, "998877665544");
});

// ─────────────────────────────────────────────────────────────
// Parámetros de FB.login
// ─────────────────────────────────────────────────────────────

test("construirParametrosFbLogin produce EXACTAMENTE el contrato de Coexistence", () => {
  const params = construirParametrosFbLogin("1234567890123456");
  assert.deepEqual(params, {
    config_id: "1234567890123456",
    response_type: "code",
    override_default_response_type: true,
    extras: {
      setup: {},
      featureType: "whatsapp_business_app_onboarding",
      sessionInfoVersion: "3",
    },
  });
  assert.equal(params.extras.featureType, FEATURE_TYPE_COEXISTENCE);
});

test("config ausente o inválida → ErrorConfigCoexistence con mensaje claro", () => {
  for (const malo of ["", "   ", undefined, null, 123, "https://example.com/config", "abc"]) {
    assert.throws(
      () => construirParametrosFbLogin(malo as unknown),
      (err: unknown) => {
        assert.ok(err instanceof ErrorConfigCoexistence);
        assert.match(err.message, /CONFIG_ID|config_id/);
        return true;
      },
      String(malo)
    );
  }
});

// ─────────────────────────────────────────────────────────────
// Respuesta del callback: el code nunca se refleja
// ─────────────────────────────────────────────────────────────

test("resumirRespuestaFbLogin informa que llegó un code SIN exponerlo", () => {
  const resumen = resumirRespuestaFbLogin({ authResponse: { code: CODE_FALSO } });
  assert.equal(resumen.estado, "codigo-recibido");
  assert.equal(resumen.tieneCodigo, true);
  assert.equal(resumen.longitudCodigo, CODE_FALSO.length);

  const serializado = JSON.stringify(resumen);
  assert.ok(!serializado.includes(CODE_FALSO), "el resumen filtra el code");
  assert.ok(!serializado.includes(CODE_FALSO.slice(0, 12)), "ni un fragmento del code");
});

test("resumirRespuestaFbLogin: popup cerrado sin completar → cancelado", () => {
  for (const vacio of [{}, { authResponse: null }, { authResponse: {} }, null, undefined]) {
    const resumen = resumirRespuestaFbLogin(vacio as unknown);
    assert.equal(resumen.estado, "cancelado");
    assert.equal(resumen.tieneCodigo, false);
    assert.equal(resumen.longitudCodigo, 0);
  }
});

test("extraerCodigoFbLogin devuelve el code o null, nunca un objeto", () => {
  assert.equal(extraerCodigoFbLogin({ authResponse: { code: CODE_FALSO } }), CODE_FALSO);
  for (const vacio of [{}, { authResponse: null }, { authResponse: {} }, { authResponse: { code: "" } }, null]) {
    assert.equal(extraerCodigoFbLogin(vacio as unknown), null);
  }
});

// ─────────────────────────────────────────────────────────────
// Acumulador de piezas — SIN auto-disparo (la confirmación es un botón)
// ─────────────────────────────────────────────────────────────

const eventoExito = (over: Partial<{ waba_id: string; phone_number_id: string }> = {}) => ({
  type: "WA_EMBEDDED_SIGNUP",
  event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
  data: { waba_id: "102290129340398", phone_number_id: "106540352242922", ...over },
});

const interpretar = (raw: unknown) => interpretarMensajeEmbeddedSignup(raw);

test("acumulador: FINISH estándar → sin candidatos, sin piezas (botón NO disponible)", () => {
  const acc = crearAcumuladorPiezas();
  acc.registrarCodigo(CODE_FALSO);
  acc.registrarEvento(interpretar({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { waba_id: "1", phone_number_id: "2" } }));
  assert.equal(acc.candidatos, null);
  assert.equal(acc.piezas, null);
  assert.equal(acc.tieneCodigo, true, "el code sí se guardó, pero no basta");
});

test("acumulador: evento de Coexistence → candidatos disponibles; con code → piezas completas", () => {
  const acc = crearAcumuladorPiezas();
  acc.registrarEvento(interpretar(eventoExito()));
  assert.deepEqual(acc.candidatos, { wabaId: "102290129340398", phoneNumberId: "106540352242922" });
  assert.equal(acc.piezas, null, "todavía falta el code → botón deshabilitado");

  acc.registrarCodigo(CODE_FALSO);
  assert.deepEqual(acc.piezas, {
    code: CODE_FALSO,
    wabaId: "102290129340398",
    phoneNumberId: "106540352242922",
  });
});

test("acumulador: el orden da igual (code primero o evento primero)", () => {
  const a = crearAcumuladorPiezas();
  a.registrarCodigo(CODE_FALSO);
  a.registrarEvento(interpretar(eventoExito()));
  assert.ok(a.piezas);

  const b = crearAcumuladorPiezas();
  b.registrarEvento(interpretar(eventoExito()));
  b.registrarCodigo(CODE_FALSO);
  assert.deepEqual(a.piezas, b.piezas);
});

test("acumulador: NO se auto-dispara nada — solo expone getters", () => {
  // `crearAcumuladorPiezas` no recibe callback: es imposible que dispare un POST.
  assert.equal(crearAcumuladorPiezas.length, 0);
});

test("acumulador: evento/callback duplicado → gana el primero", () => {
  const acc = crearAcumuladorPiezas();
  acc.registrarEvento(interpretar(eventoExito()));
  acc.registrarEvento(interpretar(eventoExito({ waba_id: "999", phone_number_id: "888" })));
  acc.registrarCodigo(CODE_FALSO);
  acc.registrarCodigo("OTRO-code-que-no-deberia-usarse-1234567890");
  assert.deepEqual(acc.piezas, {
    code: CODE_FALSO,
    wabaId: "102290129340398",
    phoneNumberId: "106540352242922",
  });
});

test("acumulador: CANCEL, ERROR y evento nulo no aportan identificadores", () => {
  for (const raw of [
    { type: "WA_EMBEDDED_SIGNUP", event: "CANCEL", data: {} },
    { type: "WA_EMBEDDED_SIGNUP", event: "ERROR", data: {} },
    null,
  ]) {
    const acc = crearAcumuladorPiezas();
    acc.registrarCodigo(CODE_FALSO);
    acc.registrarEvento(interpretar(raw));
    assert.equal(acc.candidatos, null, JSON.stringify(raw));
    assert.equal(acc.piezas, null);
  }
});

test("acumulador: reiniciar() borra code y candidatos (code vencido → relanzar)", () => {
  const acc = crearAcumuladorPiezas();
  acc.registrarEvento(interpretar(eventoExito()));
  acc.registrarCodigo(CODE_FALSO);
  assert.ok(acc.piezas);
  acc.reiniciar();
  assert.equal(acc.piezas, null);
  assert.equal(acc.candidatos, null);
  assert.equal(acc.tieneCodigo, false);
});

// ─────────────────────────────────────────────────────────────
// Cerrojo de una vez — "doble clic → 1 POST"
// ─────────────────────────────────────────────────────────────

test("cerrojo: intentar() solo devuelve true la primera vez", () => {
  const c = crearCerrojoUnaVez();
  assert.equal(c.intentar(), true);
  assert.equal(c.intentar(), false);
  assert.equal(c.intentar(), false);
  assert.equal(c.tomado, true);
});

test("cerrojo: soltar() permite un nuevo intento (reintento tras error recuperable)", () => {
  const c = crearCerrojoUnaVez();
  assert.equal(c.intentar(), true);
  c.soltar();
  assert.equal(c.tomado, false);
  assert.equal(c.intentar(), true);
});

test("cerrojo: 10 clics seguidos → un solo true", () => {
  const c = crearCerrojoUnaVez();
  const trues = Array.from({ length: 10 }, () => c.intentar()).filter(Boolean);
  assert.equal(trues.length, 1);
});

// ─────────────────────────────────────────────────────────────
// DIAGNÓSTICO — captura segura de eventos y cronología
// ─────────────────────────────────────────────────────────────


test("featureType es EXACTAMENTE el de Coexistence y nunca uno estándar", () => {
  assert.equal(FEATURE_TYPE_COEXISTENCE, "whatsapp_business_app_onboarding");
  for (const estandar of ["", "onboarding", "whatsapp_business_onboarding", "new_number"]) {
    assert.notEqual(FEATURE_TYPE_COEXISTENCE, estandar);
  }
  // No hay más de una forma de construir los parámetros: `construirParametrosFbLogin`
  // es la única, y siempre devuelve el featureType de Coexistence.
  const p = construirParametrosFbLogin("123456789012");
  assert.equal(p.extras.featureType, "whatsapp_business_app_onboarding");
  assert.equal(p.extras.sessionInfoVersion, "3");
  assert.equal(p.response_type, "code");
  assert.equal(p.override_default_response_type, true);
});

test("hitoDeEvento: Coexistence vs onboarding estándar vs cancel/error", () => {
  assert.equal(hitoDeEvento("FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"), "COEXISTENCE_FINISH");
  assert.equal(hitoDeEvento("FINISH"), "STANDARD_FINISH");
  assert.equal(hitoDeEvento("FINISH_ONLY_WABA"), "STANDARD_FINISH");
  assert.equal(hitoDeEvento("CANCEL"), "CANCEL");
  assert.equal(hitoDeEvento("ERROR"), "ERROR");
  assert.equal(hitoDeEvento("ALGO_RARO"), null);
});

test("cronología: solo hitos de la lista blanca, dedup salvo MESSAGE_RECEIVED", () => {
  let t = 0;
  const c = crearCronologia(() => t);
  c.registrar("SDK_LOADED");
  t = 10;
  c.registrar("FB_INIT");
  t = 20;
  c.registrar("SDK_LOADED"); // dup → se ignora
  c.registrar("HITO_INVENTADO"); // fuera de lista blanca → se ignora
  t = 30;
  c.registrar("MESSAGE_RECEIVED");
  t = 40;
  c.registrar("MESSAGE_RECEIVED"); // repetible

  assert.deepEqual(
    c.entradas.map((e) => e.hito),
    ["SDK_LOADED", "FB_INIT", "MESSAGE_RECEIVED", "MESSAGE_RECEIVED"]
  );
  assert.deepEqual(
    c.entradas.map((e) => e.enMs),
    [0, 10, 30, 40]
  );
  for (const e of c.entradas) assert.ok((HITOS_CRONOLOGIA as readonly string[]).includes(e.hito));
});

test("describirEventoParaDiagnostico: origin no confiable → sin datos, originPermitido=false", () => {
  const d = describirEventoParaDiagnostico(
    { type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { waba_id: "1" } },
    "https://evil.example"
  );
  assert.equal(d.originPermitido, false);
  assert.equal(d.origin, null);
});

test("describirEventoParaDiagnostico: solo NOMBRES de clave conocidas + recuento del resto", () => {
  const d = describirEventoParaDiagnostico(
    {
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
      data: {
        waba_id: "102290129340398",
        phone_number_id: "106540352242922",
        current_step: "WABA_SELECTION",
        secreto_inventado: "valor-que-no-debe-salir",
        otra_cosa: "tampoco",
      },
    },
    "https://www.facebook.com"
  );
  assert.equal(d.originPermitido, true);
  assert.equal(d.origin, "https://www.facebook.com");
  assert.equal(d.type, "WA_EMBEDDED_SIGNUP");
  assert.equal(d.event, "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING");
  assert.deepEqual(d.dataKeys, ["current_step", "phone_number_id", "waba_id", "otras:2"]);
  assert.equal(d.currentStep, "WABA_SELECTION");

  const s = JSON.stringify(d);
  assert.ok(!s.includes("valor-que-no-debe-salir"));
  assert.ok(!s.includes("tampoco"));
});

test("describirEventoParaDiagnostico: ERROR con error_message NO filtra el texto de Meta", () => {
  const d = describirEventoParaDiagnostico(
    {
      type: "WA_EMBEDDED_SIGNUP",
      event: "ERROR",
      data: { error_message: "<script>alert('meta dice esto libremente')</script>", error_id: "2494064" },
    },
    "https://web.facebook.com"
  );
  assert.equal(d.event, "ERROR");
  // error_message y error_id están en la lista blanca de NOMBRES; sus VALORES no salen.
  assert.deepEqual(d.dataKeys, ["error_id", "error_message"]);
  const s = JSON.stringify(d);
  assert.ok(!s.includes("alert"));
  assert.ok(!s.includes("2494064"), "ni el propio código de error como valor");
  assert.ok(!s.includes("script"));
});

test("describirEventoParaDiagnostico: string JSON y basura no rompen", () => {
  const d = describirEventoParaDiagnostico(
    JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "CANCEL", data: { current_step: "x" } }),
    "https://www.facebook.com"
  );
  assert.equal(d.event, "CANCEL");
  for (const basura of [null, 42, "{no json", [], undefined]) {
    const r = describirEventoParaDiagnostico(basura, "https://www.facebook.com");
    assert.equal(r.originPermitido, true);
    assert.equal(r.event, null);
    assert.deepEqual(r.dataKeys, []);
  }
});

test("CLAVES_DATA_CONOCIDAS es una lista blanca (incluye los identificadores esperados)", () => {
  for (const k of ["waba_id", "phone_number_id", "business_id", "current_step"]) {
    assert.ok((CLAVES_DATA_CONOCIDAS as readonly string[]).includes(k));
  }
});

test("enmascararConfigId no revela el valor entero", () => {
  assert.equal(enmascararConfigId("123456789012345"), "1234…2345");
  assert.equal(enmascararConfigId(""), "(ausente)");
  assert.equal(enmascararConfigId(null), "(ausente)");
  assert.equal(enmascararConfigId("1234567"), "12…");
});

// ─────────────────────────────────────────────────────────────
// diffTrazas — en qué paso divergen A (funciona) y B (311)
// ─────────────────────────────────────────────────────────────

const trazaBase = (over: Partial<TrazaIntento> = {}): TrazaIntento => ({
  etiqueta: "A",
  timestamp: "2026-09-10T00:00:00.000Z",
  resultado: "verificado",
  ultimoEvento: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
  currentStep: null,
  wabaIdPresente: true,
  phoneNumberIdPresente: true,
  fbLoginCodeRecibido: true,
  errorIdMeta: null,
  codigoServidor: null,
  origin: "https://www.facebook.com",
  featureType: "whatsapp_business_app_onboarding",
  sessionInfoVersion: "3",
  hitos: ["SDK_LOADED", "FB_INIT", "LOGIN_OPENED", "MESSAGE_RECEIVED", "COEXISTENCE_FINISH"],
  ...over,
});

test("diffTrazas: A completa vs B que se queda en ERROR con #2494064", () => {
  const a = trazaBase({ etiqueta: "A" });
  const b = trazaBase({
    etiqueta: "B",
    resultado: "error",
    ultimoEvento: "ERROR",
    wabaIdPresente: false,
    phoneNumberIdPresente: false,
    fbLoginCodeRecibido: false,
    errorIdMeta: "2494064",
    hitos: ["SDK_LOADED", "FB_INIT", "LOGIN_OPENED", "MESSAGE_RECEIVED", "ERROR"],
  });
  const filas = diffTrazas(a, b);
  const campos = filas.map((f) => f.campo);
  assert.ok(campos.includes("resultado"));
  assert.ok(campos.includes("ultimoEvento"));
  assert.ok(campos.includes("errorIdMeta"));
  assert.ok(campos.includes("wabaIdPresente"));
  assert.ok(campos.includes("hitos"));
  const hitosDiff = filas.find((f) => f.campo === "hitos");
  assert.deepEqual(hitosDiff?.a, ["COEXISTENCE_FINISH"]);
  assert.deepEqual(hitosDiff?.b, ["ERROR"]);
});

test("diffTrazas: dos trazas idénticas → sin divergencias", () => {
  assert.deepEqual(diffTrazas(trazaBase(), trazaBase({ etiqueta: "B" })), []);
});

test("diffTrazas: si falta una traza → array vacío (no revienta)", () => {
  assert.deepEqual(diffTrazas(null, trazaBase()), []);
  assert.deepEqual(diffTrazas(trazaBase(), null), []);
});
