/**
 * Tests del endpoint `POST /api/meta/coexistence/confirm` — verificar Y
 * suscribir en UNA operación. COMPLETAMENTE herméticos: `fetch` y autorizador
 * inyectados, ni una llamada real a Graph ni a Supabase. El `fetch` falso
 * registra qué URLs se pidieron y en qué orden, que es lo que permite afirmar:
 *   - `subscribed_apps` se llama EXACTAMENTE una vez, y solo tras verificar;
 *   - `/register` NUNCA se llama;
 *   - el orden es oauth → debug_token → phone_numbers → subscribed_apps.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { AdminAuthError } from "../personalizadorAdmin/auth";
import type { ConfigMeta } from "./env";
import { manejarConfirm, MAX_BYTES_BODY, type ContextoAdmin } from "./confirm";

// ─────────────────────────────────────────────────────────────
// Valores de prueba. Ninguno es real.
// ─────────────────────────────────────────────────────────────
const APP_SECRET_FALSO = "secreto-de-prueba-no-real-0123456789";
const CODE_FALSO = "AQD-code-de-prueba-larguito-que-no-sirve-1234567890";
const TOKEN_FALSO = "EAA-token-de-prueba-que-no-debe-salir-de-aqui";
const BEARER_FALSO = "eyJhbGciOi.session.jwt-de-prueba";

const CONFIG: ConfigMeta = {
  appId: "1234567890",
  appSecret: APP_SECRET_FALSO,
  graphVersion: "v25.0",
  redirectUri: "https://sistetecni.com/api/meta/whatsapp/callback",
};

const WABA_ID = "998877665544";
const PHONE_ID = "555000111";
const BODY_OK = { code: CODE_FALSO, wabaId: WABA_ID, phoneNumberId: PHONE_ID };

const adminOk = async (): Promise<ContextoAdmin> => ({ userId: "operador-1" });

/** `fetch` falso que registra las URLs pedidas (en orden) y responde por patrón. */
function crearFetchFalso(
  rutas: Array<{ contiene: string; cuerpo?: unknown; estado?: number; crudo?: string; lanza?: Error }>
) {
  const pedidas: string[] = [];
  const impl = (async (entrada: URL | RequestInfo) => {
    const url = String(entrada);
    pedidas.push(url);
    const ruta = rutas.find((r) => url.includes(r.contiene));
    if (!ruta) return new Response(JSON.stringify({ error: { message: "sin ruta" } }), { status: 404 });
    if (ruta.lanza) throw ruta.lanza;
    if (typeof ruta.crudo === "string") return new Response(ruta.crudo, { status: ruta.estado ?? 200 });
    return new Response(JSON.stringify(ruta.cuerpo ?? {}), { status: ruta.estado ?? 200 });
  }) as typeof fetch;
  return { impl, pedidas };
}

const R_TOKEN = { contiene: "oauth/access_token", cuerpo: { access_token: TOKEN_FALSO, token_type: "bearer" } };
const R_DEBUG = {
  contiene: "debug_token",
  cuerpo: {
    data: {
      app_id: "1234567890",
      is_valid: true,
      expires_at: 1893456000,
      scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
    },
  },
};
const rNumeros = (lista: Array<{ id: string; display: string }>) => ({
  contiene: "phone_numbers",
  cuerpo: { data: lista.map((n) => ({ id: n.id, display_phone_number: n.display, verified_name: "SISTETECNI" })) },
});
const R_SUBS_OK = { contiene: "subscribed_apps", cuerpo: { success: true } };

/** El camino completo hasta suscribir, con éxito. */
const rutasFelices = () =>
  crearFetchFalso([R_TOKEN, R_DEBUG, rNumeros([{ id: PHONE_ID, display: "+57 311 5996339" }]), R_SUBS_OK]);

const base = (over: Partial<Parameters<typeof manejarConfirm>[0]> = {}) => ({
  habilitado: true,
  authToken: BEARER_FALSO,
  body: BODY_OK,
  config: CONFIG,
  autorizar: adminOk,
  ...over,
});

const pidio = (pedidas: string[], frag: string) => pedidas.filter((u) => u.includes(frag)).length;

// ═════════════════════════════════════════════════════════════════════════
// Kill switch y auth  — subscribed_apps NUNCA se toca
// ═════════════════════════════════════════════════════════════════════════

test("kill switch OFF → 404 COEXISTENCE_DISABLED, sin tocar Meta", async () => {
  const { impl, pedidas } = rutasFelices();
  const r = await manejarConfirm(base({ habilitado: false, fetchImpl: impl }));
  assert.equal(r.status, 404);
  if (!r.ok) assert.equal(r.cuerpo.codigo, "COEXISTENCE_DISABLED");
  assert.deepEqual(pedidas, []);
});

test("sin bearer token → 401 AUTH_REQUIRED, no se llama al autorizador ni a Meta", async () => {
  const { impl, pedidas } = rutasFelices();
  let autorizadorLlamado = false;
  const r = await manejarConfirm(
    base({
      authToken: undefined,
      fetchImpl: impl,
      autorizar: async () => {
        autorizadorLlamado = true;
        return { userId: "x" };
      },
    })
  );
  assert.equal(r.status, 401);
  if (!r.ok) assert.equal(r.cuerpo.codigo, "AUTH_REQUIRED");
  assert.equal(autorizadorLlamado, false);
  assert.deepEqual(pedidas, []);
});

test("usuario sin permisos → 403 FORBIDDEN, cero subscribed_apps", async () => {
  const { impl, pedidas } = rutasFelices();
  const r = await manejarConfirm(
    base({
      fetchImpl: impl,
      autorizar: async () => {
        throw new AdminAuthError("No tienes permisos de administrador.");
      },
    })
  );
  assert.equal(r.status, 403);
  if (!r.ok) assert.equal(r.cuerpo.codigo, "FORBIDDEN");
  assert.equal(pidio(pedidas, "subscribed_apps"), 0);
});

test("sesión inválida/expirada → 401 AUTH_REQUIRED", async () => {
  const { impl } = rutasFelices();
  const r = await manejarConfirm(
    base({
      fetchImpl: impl,
      autorizar: async () => {
        throw new AdminAuthError("Sesión inválida o expirada.");
      },
    })
  );
  assert.equal(r.status, 401);
  if (!r.ok) assert.equal(r.cuerpo.codigo, "AUTH_REQUIRED");
});

// ═════════════════════════════════════════════════════════════════════════
// Body
// ═════════════════════════════════════════════════════════════════════════

test("body inválido → 400, sin llegar a Meta", async () => {
  const { impl, pedidas } = rutasFelices();
  const casos: unknown[] = [
    null,
    {},
    { code: CODE_FALSO, wabaId: WABA_ID },
    { code: CODE_FALSO, wabaId: "no-numerico", phoneNumberId: PHONE_ID },
    { code: CODE_FALSO, wabaId: WABA_ID, phoneNumberId: "abc" },
    { code: CODE_FALSO, wabaId: WABA_ID, phoneNumberId: PHONE_ID, businessId: "1" },
    { code: CODE_FALSO, wabaId: WABA_ID, phoneNumberId: PHONE_ID, token: "x" },
    { code: CODE_FALSO, wabaId: WABA_ID, phoneNumberId: PHONE_ID, redirectUri: "https://x" },
  ];
  for (const body of casos) {
    const r = await manejarConfirm(base({ body, fetchImpl: impl }));
    assert.equal(r.status, 400, JSON.stringify(body));
    if (!r.ok) assert.ok(["BODY_INVALIDO", "CODE_INVALIDO"].includes(r.cuerpo.codigo));
  }
  assert.deepEqual(pedidas, []);
});

test("code con forma inválida → 400 CODE_INVALIDO", async () => {
  const { impl } = crearFetchFalso([]);
  for (const code of ["corto", "", "con espacios aqui", "x".repeat(4000)]) {
    const r = await manejarConfirm(base({ body: { ...BODY_OK, code }, fetchImpl: impl }));
    assert.equal(r.status, 400, code.slice(0, 12));
    if (!r.ok) assert.equal(r.cuerpo.codigo, "CODE_INVALIDO");
  }
});

test("MAX_BYTES_BODY es un tope razonable (lo aplica el route handler)", () => {
  assert.equal(typeof MAX_BYTES_BODY, "number");
  assert.ok(MAX_BYTES_BODY >= 1024 && MAX_BYTES_BODY <= 64 * 1024);
});

// ═════════════════════════════════════════════════════════════════════════
// Cada fallo de verificación → subscribed_apps NO se llama
// ═════════════════════════════════════════════════════════════════════════

test("Graph rechaza el code (400) → 422 INTERCAMBIO_FALLIDO, sin subscribed_apps", async () => {
  const { impl, pedidas } = crearFetchFalso([
    { contiene: "oauth/access_token", estado: 400, cuerpo: { error: { message: "Invalid verification code format." } } },
  ]);
  const r = await manejarConfirm(base({ fetchImpl: impl }));
  assert.equal(r.status, 422);
  if (!r.ok) assert.equal(r.cuerpo.codigo, "INTERCAMBIO_FALLIDO");
  assert.ok(!JSON.stringify(r).includes("Invalid verification code"));
  assert.equal(pidio(pedidas, "subscribed_apps"), 0);
  assert.equal(pidio(pedidas, "/register"), 0);
});

test("timeout de Meta en el exchange → 504 META_TIMEOUT, sin subscribed_apps", async () => {
  const abort = new Error("aborted");
  abort.name = "AbortError";
  const { impl, pedidas } = crearFetchFalso([{ contiene: "oauth/access_token", lanza: abort }]);
  const r = await manejarConfirm(base({ fetchImpl: impl }));
  assert.equal(r.status, 504);
  if (!r.ok) assert.equal(r.cuerpo.codigo, "META_TIMEOUT");
  assert.equal(pidio(pedidas, "subscribed_apps"), 0);
});

test("token no válido → 422 TOKEN_INVALIDO, sin subscribed_apps ni phone_numbers", async () => {
  const { impl, pedidas } = crearFetchFalso([
    R_TOKEN,
    { contiene: "debug_token", cuerpo: { data: { app_id: "1234567890", is_valid: false } } },
    R_SUBS_OK,
  ]);
  const r = await manejarConfirm(base({ fetchImpl: impl }));
  assert.equal(r.status, 422);
  if (!r.ok) assert.equal(r.cuerpo.codigo, "TOKEN_INVALIDO");
  assert.equal(pidio(pedidas, "phone_numbers"), 0);
  assert.equal(pidio(pedidas, "subscribed_apps"), 0);
});

test("token de OTRA app → 422 APP_ID_NO_COINCIDE, sin subscribed_apps", async () => {
  const { impl, pedidas } = crearFetchFalso([
    R_TOKEN,
    { contiene: "debug_token", cuerpo: { data: { app_id: "9999999999", is_valid: true, scopes: [] } } },
    rNumeros([{ id: PHONE_ID, display: "+57 311 5996339" }]),
    R_SUBS_OK,
  ]);
  const r = await manejarConfirm(base({ fetchImpl: impl }));
  assert.equal(r.status, 422);
  if (!r.ok) assert.equal(r.cuerpo.codigo, "APP_ID_NO_COINCIDE");
  assert.equal(pidio(pedidas, "phone_numbers"), 0);
  assert.equal(pidio(pedidas, "subscribed_apps"), 0);
});

test("la WABA da error en Graph → 422 WABA_INVALIDA, sin subscribed_apps", async () => {
  const { impl, pedidas } = crearFetchFalso([
    R_TOKEN,
    R_DEBUG,
    { contiene: "phone_numbers", estado: 400, cuerpo: { error: { message: "Unknown path components" } } },
    R_SUBS_OK,
  ]);
  const r = await manejarConfirm(base({ fetchImpl: impl }));
  assert.equal(r.status, 422);
  if (!r.ok) assert.equal(r.cuerpo.codigo, "WABA_INVALIDA");
  assert.equal(pidio(pedidas, "subscribed_apps"), 0);
});

test("el phone_number_id NO está en la WABA → 422 PHONE_NUMBER_NO_PERTENECE_A_WABA, sin subscribed_apps", async () => {
  const { impl, pedidas } = crearFetchFalso([
    R_TOKEN,
    R_DEBUG,
    rNumeros([{ id: "555999888", display: "+57 320 2210698" }]),
    R_SUBS_OK,
  ]);
  const r = await manejarConfirm(base({ fetchImpl: impl }));
  assert.equal(r.status, 422);
  if (!r.ok) assert.equal(r.cuerpo.codigo, "PHONE_NUMBER_NO_PERTENECE_A_WABA");
  assert.equal(pidio(pedidas, "subscribed_apps"), 0);
});

// ═════════════════════════════════════════════════════════════════════════
// Suscripción
// ═════════════════════════════════════════════════════════════════════════

test("subscribed_apps devuelve success:false → 422 SUBSCRIPCION_FALLIDA", async () => {
  const { impl, pedidas } = crearFetchFalso([
    R_TOKEN,
    R_DEBUG,
    rNumeros([{ id: PHONE_ID, display: "+57 311 5996339" }]),
    { contiene: "subscribed_apps", cuerpo: { success: false } },
  ]);
  const r = await manejarConfirm(base({ fetchImpl: impl }));
  assert.equal(r.status, 422);
  if (!r.ok) assert.equal(r.cuerpo.codigo, "SUBSCRIPCION_FALLIDA");
  assert.equal(pidio(pedidas, "subscribed_apps"), 1);
});

test("subscribed_apps da 4xx en Graph → 422 SUBSCRIPCION_FALLIDA", async () => {
  const { impl } = crearFetchFalso([
    R_TOKEN,
    R_DEBUG,
    rNumeros([{ id: PHONE_ID, display: "+57 311 5996339" }]),
    { contiene: "subscribed_apps", estado: 400, cuerpo: { error: { message: "boom" } } },
  ]);
  const r = await manejarConfirm(base({ fetchImpl: impl }));
  assert.equal(r.status, 422);
  if (!r.ok) assert.equal(r.cuerpo.codigo, "SUBSCRIPCION_FALLIDA");
});

// ═════════════════════════════════════════════════════════════════════════
// Éxito — orden exacto y una sola suscripción
// ═════════════════════════════════════════════════════════════════════════

test("éxito: verifica y suscribe; orden oauth→debug_token→phone_numbers→subscribed_apps; 1 sola suscripción", async () => {
  const { impl, pedidas } = rutasFelices();
  const r = await manejarConfirm(base({ fetchImpl: impl }));

  assert.equal(r.status, 200);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.cuerpo.suscrito, true);
    assert.equal(r.cuerpo.siguientePaso, "CAMBIAR_NUMERO_AGENTE");
    assert.deepEqual(r.cuerpo.verificado, {
      appIdCoincide: true,
      tokenValido: true,
      wabaId: WABA_ID,
      phoneNumberId: PHONE_ID,
      displayPhoneNumber: "+57 311 5996339",
      verifiedName: "SISTETECNI",
    });
  }

  const orden = pedidas.map((u) =>
    u.includes("oauth/access_token")
      ? "oauth"
      : u.includes("debug_token")
        ? "debug"
        : u.includes("phone_numbers")
          ? "numeros"
          : u.includes("subscribed_apps")
            ? "subs"
            : "otro"
  );
  assert.deepEqual(orden, ["oauth", "debug", "numeros", "subs"]);
  assert.equal(pidio(pedidas, "subscribed_apps"), 1);
  assert.equal(pidio(pedidas, "/register"), 0);
});

// ═════════════════════════════════════════════════════════════════════════
// /register NUNCA — y el code/token/secret NUNCA salen
// ═════════════════════════════════════════════════════════════════════════

test("NINGÚN camino llama a /register", async () => {
  const escenarios = [
    () => crearFetchFalso([{ contiene: "oauth/access_token", estado: 400, cuerpo: {} }]),
    () => crearFetchFalso([R_TOKEN, { contiene: "debug_token", cuerpo: { data: { app_id: "9", is_valid: true } } }]),
    () => crearFetchFalso([R_TOKEN, R_DEBUG, rNumeros([{ id: "otro", display: "+57 320 2210698" }])]),
    () => rutasFelices(),
  ];
  for (const armar of escenarios) {
    const { impl, pedidas } = armar();
    await manejarConfirm(base({ fetchImpl: impl }));
    assert.equal(pidio(pedidas, "/register"), 0);
  }
});

test("ni el code, ni el token, ni el App Secret aparecen en NINGUNA respuesta", async () => {
  const escenarios = [
    () => crearFetchFalso([{ contiene: "oauth/access_token", estado: 400, cuerpo: { error: { message: CODE_FALSO } } }]),
    () => crearFetchFalso([R_TOKEN, { contiene: "debug_token", cuerpo: { data: { app_id: "9", is_valid: true } } }]),
    () => rutasFelices(),
  ];
  for (const armar of escenarios) {
    const { impl } = armar();
    const r = await manejarConfirm(base({ fetchImpl: impl }));
    const s = JSON.stringify(r);
    for (const secreto of [CODE_FALSO, TOKEN_FALSO, APP_SECRET_FALSO, BEARER_FALSO]) {
      assert.ok(!s.includes(secreto), `filtró ${secreto.slice(0, 10)}…`);
    }
  }
});

test("una respuesta de Graph corrupta no se refleja: META_ERROR / INTERCAMBIO_FALLIDO", async () => {
  const { impl } = crearFetchFalso([{ contiene: "oauth/access_token", crudo: "<html>502 Bad Gateway</html>" }]);
  const r = await manejarConfirm(base({ fetchImpl: impl }));
  assert.ok(!r.ok);
  if (!r.ok) assert.ok(["META_ERROR", "INTERCAMBIO_FALLIDO"].includes(r.cuerpo.codigo));
  assert.ok(!JSON.stringify(r).includes("Bad Gateway"));
});

// ═════════════════════════════════════════════════════════════════════════
// Fuente — invariantes de código
// ═════════════════════════════════════════════════════════════════════════

test("confirm.ts no escribe en consola (el logging se decide en el borde)", () => {
  const fuente = readFileSync(resolve(process.cwd(), "src/lib/meta/confirm.ts"), "utf8");
  const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/console\./.test(codigo));
});

test("confirm.ts no menciona /register en el código", () => {
  const fuente = readFileSync(resolve(process.cwd(), "src/lib/meta/confirm.ts"), "utf8");
  const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/\/register/.test(codigo));
});

test("el route handler /confirm: runtime nodejs, force-dynamic, kill switch 404, cabeceras", () => {
  const fuente = readFileSync(
    resolve(process.cwd(), "src/app/api/meta/coexistence/confirm/route.ts"),
    "utf8"
  );
  assert.match(fuente, /export const runtime = "nodejs"/);
  assert.match(fuente, /export const dynamic = "force-dynamic"/);
  assert.match(fuente, /coexistenceHabilitado\(\)/);
  assert.match(fuente, /status: 404/);
  assert.match(fuente, /"Cache-Control": "no-store/);
  assert.match(fuente, /"X-Robots-Tag": "noindex/);
});

test("el route handler /confirm nunca registra el code, el token ni el body", () => {
  const fuente = readFileSync(
    resolve(process.cwd(), "src/app/api/meta/coexistence/confirm/route.ts"),
    "utf8"
  );
  const logs = fuente.match(/console\.(info|error|warn|log)\([\s\S]*?\);/g) ?? [];
  assert.ok(logs.length > 0);
  for (const linea of logs) {
    assert.ok(!/\bcode\b/.test(linea));
    assert.ok(!/\btoken\b/i.test(linea));
    assert.ok(!/\bcrudo\b|\bbody\b/i.test(linea));
    assert.ok(!/authToken|Authorization/i.test(linea));
  }
});

test("el endpoint /exchange retirado ya no existe", () => {
  let existe = true;
  try {
    readFileSync(resolve(process.cwd(), "src/app/api/meta/coexistence/exchange/route.ts"), "utf8");
  } catch {
    existe = false;
  }
  assert.equal(existe, false, "el endpoint /exchange debía retirarse (su núcleo vive en confirm.ts)");
});
