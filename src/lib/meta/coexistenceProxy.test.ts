import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  cabecerasCoexistence,
  COEXISTENCE_PROXY_HEADER,
  destinoCoexistence,
  esRutaCoexistence,
  NO_STORE_HEADERS,
  validarProxySecretCoexistence,
  validarUpstreamCoexistence,
} from "./coexistenceProxy";

const UPSTREAM = "https://coexistence.sistetecni-api.uk";
const SECRET = "s".repeat(64);

describe("proxy Vercel → backend Coexistence", () => {
  test("solo acepta la frontera exacta del path", () => {
    assert.equal(esRutaCoexistence("/meta/coexistence"), true);
    assert.equal(esRutaCoexistence("/meta/coexistence/api/code"), true);
    for (const ruta of ["/", "/productos", "/meta/coexistence-malicioso", "/meta", "/api/x"]) {
      assert.equal(esRutaCoexistence(ruta), false, ruta);
    }
  });

  test("upstream es HTTPS externo exacto, sin credenciales ni superficie SSRF", () => {
    assert.equal(validarUpstreamCoexistence(UPSTREAM).origin, UPSTREAM);
    for (const valor of [
      "http://coexistence.sistetecni-api.uk",
      "https://localhost",
      "https://127.0.0.1",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "https://user:pass@example.com",
      "https://*.sistetecni-api.uk",
      "https://example.com/ruta",
      "https://example.com#x",
      undefined,
    ]) assert.throws(() => validarUpstreamCoexistence(valor));
  });

  test("preserva path/query sin permitir que controlen el host", () => {
    const destino = destinoCoexistence(
      validarUpstreamCoexistence(UPSTREAM),
      new URL("https://sistetecni.com/meta/coexistence/api/status?q=https://evil.invalid/x")
    );
    assert.equal(destino.origin, UPSTREAM);
    assert.equal(destino.pathname, "/meta/coexistence/api/status");
    assert.equal(destino.search, "?q=https://evil.invalid/x");
    assert.throws(() => destinoCoexistence(
      validarUpstreamCoexistence(UPSTREAM),
      new URL("https://sistetecni.com/productos")
    ));
  });

  test("conserva headers de aplicación y reemplaza cabeceras privadas del cliente", () => {
    const entrada = new Headers({
      "content-type": "application/json",
      cookie: "sid=abc",
      origin: "https://sistetecni.com",
      "user-agent": "test",
      authorization: "Bearer no-reenviar",
      connection: "keep-alive",
      [COEXISTENCE_PROXY_HEADER]: "ataque",
      "cf-access-client-id": "ataque",
      "cf-access-client-secret": "ataque",
    });
    const salida = cabecerasCoexistence(entrada, SECRET);
    assert.equal(salida.get("content-type"), "application/json");
    assert.equal(salida.get("cookie"), "sid=abc");
    assert.equal(salida.get("origin"), "https://sistetecni.com");
    assert.equal(salida.get("user-agent"), "test");
    assert.equal(salida.get("authorization"), null);
    assert.equal(salida.get("connection"), null);
    assert.equal(salida.get("cf-access-client-id"), null);
    assert.equal(salida.get("cf-access-client-secret"), null);
    assert.equal(salida.get(COEXISTENCE_PROXY_HEADER), SECRET);
  });

  test("secret es obligatorio y no aparece en configuración pública", () => {
    assert.equal(validarProxySecretCoexistence(SECRET), SECRET);
    for (const valor of [undefined, "", "corto", "x".repeat(42), `x ${"y".repeat(50)}`]) {
      assert.throws(() => validarProxySecretCoexistence(valor));
    }
    assert.equal(JSON.stringify(NO_STORE_HEADERS).includes(SECRET), false);
  });

  test("todo el espacio de coexistence queda no-store", () => {
    assert.match(NO_STORE_HEADERS["Cache-Control"], /no-store/);
    assert.equal(NO_STORE_HEADERS["CDN-Cache-Control"], "no-store");
    assert.equal(NO_STORE_HEADERS["Vercel-CDN-Cache-Control"], "no-store");
  });
});
