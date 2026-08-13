import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuoteSnapshotFromMatch, buildSpecialQuoteSnapshot } from "./snapshot";
import { evaluateCandidate } from "./matching";
import type { CustomerRequirements } from "./types";
import { PRODUCT_4_NEEDS_BOTH, PRODUCT_4_UPGRADES, TYPICAL_REQUIREMENTS, candidate } from "./fixtures";

function req(overrides: Partial<CustomerRequirements> = {}): CustomerRequirements {
  return { ...TYPICAL_REQUIREMENTS, ...overrides };
}

// Escenario 26: snapshot conserva precios originales
test("26. el snapshot congela precio base y de upgrades — mutar el producto/upgrade original después NO afecta el snapshot ya construido", () => {
  const mutableProduct = { ...PRODUCT_4_NEEDS_BOTH };
  const mutableUpgrades = PRODUCT_4_UPGRADES.map((u) => ({ ...u, option: { ...u.option } }));

  const result = evaluateCandidate(candidate(mutableProduct, mutableUpgrades), req({ ramMinGb: 16, storageMinGb: 500 }));
  assert.ok(result);

  const now = new Date("2026-08-13T00:00:00Z");
  const snapshot = buildQuoteSnapshotFromMatch(result, req({ ramMinGb: 16, storageMinGb: 500 }), "COT-ABCDEF", now);

  // "mañana cambia el precio del producto" — el snapshot ya construido no debe verse afectado
  mutableProduct.price = 999999999;
  mutableUpgrades[0].option.extraCost = 1;

  assert.equal(snapshot.basePriceSnapshot, 640000);
  assert.equal(snapshot.estimatedPrice, 800000); // 640.000 + RAM16(+70.000) + SSD500(+90.000)
  assert.equal(snapshot.selectedUpgradesSnapshot[0].extra_cost !== 1, true);
});

test("snapshot: contiene código, producto, configuración base y final, y requisitos originales", () => {
  const result = evaluateCandidate(candidate(PRODUCT_4_NEEDS_BOTH, PRODUCT_4_UPGRADES), req({ ramMinGb: 16, storageMinGb: 500 }));
  assert.ok(result);
  const snapshot = buildQuoteSnapshotFromMatch(result, req({ ramMinGb: 16, storageMinGb: 500 }), "COT-ABCDEF");

  assert.equal(snapshot.code, "COT-ABCDEF");
  assert.equal(snapshot.productId, PRODUCT_4_NEEDS_BOTH.id);
  assert.equal(snapshot.isSpecialRequest, false);
  assert.equal(snapshot.baseConfigSnapshot?.title, PRODUCT_4_NEEDS_BOTH.title);
  assert.equal(snapshot.selectedUpgradesSnapshot.length, 2);
  assert.equal((snapshot.requestedConfig as unknown as CustomerRequirements).ramMinGb, 16);
});

test("snapshot: expiresAt queda fijado a 7 días desde `now` inyectado (D6)", () => {
  const result = evaluateCandidate(candidate(PRODUCT_4_NEEDS_BOTH, PRODUCT_4_UPGRADES), req({ ramMinGb: 16, storageMinGb: 500 }));
  assert.ok(result);
  const now = new Date("2026-08-13T00:00:00.000Z");
  const snapshot = buildQuoteSnapshotFromMatch(result, req({ ramMinGb: 16, storageMinGb: 500 }), "COT-ABCDEF", now);

  const diffDays = (snapshot.expiresAt!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  assert.equal(diffDays, 7);
});

test("cotización especial: snapshot sin producto, sin precios, con requisitos originales conservados", () => {
  const now = new Date("2026-08-13T00:00:00.000Z");
  const snapshot = buildSpecialQuoteSnapshot(req({ ramMinGb: 64, storageMinGb: 4000 }), "COT-ZZZZZZ", now);

  assert.equal(snapshot.productId, null);
  assert.equal(snapshot.isSpecialRequest, true);
  assert.equal(snapshot.basePriceSnapshot, null);
  assert.equal(snapshot.estimatedPrice, null);
  assert.equal((snapshot.requestedConfig as unknown as CustomerRequirements).ramMinGb, 64);
});
