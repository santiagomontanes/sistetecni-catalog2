import { test } from "node:test";
import assert from "node:assert/strict";
import { buscarOpcionesPersonalizadas } from "./searchOptions";
import { makeFakeProductsRepository, makeFakeProductUpgradeOptionsRepository } from "./testHelpers";
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
} from "../personalizador/fixtures";
import { HONEYPOT_FIELD_NAME } from "../personalizador";
import type { CompatibleUpgrade } from "../../types/upgrade";
import type { Product } from "../../types/product";

function deps(products: Product[], upgradesByProduct: Map<string, CompatibleUpgrade[]> = new Map()) {
  return {
    productsRepo: makeFakeProductsRepository(products),
    productUpgradeOptionsRepo: makeFakeProductUpgradeOptionsRepository(upgradesByProduct),
  };
}

const ALL_PRODUCTS = ALL_SEED_CANDIDATES.map((c) => c.product);
const ALL_UPGRADES_MAP = new Map(
  ALL_SEED_CANDIDATES.filter((c) => c.compatibleUpgrades.length > 0).map((c) => [
    c.product.id,
    c.compatibleUpgrades,
  ])
);

// 1. input válido
test("1. input válido -> ok:true con las 3 listas esperadas", async () => {
  const result = await buscarOpcionesPersonalizadas(TYPICAL_REQUIREMENTS, deps(ALL_PRODUCTS, ALL_UPGRADES_MAP));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(Array.isArray(result.data.available));
    assert.ok(Array.isArray(result.data.referenceOnly));
    assert.equal(typeof result.data.specialQuoteRequired, "boolean");
  }
});

// 2. input inválido
test("2. input inválido (budgetMax negativo) -> VALIDATION_ERROR con issues no vacíos", async () => {
  const result = await buscarOpcionesPersonalizadas(
    { ...TYPICAL_REQUIREMENTS, budgetMax: -1 },
    deps(ALL_PRODUCTS, ALL_UPGRADES_MAP)
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "VALIDATION_ERROR");
    assert.ok(result.issues.length > 0);
  }
});

// 3. honeypot
test("3. honeypot relleno -> misma forma EXACTA que un input inválido genérico, nunca consulta repositorios", async () => {
  let repoCalled = false;
  const products = makeFakeProductsRepository(ALL_PRODUCTS);
  const trackedProductsRepo = {
    ...products,
    findPersonalizerCandidates: async () => {
      repoCalled = true;
      return products.findPersonalizerCandidates();
    },
  };

  const result = await buscarOpcionesPersonalizadas(
    { ...TYPICAL_REQUIREMENTS, [HONEYPOT_FIELD_NAME]: "http://bot.example" },
    { productsRepo: trackedProductsRepo, productUpgradeOptionsRepo: makeFakeProductUpgradeOptionsRepository(ALL_UPGRADES_MAP) }
  );

  assert.deepEqual(result, { ok: false, error: "VALIDATION_ERROR", issues: ["Solicitud inválida."] });
  assert.equal(repoCalled, false);

  // Misma forma que un input genuinamente inválido — indistinguible desde afuera.
  const invalid = await buscarOpcionesPersonalizadas(
    { ...TYPICAL_REQUIREMENTS, budgetMax: -1 },
    deps(ALL_PRODUCTS, ALL_UPGRADES_MAP)
  );
  if (!invalid.ok && !result.ok) {
    assert.equal(invalid.error, result.error);
  }
});

// 4. búsqueda con match directo
test("4. producto que ya cumple -> DIRECT_MATCH en available", async () => {
  const result = await buscarOpcionesPersonalizadas(
    { ...TYPICAL_REQUIREMENTS, ramMinGb: 16, storageMinGb: 500 },
    deps([PRODUCT_1_DIRECT_MATCH])
  );
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.data.available.length, 1);
    assert.equal(result.data.available[0].classification, "DIRECT_MATCH");
    assert.equal(result.data.available[0].productId, PRODUCT_1_DIRECT_MATCH.id);
  }
});

// 5. búsqueda con RAM
test("5. producto que solo necesita RAM -> RAM_UPGRADE_MATCH", async () => {
  const result = await buscarOpcionesPersonalizadas(
    { ...TYPICAL_REQUIREMENTS, ramMinGb: 16, storageMinGb: 200 },
    deps([PRODUCT_2_NEEDS_RAM], new Map([[PRODUCT_2_NEEDS_RAM.id, PRODUCT_2_UPGRADES]]))
  );
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.data.available[0].classification, "RAM_UPGRADE_MATCH");
    assert.equal(result.data.available[0].selectedUpgrades.length, 1);
    assert.equal(result.data.available[0].selectedUpgrades[0].category, "ram");
  }
});

// 6. SSD
test("6. producto que solo necesita almacenamiento -> STORAGE_UPGRADE_MATCH", async () => {
  const result = await buscarOpcionesPersonalizadas(
    { ...TYPICAL_REQUIREMENTS, ramMinGb: 8, storageMinGb: 256 },
    deps([PRODUCT_3_NEEDS_STORAGE], new Map([[PRODUCT_3_NEEDS_STORAGE.id, PRODUCT_3_UPGRADES]]))
  );
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.data.available[0].classification, "STORAGE_UPGRADE_MATCH");
  }
});

// 7. RAM+SSD
test("7. producto que necesita ambos -> RAM_AND_STORAGE_UPGRADE_MATCH, precio = base + ambos extraCost", async () => {
  const result = await buscarOpcionesPersonalizadas(
    { ...TYPICAL_REQUIREMENTS, ramMinGb: 16, storageMinGb: 500 },
    deps([PRODUCT_4_NEEDS_BOTH], new Map([[PRODUCT_4_NEEDS_BOTH.id, PRODUCT_4_UPGRADES]]))
  );
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.data.available[0].classification, "RAM_AND_STORAGE_UPGRADE_MATCH");
    assert.equal(result.data.available[0].finalPrice, 640000 + 70000 + 90000);
    assert.equal(result.data.available[0].selectedUpgrades.length, 2);
  }
});

// 8. incompatible
test("8. producto incompatible -> no aparece ni en available ni en referenceOnly", async () => {
  const result = await buscarOpcionesPersonalizadas(
    { ...TYPICAL_REQUIREMENTS, ramMinGb: 16, storageMinGb: 256 },
    deps([PRODUCT_5_INCOMPATIBLE])
  );
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.data.available.length, 0);
    assert.equal(result.data.referenceOnly.length, 0);
    assert.equal(result.data.specialQuoteRequired, true);
  }
});

// 9. agotado
test("9. producto agotado pero compatible -> referenceOnly, nunca available", async () => {
  const result = await buscarOpcionesPersonalizadas(
    { ...TYPICAL_REQUIREMENTS, ramMinGb: 16, storageMinGb: 500 },
    deps([PRODUCT_6_OUT_OF_STOCK])
  );
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.data.available.length, 0);
    assert.equal(result.data.referenceOnly.length, 1);
    assert.equal(result.data.referenceOnly[0].stockStatus, "OUT_OF_STOCK");
  }
});

// 10. sobre presupuesto
test("10. producto sobre presupuesto (más allá de tolerancia) -> sigue en available, budgetStatus OVER_BUDGET", async () => {
  const result = await buscarOpcionesPersonalizadas(
    { ...TYPICAL_REQUIREMENTS, budgetMax: 800000, ramMinGb: 16, storageMinGb: 500 },
    deps([PRODUCT_7_OVER_BUDGET])
  );
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.data.available.length, 1);
    assert.equal(result.data.available[0].budgetStatus, "OVER_BUDGET");
  }
});
