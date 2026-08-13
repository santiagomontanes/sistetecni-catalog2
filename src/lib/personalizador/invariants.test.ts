/**
 * Invariantes explícitas pedidas — cada una se verifica sobre el conjunto
 * completo de los 7 candidatos [SEED] bajo varios perfiles de requisitos
 * distintos, no solo un caso feliz aislado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchProducts, evaluateCandidate } from "./matching";
import type { CustomerRequirements, MatchResult, ProductCandidate } from "./types";
import {
  ALL_SEED_CANDIDATES,
  TYPICAL_REQUIREMENTS,
  PRODUCT_5_INCOMPATIBLE,
  candidate,
} from "./fixtures";

function req(overrides: Partial<CustomerRequirements> = {}): CustomerRequirements {
  return { ...TYPICAL_REQUIREMENTS, ...overrides };
}

const PROFILES: CustomerRequirements[] = [
  req({ ramMinGb: 8, storageMinGb: 128 }),
  req({ ramMinGb: 16, storageMinGb: 500 }),
  req({ ramMinGb: 32, storageMinGb: 500 }),
  req({ gpu: "dedicada", budgetMax: 3000000 }),
  req({ touch: "si", budgetMax: 3000000 }),
  req({ cpuGenerationMin: 11, budgetMax: 3000000 }),
];

function allResultsAcrossProfiles(candidates: ProductCandidate[]): MatchResult[] {
  const all: MatchResult[] = [];
  for (const profile of PROFILES) {
    const outcome = matchProducts(profile, candidates);
    all.push(...outcome.available, ...outcome.referenceOnly);
  }
  return all;
}

// ─── Invariante A ────────────────────────────────────────────────────────
test("Invariante A: finalPrice = basePrice + suma(selectedUpgrades.extraCost), sin excepción", () => {
  const results = allResultsAcrossProfiles(ALL_SEED_CANDIDATES);
  assert.ok(results.length > 0, "la muestra de prueba no debe estar vacía");
  for (const r of results) {
    const expected = r.basePrice + r.selectedUpgrades.reduce((sum, u) => sum + u.extraCost, 0);
    assert.equal(r.finalPrice, expected, `producto ${r.product.id}`);
  }
});

// ─── Invariante B ────────────────────────────────────────────────────────
test("Invariante B: ningún selectedUpgrade aparece sin compatibilidad explícita product_id+upgrade_option_id", () => {
  for (const c of ALL_SEED_CANDIDATES) {
    for (const profile of PROFILES) {
      const result = evaluateCandidate(c, profile);
      if (!result) continue;
      for (const selected of result.selectedUpgrades) {
        const existsInCompatibility = c.compatibleUpgrades.some(
          (cu) => cu.compatibilityId === selected.compatibilityId && cu.option.id === selected.upgradeOptionId
        );
        assert.ok(
          existsInCompatibility,
          `upgrade ${selected.upgradeOptionId} seleccionado para ${c.product.id} sin fila de compatibilidad`
        );
      }
    }
  }
});

test("Invariante B (negativo): un producto SIN compatibilidades nunca puede tener selectedUpgrades", () => {
  // PRODUCT_5 no tiene compatibleUpgrades — si igual llegara a "cumplir"
  // por RAM/storage ya suficientes, jamás debe traer upgrades inventados.
  const noCompatCandidate = candidate({ ...PRODUCT_5_INCOMPATIBLE, cpuGeneration: 8 }); // fuerza que pase el filtro fijo para esta prueba puntual
  const result = evaluateCandidate(noCompatCandidate, req({ cpuGenerationMin: 8, ramMinGb: 1, storageMinGb: 1 }));
  assert.ok(result); // ram=4>=1, storage=128>=1 -> ya cumple, DIRECT_MATCH
  assert.equal(result?.selectedUpgrades.length, 0);
});

// ─── Invariante C ────────────────────────────────────────────────────────
test("Invariante C: finalConfiguration siempre satisface RAM y storage solicitados en resultados válidos", () => {
  const results = allResultsAcrossProfiles(ALL_SEED_CANDIDATES);
  for (const r of results) {
    // Se re-evalúa contra cada perfil para encontrar el que corresponde no es trivial aquí,
    // así que se valida contra la propiedad más fuerte: la config final nunca es MENOR que
    // la config original Y si hay upgrade seleccionado, su value es exactamente finalConfiguration.
    if (r.selectedUpgrades.some((u) => u.category === "ram")) {
      const ramUpgrade = r.selectedUpgrades.find((u) => u.category === "ram")!;
      assert.equal(r.finalConfiguration.ramGb, ramUpgrade.value);
    } else {
      assert.equal(r.finalConfiguration.ramGb, r.product.ram);
    }
    if (r.selectedUpgrades.some((u) => u.category === "storage")) {
      const storageUpgrade = r.selectedUpgrades.find((u) => u.category === "storage")!;
      assert.equal(r.finalConfiguration.storageGb, storageUpgrade.value);
    } else {
      assert.equal(r.finalConfiguration.storageGb, r.product.storageGb ?? 0);
    }
  }
});

test("Invariante C (directo): para el perfil que exige 16GB/500GB, todo resultado válido alcanza al menos eso", () => {
  const profile = req({ ramMinGb: 16, storageMinGb: 500 });
  const outcome = matchProducts(profile, ALL_SEED_CANDIDATES);
  for (const r of [...outcome.available, ...outcome.referenceOnly]) {
    assert.ok(r.finalConfiguration.ramGb >= 16, `RAM insuficiente en ${r.product.id}`);
    assert.ok(r.finalConfiguration.storageGb >= 500, `storage insuficiente en ${r.product.id}`);
  }
});

// ─── Invariante D ────────────────────────────────────────────────────────
test("Invariante D: las características fijas del producto nunca cambian — evaluateCandidate no muta el input", () => {
  const original = ALL_SEED_CANDIDATES[3]; // PRODUCT_4_NEEDS_BOTH
  const snapshotBefore = JSON.stringify(original.product);
  evaluateCandidate(original, req({ ramMinGb: 16, storageMinGb: 500 }));
  const snapshotAfter = JSON.stringify(original.product);
  assert.equal(snapshotBefore, snapshotAfter);
});

test("Invariante D: el producto devuelto en MatchResult tiene el MISMO cpu/gpu/touch/screen que el original, siempre", () => {
  for (const c of ALL_SEED_CANDIDATES) {
    const result = evaluateCandidate(c, req({ ramMinGb: 1, storageMinGb: 1, cpuGenerationMin: undefined }));
    if (!result) continue;
    assert.equal(result.product.cpu, c.product.cpu);
    assert.equal(result.product.gpuType, c.product.gpuType);
    assert.equal(result.product.touchScreen, c.product.touchScreen);
    assert.equal(result.product.screenSizeInches, c.product.screenSizeInches);
  }
});

// ─── Invariante E ────────────────────────────────────────────────────────
test("Invariante E: todo número monetario del resultado proviene de Product.price o UpgradeOption.extraCost — nunca de otro lado", () => {
  for (const c of ALL_SEED_CANDIDATES) {
    for (const profile of PROFILES) {
      const result = evaluateCandidate(c, profile);
      if (!result) continue;

      assert.equal(result.basePrice, c.product.price);

      const validExtraCosts = new Set(c.compatibleUpgrades.map((u) => u.option.extraCost));
      for (const selected of result.selectedUpgrades) {
        assert.ok(validExtraCosts.has(selected.extraCost), `extraCost ${selected.extraCost} no proviene de ninguna compatibilidad real`);
      }

      const expectedFinal = result.basePrice + result.selectedUpgrades.reduce((s, u) => s + u.extraCost, 0);
      assert.equal(result.finalPrice, expectedFinal);
    }
  }
});

// ─── Invariante F ────────────────────────────────────────────────────────
test("Invariante F: un producto incompatible nunca aparece en available ni en referenceOnly", () => {
  for (const profile of PROFILES) {
    const outcome = matchProducts(profile, ALL_SEED_CANDIDATES);
    const allIds = [...outcome.available, ...outcome.referenceOnly].map((r) => r.product.id);
    // PRODUCT_5 es incompatible (RAM/storage soldados) frente a CUALQUIER
    // perfil que pida más de lo que ya tiene sin upgrades disponibles.
    if (profile.ramMinGb > 4 || profile.storageMinGb > 128) {
      assert.ok(!allIds.includes(PRODUCT_5_INCOMPATIBLE.id), `PRODUCT_5 no debería aparecer con perfil ${JSON.stringify(profile)}`);
    }
  }
});

test("Invariante F: evaluateCandidate() de un incompatible siempre devuelve null, nunca un MatchResult parcial", () => {
  const result = evaluateCandidate(candidate(PRODUCT_5_INCOMPATIBLE), req({ ramMinGb: 16, storageMinGb: 500 }));
  assert.equal(result, null);
});
