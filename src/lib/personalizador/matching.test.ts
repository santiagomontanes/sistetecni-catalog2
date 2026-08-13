import { test } from "node:test";
import assert from "node:assert/strict";
import { matchProducts, evaluateCandidate } from "./matching";
import type { CustomerRequirements } from "./types";
import {
  ALL_SEED_CANDIDATES,
  TYPICAL_REQUIREMENTS,
  PRODUCT_1_DIRECT_MATCH,
  PRODUCT_2_NEEDS_RAM,
  PRODUCT_2_UPGRADES,
  PRODUCT_3_NEEDS_STORAGE,
  PRODUCT_3_UPGRADES,
  PRODUCT_4_NEEDS_BOTH,
  PRODUCT_4_UPGRADES,
  PRODUCT_5_INCOMPATIBLE,
  PRODUCT_6_OUT_OF_STOCK,
  PRODUCT_7_OVER_BUDGET,
  candidate,
} from "./fixtures";

function req(overrides: Partial<CustomerRequirements> = {}): CustomerRequirements {
  return { ...TYPICAL_REQUIREMENTS, ...overrides };
}

// Los 7 escenarios ficticios, corridos como conjunto completo (igual que en STAGING)
test("los 7 escenarios [SEED]: matchProducts() los clasifica exactamente como se diseñaron", () => {
  const outcome = matchProducts(req({ ramMinGb: 16, storageMinGb: 500 }), ALL_SEED_CANDIDATES);

  const byId = (id: string) =>
    [...outcome.available, ...outcome.referenceOnly].find((r) => r.product.id === id);

  // 1. ya cumple
  const p1 = byId(PRODUCT_1_DIRECT_MATCH.id);
  assert.equal(p1?.classification, "DIRECT_MATCH");
  assert.equal(p1?.selectedUpgrades.length, 0);

  // 5. incompatible -> ni en available ni en referenceOnly
  assert.equal(byId(PRODUCT_5_INCOMPATIBLE.id), undefined);

  // 6. agotado -> va a referenceOnly, no a available
  assert.ok(outcome.referenceOnly.some((r) => r.product.id === PRODUCT_6_OUT_OF_STOCK.id));
  assert.ok(!outcome.available.some((r) => r.product.id === PRODUCT_6_OUT_OF_STOCK.id));

  // 7. sobre presupuesto (muy por encima de la tolerancia) -> sigue disponible, no oculto
  const p7 = byId(PRODUCT_7_OVER_BUDGET.id);
  assert.equal(p7?.budgetStatus, "OVER_BUDGET");
  assert.equal(p7?.stockStatus, "AVAILABLE");
});

// 1. ya cumple
test("1. producto que ya cumple RAM y storage -> DIRECT_MATCH, sin upgrades, mismo precio base", () => {
  const result = evaluateCandidate(candidate(PRODUCT_1_DIRECT_MATCH), req({ ramMinGb: 16, storageMinGb: 500 }));
  assert.equal(result?.classification, "DIRECT_MATCH");
  assert.equal(result?.finalPrice, PRODUCT_1_DIRECT_MATCH.price);
});

// 2. necesita RAM
test("2. producto que solo necesita RAM -> RAM_UPGRADE_MATCH, precio = base + extraCost RAM", () => {
  const result = evaluateCandidate(
    candidate(PRODUCT_2_NEEDS_RAM, PRODUCT_2_UPGRADES),
    req({ ramMinGb: 16, storageMinGb: 200 })
  );
  assert.equal(result?.classification, "RAM_UPGRADE_MATCH");
  assert.equal(result?.selectedUpgrades.length, 1);
  assert.equal(result?.selectedUpgrades[0].category, "ram");
  assert.equal(result?.finalPrice, 620000 + 70000);
});

// 3. necesita SSD
test("3. producto que solo necesita almacenamiento -> STORAGE_UPGRADE_MATCH", () => {
  const result = evaluateCandidate(
    candidate(PRODUCT_3_NEEDS_STORAGE, PRODUCT_3_UPGRADES),
    req({ ramMinGb: 8, storageMinGb: 256 })
  );
  assert.equal(result?.classification, "STORAGE_UPGRADE_MATCH");
  assert.equal(result?.finalPrice, 680000 + 60000);
});

// 4. necesita RAM + SSD
test("4. producto que necesita ambos -> RAM_AND_STORAGE_UPGRADE_MATCH, precio = base + ambos extraCost", () => {
  const result = evaluateCandidate(
    candidate(PRODUCT_4_NEEDS_BOTH, PRODUCT_4_UPGRADES),
    req({ ramMinGb: 16, storageMinGb: 500 })
  );
  assert.equal(result?.classification, "RAM_AND_STORAGE_UPGRADE_MATCH");
  assert.equal(result?.selectedUpgrades.length, 2);
  // PRODUCT_4: base 640.000 + RAM16 (+70.000) + SSD500 (+90.000) = 800.000
  // (el ejemplo del brief usa un T480 con base 620.000, no este producto)
  assert.equal(result?.finalPrice, 640000 + 70000 + 90000);
  assert.equal(result?.finalPrice, 800000);
});

// 5. incompatible
test("5. producto sin ningún upgrade compatible que tampoco cumple ya -> null (incompatible, excluido)", () => {
  const result = evaluateCandidate(candidate(PRODUCT_5_INCOMPATIBLE), req({ ramMinGb: 16, storageMinGb: 256 }));
  assert.equal(result, null);
});

// 6. agotado
test("6. producto agotado que sí cumple los requisitos -> stockStatus OUT_OF_STOCK, no se descarta", () => {
  const result = evaluateCandidate(candidate(PRODUCT_6_OUT_OF_STOCK), req({ ramMinGb: 16, storageMinGb: 500 }));
  assert.ok(result);
  assert.equal(result.stockStatus, "OUT_OF_STOCK");
});

// 7. sobre presupuesto
test("7. producto que cumple pero excede la tolerancia de presupuesto -> OVER_BUDGET, sigue presente", () => {
  const result = evaluateCandidate(
    candidate(PRODUCT_7_OVER_BUDGET),
    req({ budgetMax: 800000, ramMinGb: 16, storageMinGb: 500 })
  );
  assert.ok(result);
  assert.equal(result.budgetStatus, "OVER_BUDGET");
});

// 8. presupuesto exactamente igual al precio final
test("8. presupuesto exactamente igual al precio final -> WITHIN_BUDGET (frontera inclusiva)", () => {
  const result = evaluateCandidate(candidate(PRODUCT_1_DIRECT_MATCH), req({ budgetMax: 750000, ramMinGb: 16, storageMinGb: 500 }));
  assert.equal(result?.finalPrice, 750000);
  assert.equal(result?.budgetStatus, "WITHIN_BUDGET");
});

// 11. RAM ya superior a la solicitada
test("11. RAM del producto ya superior a la solicitada -> RAM_ALREADY_SUFFICIENT, sin upgrade de RAM", () => {
  const result = evaluateCandidate(candidate(PRODUCT_1_DIRECT_MATCH), req({ ramMinGb: 8, storageMinGb: 500 }));
  assert.ok(result?.reasons.includes("RAM_ALREADY_SUFFICIENT"));
  assert.ok(!result?.selectedUpgrades.some((u) => u.category === "ram"));
});

// 12. storage ya superior
test("12. almacenamiento del producto ya superior al solicitado -> STORAGE_ALREADY_SUFFICIENT", () => {
  const result = evaluateCandidate(candidate(PRODUCT_1_DIRECT_MATCH), req({ ramMinGb: 16, storageMinGb: 256 }));
  assert.ok(result?.reasons.includes("STORAGE_ALREADY_SUFFICIENT"));
  assert.ok(!result?.selectedUpgrades.some((u) => u.category === "storage"));
});

// 18. producto sin cpu_generation cuando el cliente exige generación
test("18. producto sin cpu_generation confirmada + cliente exige generación mínima -> incompatible, nunca se asume", () => {
  const p = { ...PRODUCT_1_DIRECT_MATCH, cpuGeneration: null };
  const result = evaluateCandidate(candidate(p), req({ cpuGenerationMin: 8, ramMinGb: 16, storageMinGb: 500 }));
  assert.equal(result, null);
});

test("18b. generación insuficiente (confirmada pero baja) -> incompatible", () => {
  const p = { ...PRODUCT_1_DIRECT_MATCH, cpuGeneration: 6 };
  const result = evaluateCandidate(candidate(p), req({ cpuGenerationMin: 8, ramMinGb: 16, storageMinGb: 500 }));
  assert.equal(result, null);
});

// 19. GPU dedicada requerida vs integrada
test("19. cliente exige GPU dedicada, producto tiene integrada -> incompatible (nunca 'upgrade de GPU')", () => {
  const result = evaluateCandidate(
    candidate(PRODUCT_1_DIRECT_MATCH), // gpuType: integrada
    req({ gpu: "dedicada", ramMinGb: 16, storageMinGb: 500 })
  );
  assert.equal(result, null);
});

test("19b. cliente exige GPU dedicada, producto SÍ tiene dedicada -> compatible en esa dimensión", () => {
  const result = evaluateCandidate(
    candidate(PRODUCT_7_OVER_BUDGET), // gpuType: dedicada
    req({ gpu: "dedicada", budgetMax: 3000000, ramMinGb: 16, storageMinGb: 500 })
  );
  assert.ok(result);
  assert.ok(result.reasons.includes("GPU_OK"));
});

// 20. touch requerido vs no touch
test("20. cliente exige touch, producto no tiene -> incompatible", () => {
  const result = evaluateCandidate(
    candidate(PRODUCT_1_DIRECT_MATCH), // touchScreen: false
    req({ touch: "si", ramMinGb: 16, storageMinGb: 500 })
  );
  assert.equal(result, null);
});

test("20b. cliente exige explícitamente SIN touch, producto con touch -> incompatible", () => {
  const result = evaluateCandidate(
    candidate(PRODUCT_7_OVER_BUDGET), // touchScreen: true
    req({ touch: "no", budgetMax: 3000000, ramMinGb: 16, storageMinGb: 500 })
  );
  assert.equal(result, null);
});

// 21. stock 0 no se mezcla con disponibles
test("21. matchProducts() nunca mezcla agotados con disponibles en el mismo array", () => {
  const outcome = matchProducts(req({ ramMinGb: 16, storageMinGb: 500 }), [
    candidate(PRODUCT_1_DIRECT_MATCH),
    candidate(PRODUCT_6_OUT_OF_STOCK),
  ]);
  assert.equal(outcome.available.length, 1);
  assert.equal(outcome.referenceOnly.length, 1);
  assert.equal(outcome.available[0].product.id, PRODUCT_1_DIRECT_MATCH.id);
  assert.equal(outcome.referenceOnly[0].product.id, PRODUCT_6_OUT_OF_STOCK.id);
});

// 22. ningún candidato -> cotización especial
test("22. ningún candidato compatible (ni disponible ni agotado) -> specialQuoteRequired = true", () => {
  const outcome = matchProducts(
    req({ cpuGenerationMin: 99, ramMinGb: 16, storageMinGb: 500 }), // ninguno tiene esa generación
    ALL_SEED_CANDIDATES
  );
  assert.equal(outcome.available.length, 0);
  assert.equal(outcome.referenceOnly.length, 0);
  assert.equal(outcome.specialQuoteRequired, true);
});

test("22b. si hay al menos un candidato agotado compatible, NO es cotización especial", () => {
  const outcome = matchProducts(req({ ramMinGb: 16, storageMinGb: 500 }), [candidate(PRODUCT_6_OUT_OF_STOCK)]);
  assert.equal(outcome.specialQuoteRequired, false);
  assert.equal(outcome.referenceOnly.length, 1);
});
