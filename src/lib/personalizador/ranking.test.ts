import { test } from "node:test";
import assert from "node:assert/strict";
import { rankResults } from "./ranking";
import { matchProducts } from "./matching";
import type { CustomerRequirements } from "./types";
import {
  ALL_SEED_CANDIDATES,
  TYPICAL_REQUIREMENTS,
  PRODUCT_1_DIRECT_MATCH,
  candidate,
} from "./fixtures";

function req(overrides: Partial<CustomerRequirements> = {}): CustomerRequirements {
  return { ...TYPICAL_REQUIREMENTS, ...overrides };
}

test("ranking de los 7 escenarios [SEED]: DIRECT_MATCH dentro de presupuesto va primero, sobre-presupuesto al final de los disponibles", () => {
  const outcome = matchProducts(req({ budgetMax: 800000, ramMinGb: 16, storageMinGb: 500 }), ALL_SEED_CANDIDATES);
  const ranked = rankResults(outcome.available);

  assert.equal(ranked[0].product.id, PRODUCT_1_DIRECT_MATCH.id); // tier 1
  assert.equal(ranked[ranked.length - 1].budgetStatus, "OVER_BUDGET"); // el XPS premium, tier 5
});

// Escenario 24: orden estable ante mismos precios
test("24. orden estable: dos resultados con mismo tier y mismo precio final se desempatan por menos upgrades, luego por product.id", () => {
  const base = { ...PRODUCT_1_DIRECT_MATCH, price: 700000 };
  const productB = { ...base, id: "zzzzzzzz-0000-0000-0000-000000000000" };
  const productA = { ...base, id: "aaaaaaaa-0000-0000-0000-000000000000" };

  const outcome = matchProducts(req({ ramMinGb: 16, storageMinGb: 500 }), [
    candidate(productB),
    candidate(productA),
  ]);
  const ranked = rankResults(outcome.available);

  assert.equal(ranked[0].product.id, "aaaaaaaa-0000-0000-0000-000000000000");
  assert.equal(ranked[1].product.id, "zzzzzzzz-0000-0000-0000-000000000000");
});

test("24b. el resultado es reproducible sin importar el orden de entrada (mismo ranking siempre)", () => {
  const outcome1 = rankResults(
    matchProducts(req({ budgetMax: 800000, ramMinGb: 16, storageMinGb: 500 }), ALL_SEED_CANDIDATES).available
  );
  const reversedCandidates = [...ALL_SEED_CANDIDATES].reverse();
  const outcome2 = rankResults(
    matchProducts(req({ budgetMax: 800000, ramMinGb: 16, storageMinGb: 500 }), reversedCandidates).available
  );

  assert.deepEqual(
    outcome1.map((r) => r.product.id),
    outcome2.map((r) => r.product.id)
  );
});

test("rankResults nunca muta el array de entrada", () => {
  const outcome = matchProducts(req({ ramMinGb: 16, storageMinGb: 500 }), ALL_SEED_CANDIDATES);
  const original = [...outcome.available];
  rankResults(outcome.available);
  assert.deepEqual(
    outcome.available.map((r) => r.product.id),
    original.map((r) => r.product.id)
  );
});
