/**
 * Tests de integración — contra STAGING real, NUNCA producción.
 *
 * Requiere .env.local apuntando a STAGING (npm run env:staging) y que el
 * seed ya esté cargado (npm run seed:staging). Solo LEE — no inserta, no
 * modifica, no borra nada. Usa los 7 productos / 4 upgrades / 8
 * compatibilidades [SEED] ya existentes en vez de crear datos nuevos,
 * como se pidió.
 *
 * assertNotProduction() se importa dinámicamente (.mjs, ver src/lib/env/)
 * y se llama ANTES de crear cualquier cliente de Supabase — si el entorno
 * no es inequívocamente STAGING, ningún test de este archivo llega a
 * ejecutar una sola query.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createProductsRepository } from "./products.repository";
import { createUpgradeOptionsRepository } from "./upgradeOptions.repository";
import { createProductUpgradeOptionsRepository } from "./productUpgradeOptions.repository";

const ROOT = resolve(__dirname, "../../..");

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

const SEED_PRODUCT_IDS = [1, 2, 3, 4, 5, 6, 7].map(
  (n) => `10000000-0000-0000-0000-00000000000${n}`
);
const SEED_UPGRADE_IDS = [1, 2, 3, 4].map((n) => `20000000-0000-0000-0000-00000000000${n}`);

let client: SupabaseClient;

/**
 * TypeScript compilado a CommonJS transforma `await import(x)` en un
 * `require(x)` envuelto en una promesa resuelta — que falla contra un
 * .mjs real (ERR_REQUIRE_ESM), porque Node exige un import dinámico
 * genuino para cargar ESM desde CommonJS. Este truco (construir el
 * import dinámico dentro de una Function creada en tiempo de ejecución)
 * es el workaround estándar: al no ser estático, tsc no puede
 * transformarlo, así que Node ve el `import()` real que sí soporta.
 * Se reutiliza así el módulo canónico real (nunca se duplica su lógica).
 */
const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<{ assertNotProduction: (action: string) => void }>;

before(async () => {
  loadEnvLocal();
  const { assertNotProduction } = await dynamicImport(
    resolve(ROOT, "src/lib/env/assertNotProduction.mjs")
  );
  assertNotProduction("repositories-integration-test");

  client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  );
});

test("ProductsRepository.findManyByIds: lee los 7 productos [SEED]", async () => {
  const repo = createProductsRepository(client);
  const products = await repo.findManyByIds(SEED_PRODUCT_IDS);
  assert.equal(products.length, 7);
  assert.ok(products.every((p) => p.title.startsWith("[SEED]")));
});

test("ProductsRepository.findPersonalizerCandidates: incluye los 7 productos [SEED] (visible_web=true)", async () => {
  const repo = createProductsRepository(client);
  const candidates = await repo.findPersonalizerCandidates();
  const seedOnly = candidates.filter((p) => SEED_PRODUCT_IDS.includes(p.id));
  assert.equal(seedOnly.length, 7);
  assert.ok(seedOnly.every((p) => p.visibleWeb === true));
});

test("ProductsRepository.findById: producto inexistente devuelve null, no lanza", async () => {
  const repo = createProductsRepository(client);
  const result = await repo.findById("00000000-0000-0000-0000-000000000000");
  assert.equal(result, null);
});

test("UpgradeOptionsRepository.findActive: lee las 4 upgrade_options del seed", async () => {
  const repo = createUpgradeOptionsRepository(client);
  const all = await repo.findActive();
  const seedOnly = all.filter((u) => SEED_UPGRADE_IDS.includes(u.id));
  assert.equal(seedOnly.length, 4);
  assert.equal(seedOnly.filter((u) => u.category === "ram").length, 2);
  assert.equal(seedOnly.filter((u) => u.category === "storage").length, 2);
});

test("ProductUpgradeOptionsRepository: las 8 compatibilidades del seed sí existen, distribuidas correctamente", async () => {
  const repo = createProductUpgradeOptionsRepository(client);
  let total = 0;
  for (const productId of SEED_PRODUCT_IDS) {
    const compatible = await repo.findCompatibleUpgradesForProduct(productId);
    total += compatible.length;
  }
  assert.equal(total, 8);
});

test("Escenario: producto SIN upgrades (P1, ya cumple) devuelve array vacío", async () => {
  const repo = createProductUpgradeOptionsRepository(client);
  const p1 = "10000000-0000-0000-0000-000000000001";
  const compatible = await repo.findCompatibleUpgradesForProduct(p1);
  assert.deepEqual(compatible, []);
});

test("Escenario: producto CON upgrades de ambas categorías (P4) las tiene todas", async () => {
  const repo = createProductUpgradeOptionsRepository(client);
  const p4 = "10000000-0000-0000-0000-000000000004";
  const compatible = await repo.findCompatibleUpgradesForProduct(p4);
  assert.equal(compatible.length, 4);
  assert.equal(compatible.filter((c) => c.option.category === "ram").length, 2);
  assert.equal(compatible.filter((c) => c.option.category === "storage").length, 2);
});

test("Escenario: producto incompatible (P5) no ofrece ningún upgrade", async () => {
  const repo = createProductUpgradeOptionsRepository(client);
  const p5 = "10000000-0000-0000-0000-000000000005";
  const compatible = await repo.findCompatibleUpgradesForProduct(p5);
  assert.deepEqual(compatible, []);
});

test("Escenario: producto agotado (P6) sigue siendo legible (stock=0 no bloquea la lectura)", async () => {
  const repo = createProductsRepository(client);
  const p6 = await repo.findById("10000000-0000-0000-0000-000000000006");
  assert.ok(p6);
  assert.equal(p6.stock, 0);
});

test("findCompatibleUpgradesForProducts: la versión en lote coincide exactamente con N llamadas individuales (8 compatibilidades del seed)", async () => {
  const repo = createProductUpgradeOptionsRepository(client);
  const bulk = await repo.findCompatibleUpgradesForProducts(SEED_PRODUCT_IDS);

  let bulkTotal = 0;
  for (const [, list] of bulk) bulkTotal += list.length;
  assert.equal(bulkTotal, 8);

  for (const productId of SEED_PRODUCT_IDS) {
    const individual = await repo.findCompatibleUpgradesForProduct(productId);
    const fromBulk = bulk.get(productId) ?? [];
    assert.equal(fromBulk.length, individual.length);
    const idsIndividual = individual.map((c) => c.compatibilityId).sort();
    const idsBulk = fromBulk.map((c) => c.compatibilityId).sort();
    assert.deepEqual(idsBulk, idsIndividual);
  }
});

test("isCompatible: coincide con lo que devuelve findCompatibleUpgradesForProduct", async () => {
  const repo = createProductUpgradeOptionsRepository(client);
  const p2 = "10000000-0000-0000-0000-000000000002";
  const ram16 = "20000000-0000-0000-0000-000000000001";
  const ssd256 = "20000000-0000-0000-0000-000000000003";

  assert.equal(await repo.isCompatible(p2, ram16), true); // P2 admite RAM
  assert.equal(await repo.isCompatible(p2, ssd256), false); // P2 NO admite storage
});
