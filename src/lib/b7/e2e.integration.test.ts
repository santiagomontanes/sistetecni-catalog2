/**
 * Fase 2B/B7 — Suite end-to-end contra STAGING real, NUNCA producción.
 *
 * A diferencia de los tests de integración de B4/B6 (que prueban cada
 * pieza por separado: repos, orquestación admin), este archivo ejercita
 * el pipeline COMPLETO en cada caso: UI-intent (presets de B5) ->
 * Server Actions equivalentes (personalizadorServer, personalizadorAdmin)
 * -> repositorios (B2) -> motor B3 -> Postgres real -> lectura de vuelta.
 * Nada aquí duplica lógica de matching/precio — solo confirma que las
 * piezas ya construidas se conectan correctamente end-to-end.
 *
 * TODO lo que este archivo crea/muta está marcado [TEST-B7] y se limpia
 * por id exacto al final. Nunca se toca ningún producto/upgrade [SEED]
 * existente, ni licenses/license_activations.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createProductsRepository } from "../repositories/products.repository";
import { createProductUpgradeOptionsRepository } from "../repositories/productUpgradeOptions.repository";
import { createUpgradeOptionsRepository } from "../repositories/upgradeOptions.repository";
import { createQuoteRequestsRepository } from "../repositories/quoteRequests.repository";
import { buscarOpcionesPersonalizadas } from "../personalizadorServer/searchOptions";
import { crearCotizacionPersonalizada } from "../personalizadorServer/createQuote";
import { buscarCotizacionPorCodigo } from "../personalizadorServer/quoteLookup";
import { createUpgradeAdmin, updateUpgradeAdmin, toggleUpgradeAdmin } from "../personalizadorAdmin/upgrades";
import { setProductCompatibilityAdmin, copyProductCompatibilityAdmin } from "../personalizadorAdmin/compatibility";
import { listQuotesAdmin, getQuoteDetailAdmin, updateQuoteStatusAdmin } from "../personalizadorAdmin/quotes";
import { buildRequirementsFromAyudame, USE_CASE_OPTIONS } from "../personalizadorUi/presets";
import { HONEYPOT_FIELD_NAME } from "../personalizador/schemas";

const ROOT = resolve(__dirname, "../../..");
const TEST_MARK = "[TEST-B7]";

function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(resolve(ROOT, ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf("=");
    if (sep === -1) continue;
    const key = trimmed.slice(0, sep).trim();
    let value = trimmed.slice(sep + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<{ assertNotProduction: (action: string) => void }>;

let anonClient: SupabaseClient;
let adminClient: SupabaseClient;

const CREATED_QUOTE_IDS: string[] = [];
const CREATED_UPGRADE_IDS: string[] = [];
const CREATED_PRODUCT_IDS: string[] = [];

// IDs reales de los 7 [SEED] (scripts/seed-staging.mjs) — solo LECTURA en este archivo.
const SEED = {
  P1_DIRECT: "10000000-0000-0000-0000-000000000001",
  P2_NEEDS_RAM: "10000000-0000-0000-0000-000000000002",
  P3_NEEDS_STORAGE: "10000000-0000-0000-0000-000000000003",
  P4_NEEDS_BOTH: "10000000-0000-0000-0000-000000000004",
  P5_INCOMPATIBLE: "10000000-0000-0000-0000-000000000005",
  P6_OUT_OF_STOCK: "10000000-0000-0000-0000-000000000006",
  P7_OVER_BUDGET: "10000000-0000-0000-0000-000000000007",
};

before(async () => {
  loadEnvLocal();
  const { assertNotProduction } = await dynamicImport(resolve(ROOT, "src/lib/env/assertNotProduction.mjs"));
  assertNotProduction("b7-e2e-integration-test");

  anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  );
  adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
});

after(async () => {
  for (const id of CREATED_QUOTE_IDS) await adminClient.from("quote_requests").delete().eq("id", id);
  for (const id of CREATED_PRODUCT_IDS) {
    await adminClient.from("product_upgrade_options").delete().eq("product_id", id);
    await adminClient.from("products").delete().eq("id", id);
  }
  for (const id of CREATED_UPGRADE_IDS) {
    await adminClient.from("product_upgrade_options").delete().eq("upgrade_option_id", id);
    await adminClient.from("upgrade_options").delete().eq("id", id);
  }

  const remainingQuotes = await adminClient.from("quote_requests").select("id").ilike("code", "%TESTB7%");
  const remainingUpgrades = await adminClient.from("upgrade_options").select("id").ilike("label", `%${TEST_MARK}%`);
  const remainingProducts = await adminClient.from("products").select("id").ilike("title", `%${TEST_MARK}%`);
  assert.equal((remainingQuotes.data ?? []).length, 0, "quedaron quote_requests TESTB7 sin limpiar");
  assert.equal((remainingUpgrades.data ?? []).length, 0, "quedaron upgrade_options [TEST-B7] sin limpiar");
  assert.equal((remainingProducts.data ?? []).length, 0, "quedaron products [TEST-B7] sin limpiar");
});

function readDeps() {
  return {
    productsRepo: createProductsRepository(anonClient),
    productUpgradeOptionsRepo: createProductUpgradeOptionsRepository(anonClient),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// A. AYÚDAME A ELEGIR — los 7 usos, pipeline completo contra STAGING real
// ═══════════════════════════════════════════════════════════════════════

for (const option of USE_CASE_OPTIONS.filter((o) => o.key !== "otro")) {
  test(`A: "Ayúdame a elegir" — uso "${option.label}" produce un resultado válido contra STAGING real`, async () => {
    const requirements = buildRequirementsFromAyudame(option.key, 900000, "sin_preferencia");
    const result = await buscarOpcionesPersonalizadas(
      { ...requirements, [HONEYPOT_FIELD_NAME]: "" },
      readDeps()
    );
    assert.ok(result.ok, `búsqueda falló para "${option.key}": ${JSON.stringify(result)}`);
    if (!result.ok) return;
    assert.ok(Array.isArray(result.data.available));
    assert.ok(Array.isArray(result.data.referenceOnly));
    assert.equal(typeof result.data.specialQuoteRequired, "boolean");
  });
}

// ═══════════════════════════════════════════════════════════════════════
// B. PERSONALIZAR — los 8 escenarios de clasificación, contra STAGING real
// ═══════════════════════════════════════════════════════════════════════

test("B1: match directo (P1) -> DIRECT_MATCH, sin upgrades, dentro de presupuesto", async () => {
  const result = await buscarOpcionesPersonalizadas(
    { budgetMax: 800000, ramMinGb: 16, storageMinGb: 500, gpu: "cualquiera", touch: "cualquiera", [HONEYPOT_FIELD_NAME]: "" },
    readDeps()
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  const p1 = result.data.available.find((o) => o.productId === SEED.P1_DIRECT);
  assert.ok(p1, "P1 debería estar en available");
  assert.equal(p1?.classification, "DIRECT_MATCH");
  assert.equal(p1?.selectedUpgrades.length, 0);
});

test("B2: necesita RAM (P2) -> RAM_UPGRADE_MATCH", async () => {
  const result = await buscarOpcionesPersonalizadas(
    { budgetMax: 800000, ramMinGb: 16, storageMinGb: 200, gpu: "cualquiera", touch: "cualquiera", [HONEYPOT_FIELD_NAME]: "" },
    readDeps()
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  const p2 = result.data.available.find((o) => o.productId === SEED.P2_NEEDS_RAM);
  assert.ok(p2);
  assert.equal(p2?.classification, "RAM_UPGRADE_MATCH");
});

test("B3: necesita SSD (P3) -> STORAGE_UPGRADE_MATCH", async () => {
  const result = await buscarOpcionesPersonalizadas(
    { budgetMax: 800000, ramMinGb: 8, storageMinGb: 256, gpu: "cualquiera", touch: "cualquiera", [HONEYPOT_FIELD_NAME]: "" },
    readDeps()
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  const p3 = result.data.available.find((o) => o.productId === SEED.P3_NEEDS_STORAGE);
  assert.ok(p3);
  assert.equal(p3?.classification, "STORAGE_UPGRADE_MATCH");
});

test("B4: necesita RAM+SSD (P4) -> RAM_AND_STORAGE_UPGRADE_MATCH, precio final correcto", async () => {
  const result = await buscarOpcionesPersonalizadas(
    { budgetMax: 900000, ramMinGb: 16, storageMinGb: 500, gpu: "cualquiera", touch: "cualquiera", [HONEYPOT_FIELD_NAME]: "" },
    readDeps()
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  const p4 = result.data.available.find((o) => o.productId === SEED.P4_NEEDS_BOTH);
  assert.ok(p4);
  assert.equal(p4?.classification, "RAM_AND_STORAGE_UPGRADE_MATCH");
  assert.equal(p4?.finalPrice, 640000 + 70000 + 90000);
});

test("B5: incompatible (P5, cpu_generation no confirmada + cliente exige generación) -> excluido de ambas listas", async () => {
  const result = await buscarOpcionesPersonalizadas(
    { budgetMax: 800000, ramMinGb: 16, storageMinGb: 500, cpuGenerationMin: 8, gpu: "cualquiera", touch: "cualquiera", [HONEYPOT_FIELD_NAME]: "" },
    readDeps()
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  const inAvailable = result.data.available.some((o) => o.productId === SEED.P5_INCOMPATIBLE);
  const inReference = result.data.referenceOnly.some((o) => o.productId === SEED.P5_INCOMPATIBLE);
  assert.equal(inAvailable, false);
  assert.equal(inReference, false);
});

test("B6: agotado (P6) -> referenceOnly, nunca available", async () => {
  const result = await buscarOpcionesPersonalizadas(
    { budgetMax: 1000000, ramMinGb: 16, storageMinGb: 500, gpu: "cualquiera", touch: "cualquiera", [HONEYPOT_FIELD_NAME]: "" },
    readDeps()
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  const inAvailable = result.data.available.some((o) => o.productId === SEED.P6_OUT_OF_STOCK);
  const p6InReference = result.data.referenceOnly.find((o) => o.productId === SEED.P6_OUT_OF_STOCK);
  assert.equal(inAvailable, false);
  assert.ok(p6InReference);
  assert.equal(p6InReference?.stockStatus, "OUT_OF_STOCK");
});

test("B7: sobre presupuesto (P7) -> disponible pero OVER_BUDGET, nunca oculto", async () => {
  const result = await buscarOpcionesPersonalizadas(
    { budgetMax: 800000, ramMinGb: 16, storageMinGb: 500, gpu: "dedicada", touch: "si", [HONEYPOT_FIELD_NAME]: "" },
    readDeps()
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  const p7 = result.data.available.find((o) => o.productId === SEED.P7_OVER_BUDGET);
  assert.ok(p7);
  assert.equal(p7?.budgetStatus, "OVER_BUDGET");
});

test("B8: special quote (requisitos imposibles) -> specialQuoteRequired=true, listas vacías", async () => {
  const result = await buscarOpcionesPersonalizadas(
    { budgetMax: 800000, ramMinGb: 16, storageMinGb: 500, cpuGenerationMin: 20, gpu: "cualquiera", touch: "cualquiera", [HONEYPOT_FIELD_NAME]: "" },
    readDeps()
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.data.specialQuoteRequired, true);
  assert.equal(result.data.available.length, 0);
  assert.equal(result.data.referenceOnly.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════
// C. COTIZACIÓN — los 6 casos, contra STAGING real
// ═══════════════════════════════════════════════════════════════════════

let normalQuoteCode: string;
let specialQuoteCode: string;

test("C1: crear cotización normal (P1) — real, de extremo a extremo", async () => {
  const result = await crearCotizacionPersonalizada(
    {
      requirements: { budgetMax: 800000, ramMinGb: 16, storageMinGb: 500, gpu: "cualquiera", touch: "cualquiera" },
      selectedProductId: SEED.P1_DIRECT,
      customerCity: TEST_MARK,
    },
    { ...readDeps(), quoteRequestsRepo: createQuoteRequestsRepository(adminClient) }
  );
  assert.ok(result.ok, JSON.stringify(result));
  if (!result.ok) return;
  normalQuoteCode = result.data.code;
  const stored = await createQuoteRequestsRepository(adminClient).findByCode(normalQuoteCode);
  if (stored) CREATED_QUOTE_IDS.push(stored.id);
});

test("C2: crear cotización especial — real, de extremo a extremo", async () => {
  const result = await crearCotizacionPersonalizada(
    {
      requirements: { budgetMax: 800000, ramMinGb: 16, storageMinGb: 500, cpuGenerationMin: 20, gpu: "cualquiera", touch: "cualquiera" },
      wantsSpecialQuote: true,
      customerCity: TEST_MARK,
    },
    { ...readDeps(), quoteRequestsRepo: createQuoteRequestsRepository(adminClient) }
  );
  assert.ok(result.ok, JSON.stringify(result));
  if (!result.ok) return;
  specialQuoteCode = result.data.code;
  const stored = await createQuoteRequestsRepository(adminClient).findByCode(specialQuoteCode);
  if (stored) CREATED_QUOTE_IDS.push(stored.id);
});

test("C3: consultar por código — devuelve el snapshot correcto", async () => {
  const lookup = await buscarCotizacionPorCodigo(normalQuoteCode, {
    quoteRequestsRepo: createQuoteRequestsRepository(adminClient),
  });
  assert.equal(lookup.status, "ok");
  if (lookup.status === "ok") assert.equal(lookup.data.code, normalQuoteCode);
});

test("C4: cotización expirada -> status 'expired', datos aún visibles", async () => {
  const quoteRepo = createQuoteRequestsRepository(adminClient);
  const created = await quoteRepo.create({
    code: "COT-TESTB7EXP",
    productId: null,
    isSpecialRequest: true,
    basePriceSnapshot: null,
    baseConfigSnapshot: null,
    requestedConfig: { note: TEST_MARK },
    selectedUpgradesSnapshot: [],
    estimatedPrice: null,
    customerBudget: null,
    customerCity: TEST_MARK,
    customerNote: null,
    expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  });
  CREATED_QUOTE_IDS.push(created.id);

  const lookup = await buscarCotizacionPorCodigo("COT-TESTB7EXP", { quoteRequestsRepo: quoteRepo });
  assert.equal(lookup.status, "expired");
});

test("C5: código inexistente -> not_found", async () => {
  const lookup = await buscarCotizacionPorCodigo("COT-ZZZZZZZZZ", {
    quoteRequestsRepo: createQuoteRequestsRepository(adminClient),
  });
  assert.equal(lookup.status, "not_found");
});

test("C6: código con formato inválido -> invalid_format, sin consultar la DB", async () => {
  const lookup = await buscarCotizacionPorCodigo("formato-invalido", {
    quoteRequestsRepo: createQuoteRequestsRepository(adminClient),
  });
  assert.equal(lookup.status, "invalid_format");
});

// ═══════════════════════════════════════════════════════════════════════
// D. ADMIN — flujo continuo real: upgrade -> compatibilidad -> búsqueda
//    lo encuentra -> cotización -> admin la ve -> cambia estado
// ═══════════════════════════════════════════════════════════════════════

test("D: flujo admin continuo de extremo a extremo, contra STAGING real", async () => {
  const upgradesRepo = createUpgradeOptionsRepository(adminClient);
  const compatRepo = createProductUpgradeOptionsRepository(adminClient);
  const quoteRepo = createQuoteRequestsRepository(adminClient);

  // D1: crear upgrade
  const createResult = await createUpgradeAdmin(
    {
      category: "ram",
      label: `${TEST_MARK} 16 GB RAM`,
      value: 16,
      interface: null,
      extraCost: 75000,
      componentCost: null,
      installCost: null,
      active: true,
    },
    upgradesRepo
  );
  assert.ok(createResult.ok);
  if (!createResult.ok) return;
  const upgradeId = createResult.data.id;
  CREATED_UPGRADE_IDS.push(upgradeId);

  // D2: editar upgrade
  const updateResult = await updateUpgradeAdmin(upgradeId, { extraCost: 80000 }, upgradesRepo);
  assert.ok(updateResult.ok);
  if (updateResult.ok) assert.equal(updateResult.data.extraCost, 80000);

  // D3: activar/desactivar
  const toggleOff = await toggleUpgradeAdmin(upgradeId, false, upgradesRepo);
  assert.ok(toggleOff.ok);
  const toggleOn = await toggleUpgradeAdmin(upgradeId, true, upgradesRepo);
  assert.ok(toggleOn.ok);

  // Producto de prueba propio (nunca se toca un [SEED]).
  const { data: product, error: productError } = await adminClient
    .from("products")
    .insert({
      title: `${TEST_MARK} producto flujo admin`,
      price: 600000,
      stock: 3,
      visible_web: true,
      ram: 8,
      cpu_generation: 8,
      gpu_type: "integrada",
      touch_screen: false,
      storage_gb: 256,
    })
    .select("id")
    .single<{ id: string }>();
  assert.equal(productError, null);
  assert.ok(product);
  if (!product) return;
  CREATED_PRODUCT_IDS.push(product.id);

  // D4: asignar compatibilidad
  const compatResult = await setProductCompatibilityAdmin({ productId: product.id, upgradeOptionIds: [upgradeId] }, compatRepo);
  assert.ok(compatResult.ok);

  // D5: copiar compatibilidad a un segundo producto de prueba
  const { data: product2 } = await adminClient
    .from("products")
    .insert({ title: `${TEST_MARK} producto copia`, price: 600000, stock: 1, visible_web: false })
    .select("id")
    .single<{ id: string }>();
  assert.ok(product2);
  if (product2) {
    CREATED_PRODUCT_IDS.push(product2.id);
    const copyResult = await copyProductCompatibilityAdmin(
      { sourceProductId: product.id, targetProductId: product2.id },
      compatRepo
    );
    assert.ok(copyResult.ok);
    if (copyResult.ok) assert.equal(copyResult.data.copiedCount, 1);
  }

  // La búsqueda pública encuentra el producto de prueba con el upgrade recién creado.
  const searchResult = await buscarOpcionesPersonalizadas(
    { budgetMax: 900000, ramMinGb: 16, storageMinGb: 200, gpu: "cualquiera", touch: "cualquiera", [HONEYPOT_FIELD_NAME]: "" },
    readDeps()
  );
  assert.ok(searchResult.ok);
  if (searchResult.ok) {
    const found = searchResult.data.available.find((o) => o.productId === product.id);
    assert.ok(found, "el producto de prueba debería aparecer con el upgrade recién asignado");
    assert.equal(found?.classification, "RAM_UPGRADE_MATCH");
  }

  // Crear una cotización real sobre ese producto.
  const quoteResult = await crearCotizacionPersonalizada(
    {
      requirements: { budgetMax: 900000, ramMinGb: 16, storageMinGb: 200, gpu: "cualquiera", touch: "cualquiera" },
      selectedProductId: product.id,
      customerCity: TEST_MARK,
    },
    { ...readDeps(), quoteRequestsRepo: quoteRepo }
  );
  assert.ok(quoteResult.ok);
  if (!quoteResult.ok) return;
  const stored = await quoteRepo.findByCode(quoteResult.data.code);
  assert.ok(stored);
  if (stored) CREATED_QUOTE_IDS.push(stored.id);

  // D6: el admin la ve en el listado y en el detalle.
  const listResult = await listQuotesAdmin({ codeSearch: quoteResult.data.code.replace("COT-", "") }, quoteRepo);
  assert.ok(listResult.ok);
  if (listResult.ok) assert.ok(listResult.data.some((q) => q.code === quoteResult.data.code));

  const detailResult = await getQuoteDetailAdmin(quoteResult.data.code, quoteRepo);
  assert.ok(detailResult.ok);
  if (!detailResult.ok || !stored) return;

  // D7: cambiar estado.
  const statusResult = await updateQuoteStatusAdmin({ quoteId: stored.id, status: "contactada" }, quoteRepo);
  assert.ok(statusResult.ok);
  if (statusResult.ok) assert.equal(statusResult.data.status, "contactada");
});
