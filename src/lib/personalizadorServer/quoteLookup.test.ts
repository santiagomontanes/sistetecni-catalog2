import { test } from "node:test";
import assert from "node:assert/strict";
import { buscarCotizacionPorCodigo } from "./quoteLookup";
import { makeFakeQuoteRequestsRepository } from "./testHelpers";
import type { QuoteRequest } from "../../types/quote";

function seedQuote(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    id: "id-1",
    code: "COT-ABCDEFGHJ",
    productId: "10000000-0000-0000-0000-000000000001",
    isSpecialRequest: false,
    basePriceSnapshot: 620000,
    baseConfigSnapshot: {
      title: "[SEED] Lenovo ThinkPad T480",
      brand: "Lenovo",
      model: "ThinkPad T480",
      cpu: "Intel Core i5-8250U",
      ram: 8,
      storage: "256 GB SSD",
      screen: '14" FHD',
      condition: "Usado",
      image: null,
    },
    requestedConfig: { budgetMax: 800000 },
    selectedUpgradesSnapshot: [],
    estimatedPrice: 690000,
    customerBudget: 800000,
    customerCity: null,
    customerNote: null,
    status: "nueva",
    channel: "web_personalizador",
    createdAt: new Date("2026-08-13T00:00:00.000Z"),
    updatedAt: new Date("2026-08-13T00:00:00.000Z"),
    expiresAt: new Date("2026-08-20T00:00:00.000Z"),
    ...overrides,
  };
}

// 20. cotización expirada
test("20. cotización con expiresAt en el pasado -> status 'expired', pero SIGUE devolviendo el snapshot (no null)", async () => {
  const repo = makeFakeQuoteRequestsRepository();
  const expired = seedQuote({ expiresAt: new Date("2026-01-01T00:00:00.000Z") });
  repo.store.set(expired.code, expired);

  const result = await buscarCotizacionPorCodigo(expired.code, {
    quoteRequestsRepo: repo,
    now: new Date("2026-08-13T00:00:00.000Z"),
  });
  assert.equal(result.status, "expired");
  if (result.status === "expired") {
    assert.equal(result.data.code, expired.code);
  }
});

test("cotización NO expirada -> status 'ok'", async () => {
  const repo = makeFakeQuoteRequestsRepository();
  const active = seedQuote();
  repo.store.set(active.code, active);

  const result = await buscarCotizacionPorCodigo(active.code, {
    quoteRequestsRepo: repo,
    now: new Date("2026-08-13T00:00:00.000Z"),
  });
  assert.equal(result.status, "ok");
});

test("cotización inexistente -> status 'not_found', sin lanzar", async () => {
  const repo = makeFakeQuoteRequestsRepository();
  const result = await buscarCotizacionPorCodigo("COT-ZZZZZZZZZ", { quoteRequestsRepo: repo });
  assert.equal(result.status, "not_found");
});

// 21. código inválido
test("21. código con formato inválido -> status 'invalid_format', nunca llega a consultar el repositorio", async () => {
  const repo = makeFakeQuoteRequestsRepository();
  let queried = false;
  const trackedRepo = {
    ...repo,
    findByCode: async (code: string) => {
      queried = true;
      return repo.findByCode(code);
    },
  };

  const result = await buscarCotizacionPorCodigo("no-es-un-codigo-valido", { quoteRequestsRepo: trackedRepo });
  assert.equal(result.status, "invalid_format");
  assert.equal(queried, false);
});

test("21b. código con caracteres ambiguos (0/O/1/I) -> también inválido (nunca pertenecieron al alfabeto)", async () => {
  const repo = makeFakeQuoteRequestsRepository();
  const result = await buscarCotizacionPorCodigo("COT-000000000", { quoteRequestsRepo: repo });
  assert.equal(result.status, "invalid_format");
});
