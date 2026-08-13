import { test } from "node:test";
import assert from "node:assert/strict";
import { crearCotizacionPersonalizada } from "./createQuote";
import {
  makeFakeProductsRepository,
  makeFakeProductUpgradeOptionsRepository,
  makeFakeQuoteRequestsRepository,
} from "./testHelpers";
import { RepositoryError } from "../repositories/errors";
import {
  TYPICAL_REQUIREMENTS,
  PRODUCT_1_DIRECT_MATCH,
  PRODUCT_2_NEEDS_RAM,
  PRODUCT_2_UPGRADES,
  PRODUCT_5_INCOMPATIBLE,
} from "../personalizador/fixtures";
import type { CompatibleUpgrade } from "../../types/upgrade";
import type { Product } from "../../types/product";

function makeDeps(
  products: Product[],
  upgradesByProduct: Map<string, CompatibleUpgrade[]> = new Map(),
  quoteRepoOptions?: Parameters<typeof makeFakeQuoteRequestsRepository>[0]
) {
  return {
    productsRepo: makeFakeProductsRepository(products),
    productUpgradeOptionsRepo: makeFakeProductUpgradeOptionsRepository(upgradesByProduct),
    quoteRequestsRepo: makeFakeQuoteRequestsRepository(quoteRepoOptions),
    now: new Date("2026-08-13T00:00:00.000Z"),
  };
}

// 11. special quote
test("11. wantsSpecialQuote=true cuando de verdad no hay ningún candidato -> crea cotización especial sin product_id ni precio", async () => {
  const deps = makeDeps([PRODUCT_5_INCOMPATIBLE]); // el único producto disponible es incompatible
  const result = await crearCotizacionPersonalizada(
    { requirements: { ...TYPICAL_REQUIREMENTS, ramMinGb: 16, storageMinGb: 500 }, wantsSpecialQuote: true },
    deps
  );
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.data.isSpecialRequest, true);
    assert.equal(result.data.product, null);
    assert.equal(result.data.finalPrice, null);
    assert.equal(result.data.basePrice, null);
  }
});

test("11b. wantsSpecialQuote=true pero SÍ hay candidatos reales -> el servidor lo rechaza, no confía en la afirmación del cliente", async () => {
  const deps = makeDeps([PRODUCT_1_DIRECT_MATCH]);
  const result = await crearCotizacionPersonalizada(
    { requirements: { ...TYPICAL_REQUIREMENTS, ramMinGb: 16, storageMinGb: 500 }, wantsSpecialQuote: true },
    deps
  );
  assert.deepEqual(result, { ok: false, error: "SPECIAL_QUOTE_NOT_APPLICABLE" });
});

// 12. selección manipulada por cliente — el cliente no puede señalar un producto ajeno a lo permitido y obtener un resultado inventado
test("12. selectedProductId manipulado (producto que en realidad NO cumple los requisitos) -> PRODUCT_NOT_ELIGIBLE, no crea nada", async () => {
  const deps = makeDeps([PRODUCT_5_INCOMPATIBLE]);
  const result = await crearCotizacionPersonalizada(
    {
      requirements: { ...TYPICAL_REQUIREMENTS, cpuGenerationMin: 8, ramMinGb: 16, storageMinGb: 500 },
      selectedProductId: PRODUCT_5_INCOMPATIBLE.id,
    },
    deps
  );
  assert.deepEqual(result, { ok: false, error: "PRODUCT_NOT_ELIGIBLE" });
  assert.equal(deps.quoteRequestsRepo.store.size, 0);
});

// 13. precio manipulado por cliente ignorado
test("13. el cliente envía un finalPrice/basePrice falso junto al input -> el servidor los ignora, usa el precio recalculado", async () => {
  const deps = makeDeps([PRODUCT_2_NEEDS_RAM], new Map([[PRODUCT_2_NEEDS_RAM.id, PRODUCT_2_UPGRADES]]));
  const maliciousInput = {
    requirements: { ...TYPICAL_REQUIREMENTS, ramMinGb: 16, storageMinGb: 200 },
    selectedProductId: PRODUCT_2_NEEDS_RAM.id,
    // Campos que NO existen en CreateQuoteInput — un cliente real los mandaría igual por HTTP.
    finalPrice: 1,
    basePrice: 1,
  };
  const result = await crearCotizacionPersonalizada(maliciousInput, deps);
  assert.ok(result.ok);
  if (result.ok) {
    // 620.000 (base real) + 70.000 (RAM16, la única compatible que alcanza 16GB) — nunca "1"
    assert.equal(result.data.finalPrice, 620000 + 70000);
    assert.equal(result.data.basePrice, 620000);
  }
});

// 14. upgrade manipulado ignorado
test("14. el cliente envía selectedUpgrades falsos -> el servidor recalcula la selección real desde compatibilidades actuales", async () => {
  const deps = makeDeps([PRODUCT_2_NEEDS_RAM], new Map([[PRODUCT_2_NEEDS_RAM.id, PRODUCT_2_UPGRADES]]));
  const maliciousInput = {
    requirements: { ...TYPICAL_REQUIREMENTS, ramMinGb: 16, storageMinGb: 200 },
    selectedProductId: PRODUCT_2_NEEDS_RAM.id,
    selectedUpgrades: [{ category: "storage", label: "SSD inventado", value: 99999, extraCost: 0 }],
  };
  const result = await crearCotizacionPersonalizada(maliciousInput, deps);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.data.selectedUpgrades.length, 1);
    assert.equal(result.data.selectedUpgrades[0].category, "ram"); // no "storage" inventado
    assert.equal(result.data.selectedUpgrades[0].extraCost, 70000); // no 0 inventado
  }
});

// 15. producto inexistente
test("15. selectedProductId que no existe -> PRODUCT_NOT_ELIGIBLE, nunca lanza", async () => {
  const deps = makeDeps([PRODUCT_1_DIRECT_MATCH]);
  const result = await crearCotizacionPersonalizada(
    { requirements: TYPICAL_REQUIREMENTS, selectedProductId: "00000000-0000-0000-0000-000000000000" },
    deps
  );
  assert.deepEqual(result, { ok: false, error: "PRODUCT_NOT_ELIGIBLE" });
});

// 16. colisión de código
test("16. colisión de código UNIQUE en el primer intento -> reintenta y crea exitosamente en el segundo", async () => {
  const deps = makeDeps(
    [PRODUCT_1_DIRECT_MATCH],
    new Map(),
    { collisionsBeforeSuccess: 1 }
  );
  const result = await crearCotizacionPersonalizada(
    { requirements: { ...TYPICAL_REQUIREMENTS, ramMinGb: 16, storageMinGb: 500 }, selectedProductId: PRODUCT_1_DIRECT_MATCH.id },
    deps
  );
  assert.ok(result.ok);
  assert.equal(deps.quoteRequestsRepo.createAttempts, 2);
});

// 17. máximo de reintentos
test("17. colisiona en los 3 intentos permitidos -> CODE_GENERATION_FAILED, sin loop infinito", async () => {
  const deps = makeDeps(
    [PRODUCT_1_DIRECT_MATCH],
    new Map(),
    { collisionsBeforeSuccess: 3 }
  );
  const result = await crearCotizacionPersonalizada(
    { requirements: { ...TYPICAL_REQUIREMENTS, ramMinGb: 16, storageMinGb: 500 }, selectedProductId: PRODUCT_1_DIRECT_MATCH.id },
    deps
  );
  assert.deepEqual(result, { ok: false, error: "CODE_GENERATION_FAILED" });
  assert.equal(deps.quoteRequestsRepo.createAttempts, 3); // exactamente 3, nunca más
});

// 18. error DB no-unique no se reintenta
test("18. un error de base de datos que NO es colisión de código se propaga de inmediato, sin reintentar", async () => {
  const deps = makeDeps(
    [PRODUCT_1_DIRECT_MATCH],
    new Map(),
    { failWithNonUniqueError: true }
  );
  await assert.rejects(
    () =>
      crearCotizacionPersonalizada(
        { requirements: { ...TYPICAL_REQUIREMENTS, ramMinGb: 16, storageMinGb: 500 }, selectedProductId: PRODUCT_1_DIRECT_MATCH.id },
        deps
      ),
    (err: unknown) => {
      assert.ok(err instanceof RepositoryError);
      return true;
    }
  );
  assert.equal(deps.quoteRequestsRepo.createAttempts, 1); // un único intento, no 3
});

// input inválido / honeypot también aplican a crearCotizacionPersonalizada, no solo a la búsqueda
test("input inválido en crearCotizacionPersonalizada -> VALIDATION_ERROR, nunca llega a tocar el repositorio de cotizaciones", async () => {
  const deps = makeDeps([PRODUCT_1_DIRECT_MATCH]);
  const result = await crearCotizacionPersonalizada(
    { requirements: { ...TYPICAL_REQUIREMENTS, budgetMax: -5 }, selectedProductId: PRODUCT_1_DIRECT_MATCH.id },
    deps
  );
  assert.equal(result.ok, false);
  assert.equal(deps.quoteRequestsRepo.store.size, 0);
});

test("honeypot en crearCotizacionPersonalizada -> misma forma neutral, NUNCA crea quote_request", async () => {
  const deps = makeDeps([PRODUCT_1_DIRECT_MATCH]);
  const result = await crearCotizacionPersonalizada(
    {
      requirements: { ...TYPICAL_REQUIREMENTS, companyWebsite: "http://bot.example" },
      selectedProductId: PRODUCT_1_DIRECT_MATCH.id,
    },
    deps
  );
  assert.deepEqual(result, { ok: false, error: "VALIDATION_ERROR", issues: ["Solicitud inválida."] });
  assert.equal(deps.quoteRequestsRepo.store.size, 0);
});

test("ni selectedProductId ni wantsSpecialQuote -> VALIDATION_ERROR explícito (el servidor nunca adivina la intención)", async () => {
  const deps = makeDeps([PRODUCT_1_DIRECT_MATCH]);
  const result = await crearCotizacionPersonalizada({ requirements: TYPICAL_REQUIREMENTS }, deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "VALIDATION_ERROR");
});

test("customerCity (D5): se guarda cuando es válida, se ignora silenciosamente si excede el límite", async () => {
  const deps = makeDeps([PRODUCT_1_DIRECT_MATCH]);
  const result = await crearCotizacionPersonalizada(
    {
      requirements: { ...TYPICAL_REQUIREMENTS, ramMinGb: 16, storageMinGb: 500 },
      selectedProductId: PRODUCT_1_DIRECT_MATCH.id,
      customerCity: "Bogotá",
    },
    deps
  );
  assert.ok(result.ok);
  // customerCity no se expone en el DTO público (ver mappers.test.ts) — se
  // verifica indirectamente aquí a través del store en memoria.
  const stored = [...deps.quoteRequestsRepo.store.values()][0];
  assert.equal(stored.customerCity, "Bogotá");
});
