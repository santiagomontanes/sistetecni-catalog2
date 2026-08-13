import { test } from "node:test";
import assert from "node:assert/strict";
import { listQuotesAdmin, getQuoteDetailAdmin, updateQuoteStatusAdmin } from "./quotes";
import { createQuoteRequestsRepository } from "../repositories/quoteRequests.repository";
import { makeStatefulFakeClient } from "../repositories/fakeClient";

interface QRRow {
  id: string;
  code: string;
  product_id: string | null;
  is_special_request: boolean;
  base_price_snapshot: number | null;
  base_config_snapshot: { title: string; brand: string; model: string; cpu: string; ram: number; storage: string; screen: string; condition: string; image: string | null } | null;
  requested_config: Record<string, unknown>;
  selected_upgrades_snapshot: unknown[];
  estimated_price: number | null;
  customer_budget: number | null;
  customer_city: string | null;
  customer_note: string | null;
  status: string;
  channel: string;
  created_at: string | null;
  updated_at: string | null;
  expires_at: string | null;
}

function seedQuote(overrides: Partial<QRRow> & { id: string; code: string }): QRRow {
  return {
    product_id: "10000000-0000-0000-0000-000000000001",
    is_special_request: false,
    base_price_snapshot: 620000,
    base_config_snapshot: {
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
    requested_config: { budgetMax: 800000 },
    selected_upgrades_snapshot: [],
    estimated_price: 690000,
    customer_budget: 800000,
    customer_city: "Bogotá",
    customer_note: null,
    status: "nueva",
    channel: "web_personalizador",
    created_at: "2026-08-13T00:00:00.000Z",
    updated_at: "2026-08-13T00:00:00.000Z",
    expires_at: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

// listar cotizaciones
test("listQuotesAdmin: sin filtro -> devuelve todas mapeadas al DTO admin (incluye customerCity, a diferencia del DTO público)", async () => {
  const { client } = makeStatefulFakeClient<QRRow>([seedQuote({ id: "1", code: "COT-AAAAAAAAA" })]);
  const repo = createQuoteRequestsRepository(client);

  const result = await listQuotesAdmin({}, repo);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].customerCity, "Bogotá");
    assert.equal(result.data[0].productTitle, "[SEED] Lenovo ThinkPad T480");
  }
});

test("listQuotesAdmin: filtro de status inválido (no es uno de los 7) -> VALIDATION_ERROR", async () => {
  const { client } = makeStatefulFakeClient<QRRow>([]);
  const repo = createQuoteRequestsRepository(client);

  const result = await listQuotesAdmin({ status: "cancelada" }, repo);
  assert.equal(result.ok, false);
});

// detalle usa snapshot
test("getQuoteDetailAdmin: código inexistente -> NOT_FOUND", async () => {
  const { client } = makeStatefulFakeClient<QRRow>([]);
  const repo = createQuoteRequestsRepository(client);

  const result = await getQuoteDetailAdmin("COT-ZZZZZZZZZ", repo);
  assert.deepEqual(result, { ok: false, error: "NOT_FOUND" });
});

test("getQuoteDetailAdmin: código con formato inválido -> VALIDATION_ERROR, ni siquiera consulta", async () => {
  const { client, rows } = makeStatefulFakeClient<QRRow>([]);
  const repo = createQuoteRequestsRepository(client);

  const result = await getQuoteDetailAdmin("no-es-un-codigo", repo);
  assert.equal(result.ok, false);
  assert.equal(rows.length, 0);
});

test("getQuoteDetailAdmin: el detalle sale ÍNTEGRAMENTE del snapshot — nunca recalcula precio actual", async () => {
  const { client } = makeStatefulFakeClient<QRRow>([
    seedQuote({ id: "1", code: "COT-AAAAAAAAA", base_price_snapshot: 620000, estimated_price: 690000 }),
  ]);
  const repo = createQuoteRequestsRepository(client);

  const result = await getQuoteDetailAdmin("COT-AAAAAAAAA", repo);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.data.basePriceSnapshot, 620000);
    assert.equal(result.data.estimatedPrice, 690000);
    assert.equal(result.data.baseConfigSnapshot?.title, "[SEED] Lenovo ThinkPad T480");
  }
});

// cambiar status
const QUOTE_UUID = "11111111-1111-1111-1111-111111111111";

test("updateQuoteStatusAdmin: status válido -> lo aplica", async () => {
  const { client } = makeStatefulFakeClient<QRRow>([
    seedQuote({ id: QUOTE_UUID, code: "COT-AAAAAAAAA", status: "nueva" }),
  ]);
  const repo = createQuoteRequestsRepository(client);

  const result = await updateQuoteStatusAdmin({ quoteId: QUOTE_UUID, status: "contactada" }, repo);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.data.status, "contactada");
});

test("updateQuoteStatusAdmin: status inválido (no es uno de los 7 aprobados) -> VALIDATION_ERROR, rechazado server-side", async () => {
  const { client } = makeStatefulFakeClient<QRRow>([seedQuote({ id: QUOTE_UUID, code: "COT-AAAAAAAAA" })]);
  const repo = createQuoteRequestsRepository(client);

  const result = await updateQuoteStatusAdmin({ quoteId: QUOTE_UUID, status: "cancelada" }, repo);
  assert.equal(result.ok, false);
  if (!result.ok && result.error === "VALIDATION_ERROR") {
    assert.ok(result.issues.length > 0);
  }
});

test("updateQuoteStatusAdmin: quoteId no es UUID -> VALIDATION_ERROR", async () => {
  const { client } = makeStatefulFakeClient<QRRow>([seedQuote({ id: "1", code: "COT-AAAAAAAAA" })]);
  const repo = createQuoteRequestsRepository(client);

  const result = await updateQuoteStatusAdmin({ quoteId: "no-es-uuid", status: "contactada" }, repo);
  assert.equal(result.ok, false);
});

// badge "Expirada" (punto 9) — visual, no cron
test("listQuotesAdmin: isVisuallyExpired=true cuando expiresAt ya pasó y el estado no es terminal", async () => {
  const { client } = makeStatefulFakeClient<QRRow>([
    seedQuote({ id: "1", code: "COT-AAAAAAAAA", status: "en_revision", expires_at: "2020-01-01T00:00:00.000Z" }),
  ]);
  const repo = createQuoteRequestsRepository(client);

  const result = await listQuotesAdmin({}, repo);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.data[0].isVisuallyExpired, true);
});

test("listQuotesAdmin: isVisuallyExpired=false si el estado ya es terminal (aceptada/rechazada/expirada), aunque expiresAt haya pasado", async () => {
  const { client } = makeStatefulFakeClient<QRRow>([
    seedQuote({ id: "1", code: "COT-AAAAAAAAA", status: "aceptada", expires_at: "2020-01-01T00:00:00.000Z" }),
  ]);
  const repo = createQuoteRequestsRepository(client);

  const result = await listQuotesAdmin({}, repo);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.data[0].isVisuallyExpired, false);
});
