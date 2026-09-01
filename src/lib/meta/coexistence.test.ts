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
  ErrorConfigCoexistence,
  EXITO_COEXISTENCE,
  FEATURE_TYPE_COEXISTENCE,
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
