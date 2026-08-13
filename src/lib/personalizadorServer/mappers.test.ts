import { test } from "node:test";
import assert from "node:assert/strict";
import { toPublicQuoteDTO } from "./mappers";
import type { QuoteRequest } from "../../types/quote";

const FULL_QUOTE: QuoteRequest = {
  id: "11111111-1111-1111-1111-111111111111",
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
  requestedConfig: { budgetMax: 800000, ramMinGb: 16, storageMinGb: 200, gpu: "cualquiera", touch: "cualquiera" },
  selectedUpgradesSnapshot: [{ category: "ram", label: "16 GB RAM", value: 16, extra_cost: 70000 }],
  estimatedPrice: 690000,
  customerBudget: 800000,
  customerCity: "Bogotá",
  customerNote: null,
  status: "nueva",
  channel: "web_personalizador",
  createdAt: new Date("2026-08-13T00:00:00.000Z"),
  updatedAt: new Date("2026-08-13T00:00:00.000Z"),
  expiresAt: new Date("2026-08-20T00:00:00.000Z"),
};

// 19. DTO público no filtra customer_city/campos internos
test("19. toPublicQuoteDTO NUNCA incluye id, productId, customerCity, customerNote, channel ni updatedAt", () => {
  const dto = toPublicQuoteDTO(FULL_QUOTE);
  const keys = Object.keys(dto);

  for (const forbidden of ["id", "productId", "customerCity", "customerNote", "channel", "updatedAt", "customerBudget"]) {
    assert.ok(!keys.includes(forbidden), `el DTO público no debe incluir "${forbidden}"`);
  }
  // Y JSON.stringify tampoco puede filtrarlos por alguna referencia oculta.
  const serialized = JSON.stringify(dto);
  assert.ok(!serialized.includes("Bogotá"));
  assert.ok(!serialized.includes(FULL_QUOTE.id));
});

test("toPublicQuoteDTO expone exactamente los campos públicos esperados, con fechas ISO", () => {
  const dto = toPublicQuoteDTO(FULL_QUOTE);
  assert.equal(dto.code, "COT-ABCDEFGHJ");
  assert.equal(dto.status, "nueva");
  assert.equal(dto.isSpecialRequest, false);
  assert.equal(dto.basePrice, 620000);
  assert.equal(dto.finalPrice, 690000);
  assert.equal(dto.product?.title, "[SEED] Lenovo ThinkPad T480");
  assert.equal(dto.selectedUpgrades.length, 1);
  assert.equal(dto.createdAt, "2026-08-13T00:00:00.000Z");
  assert.equal(dto.expiresAt, "2026-08-20T00:00:00.000Z");
});

test("toPublicQuoteDTO: cotización especial -> product null, precios null", () => {
  const special: QuoteRequest = {
    ...FULL_QUOTE,
    productId: null,
    isSpecialRequest: true,
    basePriceSnapshot: null,
    baseConfigSnapshot: null,
    estimatedPrice: null,
    selectedUpgradesSnapshot: [],
  };
  const dto = toPublicQuoteDTO(special);
  assert.equal(dto.product, null);
  assert.equal(dto.basePrice, null);
  assert.equal(dto.finalPrice, null);
  assert.equal(dto.isSpecialRequest, true);
});
