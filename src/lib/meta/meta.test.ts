/**
 * Tests del callback de Meta. COMPLETAMENTE herméticos: ni una llamada real a
 * Graph. El `fetch` se inyecta siempre y registra qué URLs se pidieron, que es
 * lo que permite afirmar que `subscribed_apps` NUNCA se invoca.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { configMeta, onboardingHabilitado, ErrorConfigMeta } from "./env";
import type { ConfigMeta } from "./env";
import { crearState, validarState, TTL_STATE_MS } from "./state";
import {
  enmascararTelefono,
  nombresDeParametros,
  normalizarE164,
  sanearCodigoInterno,
  sanearIdentificador,
} from "./redactar";
import { manejarCallback, aParametrosDeResultado, NUMERO_OBJETIVO_E164 } from "./callback";

// ─────────────────────────────────────────────────────────────
// Valores de prueba. Ninguno es real.
// ─────────────────────────────────────────────────────────────
const APP_SECRET_FALSO = "secreto-de-prueba-no-real-0123456789";
const CODE_FALSO = "AQD-code-de-prueba-que-no-sirve-para-nada";
const TOKEN_FALSO = "EAA-token-de-prueba-que-no-sirve-para-nada";

const CONFIG: ConfigMeta = {
  appId: "1234567890",
  appSecret: APP_SECRET_FALSO,
  graphVersion: "v25.0",
  redirectUri: "https://sistetecni.com/api/meta/whatsapp/callback",
};

const URL_CALLBACK = "https://sistetecni.com/api/meta/whatsapp/callback";

/** `fetch` falso que registra las URLs pedidas y responde por patrón. */
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

const RESPUESTA_TOKEN = { contiene: "oauth/access_token", cuerpo: { access_token: TOKEN_FALSO, token_type: "bearer" } };
const RESPUESTA_DEBUG = {
  contiene: "debug_token",
  cuerpo: { data: { app_id: "1234567890", is_valid: true, scopes: ["whatsapp_business_management", "whatsapp_business_messaging"] } },
};
const numeros = (lista: Array<{ id: string; display: string }>) => ({
  contiene: "phone_numbers",
  cuerpo: { data: lista.map((n) => ({ id: n.id, display_phone_number: n.display, verified_name: "SISTETECNI" })) },
});

// ─────────────────────────────────────────────────────────────
// W4 — Kill switch
// ─────────────────────────────────────────────────────────────

test("kill switch: solo la cadena exacta 'true' habilita el onboarding", () => {
  assert.equal(onboardingHabilitado({ META_ONBOARDING_ENABLED: "true" }), true);
  for (const valor of ["TRUE", "True", "1", "yes", "", " true", undefined]) {
    assert.equal(onboardingHabilitado({ META_ONBOARDING_ENABLED: valor }), false, `valor: ${String(valor)}`);
  }
  assert.equal(onboardingHabilitado({}), false);
});

test("el route handler devuelve 404 cuando el kill switch está apagado", () => {
  const fuente = readFileSync(
    resolve(process.cwd(), "src/app/api/meta/whatsapp/callback/route.ts"),
    "utf8"
  );
  assert.match(fuente, /if \(!onboardingHabilitado\(\)\)/);
  assert.match(fuente, /status: 404/);
});

test("el route handler fija Cache-Control: no-store y X-Robots-Tag", () => {
  const fuente = readFileSync(
    resolve(process.cwd(), "src/app/api/meta/whatsapp/callback/route.ts"),
    "utf8"
  );
  assert.match(fuente, /"Cache-Control": "no-store/);
  assert.match(fuente, /"X-Robots-Tag": "noindex/);
  assert.match(fuente, /export const runtime = "nodejs"/);
  assert.match(fuente, /export const dynamic = "force-dynamic"/);
});

// ─────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────

test("configMeta exige variables y nombra la que falta, sin imprimir valores", () => {
  assert.throws(
    () => configMeta({ META_OAUTH_REDIRECT_URI: URL_CALLBACK, META_APP_SECRET: APP_SECRET_FALSO }),
    (err: unknown) => {
      assert.ok(err instanceof ErrorConfigMeta);
      assert.match(err.message, /META_APP_ID/);
      assert.ok(!err.message.includes(APP_SECRET_FALSO), "el mensaje no puede llevar el secreto");
      return true;
    }
  );
});

test("configMeta rechaza redirect URI no https y versiones de Graph inválidas", () => {
  const base = { META_APP_ID: "1", META_APP_SECRET: APP_SECRET_FALSO };
  assert.throws(() => configMeta({ ...base, META_OAUTH_REDIRECT_URI: "http://sistetecni.com/x" }), /https/);
  assert.throws(
    () => configMeta({ ...base, META_OAUTH_REDIRECT_URI: "https://user:pass@sistetecni.com/x" }),
    /credenciales/
  );
  // http SOLO contra loopback, para poder probar en local sin certificado.
  assert.equal(
    configMeta({ ...base, META_OAUTH_REDIRECT_URI: "http://127.0.0.1:3000/cb" }).redirectUri,
    "http://127.0.0.1:3000/cb"
  );
  assert.throws(
    () => configMeta({ ...base, META_OAUTH_REDIRECT_URI: URL_CALLBACK, META_GRAPH_API_VERSION: "25" }),
    /META_GRAPH_API_VERSION/
  );
});

// ─────────────────────────────────────────────────────────────
// Saneado
// ─────────────────────────────────────────────────────────────

test("nombresDeParametros devuelve NOMBRES y nunca valores", () => {
  const params = new URLSearchParams();
  params.set("code", CODE_FALSO);
  params.set("state", "abc");
  params.set("inventado", "valor-secreto");
  params.set("otro_mas", "x");

  const nombres = nombresDeParametros(params);
  assert.deepEqual(nombres, ["code", "state", "otros:2"]);

  const serializado = JSON.stringify(nombres);
  assert.ok(!serializado.includes(CODE_FALSO));
  assert.ok(!serializado.includes("valor-secreto"));
});

test("enmascararTelefono conserva indicativo y dos últimos dígitos", () => {
  assert.equal(enmascararTelefono("+57 311 5996339"), `+57${"·".repeat(8)}39`);
  assert.equal(enmascararTelefono("123"), null);
  assert.equal(normalizarE164("+57 311 599 6339"), NUMERO_OBJETIVO_E164);
});

test("los saneadores acotan códigos e identificadores", () => {
  assert.equal(sanearCodigoInterno("<script>alert(1)</script>"), "SCRIPTALERT1SCRIPT");
  assert.equal(sanearCodigoInterno(""), "DESCONOCIDO");
  assert.equal(sanearIdentificador("123456789012345"), "123456789012345");
  assert.equal(sanearIdentificador("../../etc/passwd"), null);
  assert.equal(sanearIdentificador(""), null);
});

// ─────────────────────────────────────────────────────────────
// state (oportunista)
// ─────────────────────────────────────────────────────────────

test("state: emitido por nosotros se verifica; manipulado o caducado no", () => {
  const ahora = 1_800_000_000_000;
  const valor = crearState(APP_SECRET_FALSO, ahora);

  assert.equal(validarState(valor, APP_SECRET_FALSO, { ahora }), "verificado");
  assert.equal(validarState(valor, APP_SECRET_FALSO, { ahora: ahora + TTL_STATE_MS + 1 }), "no_verificable");
  assert.equal(validarState(`${valor}x`, APP_SECRET_FALSO, { ahora }), "no_verificable");
  assert.equal(validarState("valor-ajeno", APP_SECRET_FALSO, { ahora }), "no_verificable");
  assert.equal(validarState(null, APP_SECRET_FALSO, { ahora }), "ausente");
});

// ─────────────────────────────────────────────────────────────
// W6 — Callback defensivo
// ─────────────────────────────────────────────────────────────

test("callback sin parámetros: observación SIN_CODE y ninguna llamada a Meta", async () => {
  const { impl, pedidas } = crearFetchFalso([]);
  const r = await manejarCallback(new URL(URL_CALLBACK), { config: CONFIG, fetchImpl: impl });

  assert.equal(r.estado, "observacion");
  assert.equal(r.codigo, "SIN_CODE");
  assert.equal(r.state, "ausente");
  assert.equal(r.coincide, "DESCONOCIDO");
  assert.deepEqual(pedidas, [], "sin code no se llama a Meta");
});

test("callback con error de Meta: se mapea a código interno, sin texto crudo", async () => {
  const { impl } = crearFetchFalso([]);

  const cancelado = await manejarCallback(
    new URL(`${URL_CALLBACK}?error=access_denied&error_description=El+usuario+cancel%C3%B3`),
    { config: CONFIG, fetchImpl: impl }
  );
  assert.equal(cancelado.estado, "error");
  assert.equal(cancelado.codigo, "ERROR_META_CANCELADO");
  assert.ok(!JSON.stringify(cancelado).includes("cancel"), "no se refleja el texto de Meta");
});

test("callback con error desconocido cae en ERROR_META_OTRO", async () => {
  const { impl } = crearFetchFalso([]);
  const r = await manejarCallback(new URL(`${URL_CALLBACK}?error=algo_nuevo`), {
    config: CONFIG,
    fetchImpl: impl,
  });
  assert.equal(r.codigo, "ERROR_META_OTRO");
});

test("code falso: Graph responde 400 y se reporta INTERCAMBIO_FALLIDO", async () => {
  const { impl, pedidas } = crearFetchFalso([
    { contiene: "oauth/access_token", estado: 400, cuerpo: { error: { message: "Invalid verification code format.", code: 100 } } },
  ]);

  const r = await manejarCallback(new URL(`${URL_CALLBACK}?code=${CODE_FALSO}`), {
    config: CONFIG,
    fetchImpl: impl,
  });

  assert.equal(r.estado, "error");
  assert.equal(r.codigo, "INTERCAMBIO_FALLIDO");
  assert.ok(!JSON.stringify(r).includes("Invalid verification code"), "no se refleja el mensaje de Meta");
  assert.equal(pedidas.length, 1, "no se sigue llamando tras el fallo");
});

test("timeout de Meta se reporta como TIMEOUT_META", async () => {
  const abort = new Error("aborted");
  abort.name = "AbortError";
  const { impl } = crearFetchFalso([{ contiene: "oauth/access_token", lanza: abort }]);

  const r = await manejarCallback(new URL(`${URL_CALLBACK}?code=${CODE_FALSO}`), {
    config: CONFIG,
    fetchImpl: impl,
  });
  assert.equal(r.codigo, "TIMEOUT_META");
});

test("respuesta de Graph corrupta se reporta como RESPUESTA_INVALIDA", async () => {
  const { impl } = crearFetchFalso([{ contiene: "oauth/access_token", crudo: "<html>502 Bad Gateway</html>" }]);

  const r = await manejarCallback(new URL(`${URL_CALLBACK}?code=${CODE_FALSO}`), {
    config: CONFIG,
    fetchImpl: impl,
  });
  assert.equal(r.codigo, "RESPUESTA_INVALIDA");
});

test("token sin access_token en la respuesta también es RESPUESTA_INVALIDA", async () => {
  const { impl } = crearFetchFalso([{ contiene: "oauth/access_token", cuerpo: { algo: "otra cosa" } }]);
  const r = await manejarCallback(new URL(`${URL_CALLBACK}?code=${CODE_FALSO}`), {
    config: CONFIG,
    fetchImpl: impl,
  });
  assert.equal(r.codigo, "RESPUESTA_INVALIDA");
});

// ─────────────────────────────────────────────────────────────
// W8 — Identidad del número
// ─────────────────────────────────────────────────────────────

test("número objetivo presente en la WABA: COINCIDE", async () => {
  const { impl, pedidas } = crearFetchFalso([
    RESPUESTA_TOKEN,
    RESPUESTA_DEBUG,
    numeros([{ id: "555000111", display: "+57 311 5996339" }]),
  ]);

  const r = await manejarCallback(
    new URL(`${URL_CALLBACK}?code=${CODE_FALSO}&waba_id=998877665544&phone_number_id=555000111`),
    { config: CONFIG, fetchImpl: impl }
  );

  assert.equal(r.estado, "ok");
  assert.equal(r.codigo, "OK");
  assert.equal(r.coincide, "COINCIDE");
  assert.equal(r.wabaId, "998877665544");
  assert.equal(r.phoneNumberId, "555000111");
  assert.equal(r.telefonoEnmascarado, `+57${"·".repeat(8)}39`);
  assert.equal(r.tokenValido, true);
  assert.deepEqual(r.scopes, ["whatsapp_business_management", "whatsapp_business_messaging"]);
  assert.ok(!pedidas.some((u) => u.includes("subscribed_apps")));
});

test("otro número en la WABA: NO_COINCIDE", async () => {
  const { impl } = crearFetchFalso([
    RESPUESTA_TOKEN,
    RESPUESTA_DEBUG,
    numeros([{ id: "555000222", display: "+57 320 2210698" }]),
  ]);

  const r = await manejarCallback(
    new URL(`${URL_CALLBACK}?code=${CODE_FALSO}&waba_id=998877665544`),
    { config: CONFIG, fetchImpl: impl }
  );

  assert.equal(r.estado, "ok");
  assert.equal(r.coincide, "NO_COINCIDE");
});

test("sin waba_id no se puede verificar: OK_SIN_WABA_ID y coincidencia desconocida", async () => {
  const { impl, pedidas } = crearFetchFalso([RESPUESTA_TOKEN, RESPUESTA_DEBUG]);

  const r = await manejarCallback(new URL(`${URL_CALLBACK}?code=${CODE_FALSO}`), {
    config: CONFIG,
    fetchImpl: impl,
  });

  assert.equal(r.codigo, "OK_SIN_WABA_ID");
  assert.equal(r.coincide, "DESCONOCIDO");
  assert.ok(!pedidas.some((u) => u.includes("phone_numbers")));
});

// ─────────────────────────────────────────────────────────────
// W9 — subscribed_apps NUNCA se llama
// ─────────────────────────────────────────────────────────────

test("ningún camino del callback llama a subscribed_apps", async () => {
  const escenarios: string[] = [
    "",
    "?error=access_denied",
    `?code=${CODE_FALSO}`,
    `?code=${CODE_FALSO}&waba_id=998877665544`,
    `?code=${CODE_FALSO}&waba_id=998877665544&phone_number_id=555000111`,
  ];

  for (const query of escenarios) {
    const { impl, pedidas } = crearFetchFalso([
      RESPUESTA_TOKEN,
      RESPUESTA_DEBUG,
      numeros([{ id: "555000111", display: "+57 311 5996339" }]),
    ]);
    await manejarCallback(new URL(`${URL_CALLBACK}${query}`), { config: CONFIG, fetchImpl: impl });
    assert.ok(
      !pedidas.some((u) => u.includes("subscribed_apps")),
      `subscribed_apps invocado en el escenario "${query}"`
    );
  }
});

// ─────────────────────────────────────────────────────────────
// W7 — El token, el code y el secreto no salen a ningún sitio
// ─────────────────────────────────────────────────────────────

test("el resultado y sus parámetros de URL no contienen code, token ni App Secret", async () => {
  const { impl } = crearFetchFalso([
    RESPUESTA_TOKEN,
    RESPUESTA_DEBUG,
    numeros([{ id: "555000111", display: "+57 311 5996339" }]),
  ]);

  const r = await manejarCallback(
    new URL(`${URL_CALLBACK}?code=${CODE_FALSO}&waba_id=998877665544`),
    { config: CONFIG, fetchImpl: impl }
  );

  const serializado = JSON.stringify(r);
  const enUrl = aParametrosDeResultado(r).toString();

  for (const secreto of [CODE_FALSO, TOKEN_FALSO, APP_SECRET_FALSO]) {
    assert.ok(!serializado.includes(secreto), `el resultado filtra ${secreto.slice(0, 8)}…`);
    assert.ok(!enUrl.includes(secreto), `la URL de resultado filtra ${secreto.slice(0, 8)}…`);
    assert.ok(!enUrl.includes(encodeURIComponent(secreto)), "tampoco codificado");
  }
});

test("los módulos que ven el token no escriben en consola", () => {
  for (const archivo of ["graph.ts", "callback.ts", "state.ts", "redactar.ts"]) {
    const fuente = readFileSync(resolve(process.cwd(), "src/lib/meta", archivo), "utf8");
    const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/console\./.test(sinComentarios), `${archivo} escribe en consola`);
  }
});

test("el route handler nunca registra request.url ni la query string", () => {
  const fuente = readFileSync(
    resolve(process.cwd(), "src/app/api/meta/whatsapp/callback/route.ts"),
    "utf8"
  );
  const logs = fuente.match(/console\.(info|error|warn|log)\([\s\S]*?\);/g) ?? [];
  assert.ok(logs.length > 0, "se espera al menos un log de diagnóstico");
  for (const linea of logs) {
    assert.ok(!linea.includes("request.url"), "un log incluye request.url");
    assert.ok(!/\burl\b/.test(linea), "un log incluye la url");
    assert.ok(!linea.includes("searchParams"), "un log incluye la query string");
    assert.ok(!/\bcode\b/.test(linea), "un log menciona el code");
    assert.ok(!/token/i.test(linea) || /tokenValido/.test(linea), "un log menciona el token");
  }
});

// ─────────────────────────────────────────────────────────────
// Aislamiento: nada de Supabase en esta superficie
// ─────────────────────────────────────────────────────────────

test("ni el callback ni la página de resultado tocan Supabase", () => {
  const archivos = [
    "src/lib/meta/env.ts",
    "src/lib/meta/graph.ts",
    "src/lib/meta/callback.ts",
    "src/lib/meta/state.ts",
    "src/lib/meta/redactar.ts",
    "src/app/api/meta/whatsapp/callback/route.ts",
    "src/app/meta/whatsapp/onboarding/resultado/page.tsx",
  ];
  for (const archivo of archivos) {
    const fuente = readFileSync(resolve(process.cwd(), archivo), "utf8");
    // Se mira el CÓDIGO, no los comentarios: una referencia en prosa a
    // src/supabase/admin.ts (de donde viene el patrón de guard) es legítima;
    // un import o una variable SUPABASE_* no lo serían.
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/from\s+["'][^"']*supabase/i.test(codigo), `${archivo} importa Supabase`);
    assert.ok(!/SUPABASE_/.test(codigo), `${archivo} usa una variable de Supabase`);
    assert.ok(!/NEXT_PUBLIC_META/.test(fuente), `${archivo} expone una META_* al cliente`);
  }
});

test("la página de resultado no imprime token, code ni query original", () => {
  const fuente = readFileSync(
    resolve(process.cwd(), "src/app/meta/whatsapp/onboarding/resultado/page.tsx"),
    "utf8"
  );
  assert.ok(!/sp\.code/.test(fuente));
  assert.ok(!/searchParams\)\}/.test(fuente), "no se vuelca la query entera");
  assert.match(fuente, /robots: \{ index: false/);
  assert.match(fuente, /notFound\(\)/);
});
