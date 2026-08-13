/**
 * Tests de integración — contra STAGING real, NUNCA producción.
 *
 * Prueba los repositorios de B2 + la orquestación de B6 (upgrades.ts,
 * compatibility.ts, quotes.ts) directamente contra Postgres real —
 * requireAdmin() ya está probado por separado con dobles inyectados
 * (auth.test.ts, 7 tests) porque no hay una cuenta de administrador de
 * prueba real disponible en este entorno para un round-trip de login
 * genuino; lo que SÍ se prueba aquí en vivo es que las escrituras reales
 * respetan las restricciones de Postgres (UNIQUE, etc.) y que los
 * snapshots de cotizaciones ya creadas son inmunes a cambios posteriores.
 *
 * TODA la data que este archivo crea/muta está marcada [TEST-B6] y se
 * limpia por id exacto al final — nunca se toca ni un producto ni un
 * upgrade_option de los 7 [SEED] ya existentes (para no romper otros
 * tests ni el catálogo real de STAGING), y NUNCA se tocan licenses/
 * license_activations.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createUpgradeOptionsRepository } from "../repositories/upgradeOptions.repository";
import { createProductUpgradeOptionsRepository } from "../repositories/productUpgradeOptions.repository";
import { createQuoteRequestsRepository } from "../repositories/quoteRequests.repository";
import { createUpgradeAdmin, updateUpgradeAdmin, toggleUpgradeAdmin } from "./upgrades";
import { setProductCompatibilityAdmin, copyProductCompatibilityAdmin } from "./compatibility";
import { listQuotesAdmin, getQuoteDetailAdmin, updateQuoteStatusAdmin } from "./quotes";

const ROOT = resolve(__dirname, "../../..");
const TEST_MARK = "[TEST-B6]";

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

let adminClient: SupabaseClient;
const CREATED_UPGRADE_IDS: string[] = [];
const CREATED_PRODUCT_IDS: string[] = [];
const CREATED_QUOTE_IDS: string[] = [];

before(async () => {
  loadEnvLocal();
  const { assertNotProduction } = await dynamicImport(resolve(ROOT, "src/lib/env/assertNotProduction.mjs"));
  assertNotProduction("personalizadorAdmin-integration-test");

  adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
});

after(async () => {
  for (const id of CREATED_QUOTE_IDS) {
    await adminClient.from("quote_requests").delete().eq("id", id);
  }
  for (const id of CREATED_PRODUCT_IDS) {
    await adminClient.from("product_upgrade_options").delete().eq("product_id", id);
    await adminClient.from("products").delete().eq("id", id);
  }
  for (const id of CREATED_UPGRADE_IDS) {
    await adminClient.from("product_upgrade_options").delete().eq("upgrade_option_id", id);
    await adminClient.from("upgrade_options").delete().eq("id", id);
  }

  const remainingUpgrades = await adminClient.from("upgrade_options").select("id").ilike("label", `%${TEST_MARK}%`);
  const remainingProducts = await adminClient.from("products").select("id").ilike("title", `%${TEST_MARK}%`);
  assert.equal((remainingUpgrades.data ?? []).length, 0, "quedaron upgrade_options [TEST-B6] sin limpiar");
  assert.equal((remainingProducts.data ?? []).length, 0, "quedaron products [TEST-B6] sin limpiar");
});

// A. crear upgrade real
test("A: createUpgradeAdmin crea una fila real en STAGING", async () => {
  const repo = createUpgradeOptionsRepository(adminClient);
  const result = await createUpgradeAdmin(
    {
      category: "ram",
      label: `${TEST_MARK} 16 GB RAM`,
      value: 16,
      interface: null,
      extraCost: 70000,
      componentCost: null,
      installCost: null,
      active: true,
    },
    repo
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  CREATED_UPGRADE_IDS.push(result.data.id);

  const reloaded = await repo.findById(result.data.id);
  assert.equal(reloaded?.label, `${TEST_MARK} 16 GB RAM`);
});

// B. editar precio
test("B: updateUpgradeAdmin cambia extraCost realmente en STAGING", async () => {
  const repo = createUpgradeOptionsRepository(adminClient);
  const created = await repo.create({
    category: "ram",
    label: `${TEST_MARK} editar precio`,
    value: 32,
    interface: null,
    extraCost: 100000,
    componentCost: null,
    installCost: null,
    active: true,
  });
  CREATED_UPGRADE_IDS.push(created.id);

  const result = await updateUpgradeAdmin(created.id, { extraCost: 120000 }, repo);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.data.extraCost, 120000);

  const reloaded = await repo.findById(created.id);
  assert.equal(reloaded?.extraCost, 120000);
});

// C. activar/desactivar
test("C: toggleUpgradeAdmin activa/desactiva realmente (D14 — nunca DELETE)", async () => {
  const repo = createUpgradeOptionsRepository(adminClient);
  const created = await repo.create({
    category: "storage",
    label: `${TEST_MARK} toggle`,
    value: 500,
    interface: "NVMe",
    extraCost: 90000,
    componentCost: null,
    installCost: null,
    active: true,
  });
  CREATED_UPGRADE_IDS.push(created.id);

  const off = await toggleUpgradeAdmin(created.id, false, repo);
  assert.ok(off.ok);
  if (off.ok) assert.equal(off.data.active, false);

  const on = await toggleUpgradeAdmin(created.id, true, repo);
  assert.ok(on.ok);
  if (on.ok) assert.equal(on.data.active, true);

  // La fila sigue siendo la MISMA (mismo id) — nunca se borró y recreó.
  const reloaded = await repo.findById(created.id);
  assert.equal(reloaded?.id, created.id);
});

// D. compatibilidad + no duplicar relaciones (contra el UNIQUE real de Postgres)
test("D: setProductCompatibilityAdmin — compatibilidad real, nunca duplica (UNIQUE product_id+upgrade_option_id real)", async () => {
  const upgradesRepo = createUpgradeOptionsRepository(adminClient);
  const compatRepo = createProductUpgradeOptionsRepository(adminClient);

  const upgrade = await upgradesRepo.create({
    category: "ram",
    label: `${TEST_MARK} compat`,
    value: 16,
    interface: null,
    extraCost: 70000,
    componentCost: null,
    installCost: null,
    active: true,
  });
  CREATED_UPGRADE_IDS.push(upgrade.id);

  const { data: product, error: productError } = await adminClient
    .from("products")
    .insert({ title: `${TEST_MARK} producto compat`, price: 500000, stock: 1, visible_web: false })
    .select("id")
    .single<{ id: string }>();
  assert.equal(productError, null);
  assert.ok(product);
  if (!product) return;
  CREATED_PRODUCT_IDS.push(product.id);

  const first = await setProductCompatibilityAdmin({ productId: product.id, upgradeOptionIds: [upgrade.id] }, compatRepo);
  assert.ok(first.ok);

  // Llamar DE NUEVO con el mismo conjunto — si duplicara, esto violaría el
  // UNIQUE real de Postgres y el repo fallaría; si el diffing es correcto,
  // no pasa nada porque ya está activo (no reinserta).
  const second = await setProductCompatibilityAdmin({ productId: product.id, upgradeOptionIds: [upgrade.id] }, compatRepo);
  assert.ok(second.ok);

  const { data: rows, error: rowsError } = await adminClient
    .from("product_upgrade_options")
    .select("id")
    .eq("product_id", product.id)
    .eq("upgrade_option_id", upgrade.id);
  assert.equal(rowsError, null);
  assert.equal((rows ?? []).length, 1); // UNA sola fila, jamás duplicada
});

// producto sin compatibilidad — caso válido
test("D2: producto real sin ninguna compatibilidad asignada -> findCompatibleUpgradesForProduct devuelve []", async () => {
  const compatRepo = createProductUpgradeOptionsRepository(adminClient);
  const { data: product, error } = await adminClient
    .from("products")
    .insert({ title: `${TEST_MARK} sin compatibilidad`, price: 400000, stock: 1, visible_web: false })
    .select("id")
    .single<{ id: string }>();
  assert.equal(error, null);
  assert.ok(product);
  if (!product) return;
  CREATED_PRODUCT_IDS.push(product.id);

  const compatible = await compatRepo.findCompatibleUpgradesForProduct(product.id);
  assert.deepEqual(compatible, []);
});

// E. copiar compatibilidad — relaciones nuevas e independientes
test("E: copyProductCompatibilityAdmin copia relaciones reales, independientes del origen", async () => {
  const upgradesRepo = createUpgradeOptionsRepository(adminClient);
  const compatRepo = createProductUpgradeOptionsRepository(adminClient);

  const upgrade = await upgradesRepo.create({
    category: "storage",
    label: `${TEST_MARK} copiar`,
    value: 500,
    interface: "NVMe",
    extraCost: 90000,
    componentCost: null,
    installCost: null,
    active: true,
  });
  CREATED_UPGRADE_IDS.push(upgrade.id);

  const { data: source } = await adminClient
    .from("products")
    .insert({ title: `${TEST_MARK} origen`, price: 500000, stock: 1, visible_web: false })
    .select("id")
    .single<{ id: string }>();
  const { data: target } = await adminClient
    .from("products")
    .insert({ title: `${TEST_MARK} destino`, price: 500000, stock: 1, visible_web: false })
    .select("id")
    .single<{ id: string }>();
  assert.ok(source && target);
  if (!source || !target) return;
  CREATED_PRODUCT_IDS.push(source.id, target.id);

  await compatRepo.setCompatibility(source.id, [upgrade.id]);

  const copyResult = await copyProductCompatibilityAdmin(
    { sourceProductId: source.id, targetProductId: target.id },
    compatRepo
  );
  assert.ok(copyResult.ok);
  if (copyResult.ok) assert.equal(copyResult.data.copiedCount, 1);

  // Independencia real: modificar el destino no toca al origen.
  await compatRepo.setCompatibility(target.id, []);
  const sourceStillCompatible = await compatRepo.findCompatibleUpgradesForProduct(source.id);
  assert.equal(sourceStillCompatible.length, 1);
});

// F. listar / detalle / cambiar status — con una cotización especial de prueba
let testQuoteId: string;
let testQuoteCode: string;

test("F1: crea una quote_request [TEST-B6] real para probar listar/detalle/status", async () => {
  const { data, error } = await adminClient
    .from("quote_requests")
    .insert({
      code: "COT-TESTB6XYZ",
      is_special_request: true,
      requested_config: { note: TEST_MARK },
      selected_upgrades_snapshot: [],
      customer_city: TEST_MARK,
      status: "nueva",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id,code")
    .single<{ id: string; code: string }>();
  assert.equal(error, null);
  assert.ok(data);
  if (!data) return;
  testQuoteId = data.id;
  testQuoteCode = data.code;
  CREATED_QUOTE_IDS.push(testQuoteId);
});

test("F2: listQuotesAdmin encuentra la cotización de prueba por búsqueda de código", async () => {
  const repo = createQuoteRequestsRepository(adminClient);
  const result = await listQuotesAdmin({ codeSearch: "TESTB6XYZ" }, repo);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].code, testQuoteCode);
  }
});

test("F3: getQuoteDetailAdmin devuelve el detalle completo desde el snapshot", async () => {
  const repo = createQuoteRequestsRepository(adminClient);
  const result = await getQuoteDetailAdmin(testQuoteCode, repo);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.data.isSpecialRequest, true);
    assert.equal(result.data.customerCity, TEST_MARK);
  }
});

test("F4: updateQuoteStatusAdmin cambia el estado real, status inválido lo rechaza antes de tocar la DB", async () => {
  const repo = createQuoteRequestsRepository(adminClient);

  const invalid = await updateQuoteStatusAdmin({ quoteId: testQuoteId, status: "cancelada" }, repo);
  assert.equal(invalid.ok, false);

  const valid = await updateQuoteStatusAdmin({ quoteId: testQuoteId, status: "contactada" }, repo);
  assert.ok(valid.ok);
  if (valid.ok) assert.equal(valid.data.status, "contactada");
});

// G. snapshot inmune a cambios de precio del upgrade (punto 12)
test("G: cambiar el extraCost de un upgrade DESPUÉS de crear una cotización no altera el snapshot ya guardado", async () => {
  const upgradesRepo = createUpgradeOptionsRepository(adminClient);
  const compatRepo = createProductUpgradeOptionsRepository(adminClient);
  const quoteRepo = createQuoteRequestsRepository(adminClient);

  const upgrade = await upgradesRepo.create({
    category: "ram",
    label: `${TEST_MARK} snapshot precio`,
    value: 16,
    interface: null,
    extraCost: 70000,
    componentCost: null,
    installCost: null,
    active: true,
  });
  CREATED_UPGRADE_IDS.push(upgrade.id);

  const { data: product } = await adminClient
    .from("products")
    .insert({ title: `${TEST_MARK} producto snapshot precio`, price: 600000, stock: 1, visible_web: false, ram: 8 })
    .select("id")
    .single<{ id: string }>();
  assert.ok(product);
  if (!product) return;
  CREATED_PRODUCT_IDS.push(product.id);
  await compatRepo.setCompatibility(product.id, [upgrade.id]);

  // Snapshot "a mano" (equivalente a lo que B3/B4 ya generan) — lo que
  // importa aquí es la inmutabilidad del dato ya persistido, no repetir
  // el motor de matching.
  const created = await quoteRepo.create({
    code: "COT-TESTB6PRC",
    productId: product.id,
    isSpecialRequest: false,
    basePriceSnapshot: 600000,
    baseConfigSnapshot: {
      title: `${TEST_MARK} producto snapshot precio`,
      brand: "",
      model: "",
      cpu: "",
      ram: 8,
      storage: "",
      screen: "",
      condition: "",
      image: null,
    },
    requestedConfig: { note: TEST_MARK },
    selectedUpgradesSnapshot: [{ category: "ram", label: upgrade.label, value: 16, extra_cost: 70000 }],
    estimatedPrice: 670000,
    customerBudget: 700000,
    customerCity: null,
    customerNote: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  CREATED_QUOTE_IDS.push(created.id);

  // Ahora el admin sube el precio del upgrade.
  await updateUpgradeAdmin(upgrade.id, { extraCost: 999999 }, upgradesRepo);

  const reloadedQuote = await quoteRepo.findByCode("COT-TESTB6PRC");
  assert.equal(reloadedQuote?.estimatedPrice, 670000); // SIN cambios
  assert.equal(reloadedQuote?.selectedUpgradesSnapshot[0].extra_cost, 70000); // SIN cambios
});

// H. snapshot inmune a cambios del producto (punto 13)
test("H: cambiar specs del producto DESPUÉS de crear una cotización no altera baseConfigSnapshot ya guardado", async () => {
  const quoteRepo = createQuoteRequestsRepository(adminClient);

  const { data: product } = await adminClient
    .from("products")
    .insert({
      title: `${TEST_MARK} producto snapshot specs`,
      price: 600000,
      stock: 1,
      visible_web: false,
      cpu: "CPU original",
    })
    .select("id")
    .single<{ id: string }>();
  assert.ok(product);
  if (!product) return;
  CREATED_PRODUCT_IDS.push(product.id);

  const created = await quoteRepo.create({
    code: "COT-TESTB6SPC",
    productId: product.id,
    isSpecialRequest: false,
    basePriceSnapshot: 600000,
    baseConfigSnapshot: {
      title: `${TEST_MARK} producto snapshot specs`,
      brand: "",
      model: "",
      cpu: "CPU original",
      ram: 8,
      storage: "",
      screen: "",
      condition: "",
      image: null,
    },
    requestedConfig: { note: TEST_MARK },
    selectedUpgradesSnapshot: [],
    estimatedPrice: 600000,
    customerBudget: 700000,
    customerCity: null,
    customerNote: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  CREATED_QUOTE_IDS.push(created.id);

  // El admin edita el producto (vía la misma tabla que usa AdminProductForm).
  const { error: updateError } = await adminClient
    .from("products")
    .update({ cpu: "CPU cambiada después" })
    .eq("id", product.id);
  assert.equal(updateError, null);

  const reloadedQuote = await quoteRepo.findByCode("COT-TESTB6SPC");
  assert.equal(reloadedQuote?.baseConfigSnapshot?.cpu, "CPU original"); // SIN cambios — nunca reconsulta el producto actual
});
