/**
 * Tests de integración — contra STAGING real, NUNCA producción.
 *
 * Requiere .env.local apuntando a STAGING (npm run env:staging) y el seed
 * ya cargado (npm run seed:staging). assertNotProduction() se importa
 * dinámicamente y se llama ANTES de crear cualquier cliente de Supabase —
 * mismo patrón que src/lib/repositories/repositories.integration.test.ts.
 *
 * Este archivo SÍ escribe — crea quote_requests reales de prueba. Cada
 * fila creada queda marcada con customerCity="[TEST-B4-INTEGRACION]" (un
 * valor imposible de confundir con un dato real) y se registra su id en
 * CREATED_IDS. El hook `after()` borra ÚNICAMENTE esos ids exactos — nunca
 * un DELETE masivo — y una comprobación final confirma que el COUNT de
 * filas con ese marcador vuelve a 0.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createProductsRepository } from "../repositories/products.repository";
import { createProductUpgradeOptionsRepository } from "../repositories/productUpgradeOptions.repository";
import { createQuoteRequestsRepository } from "../repositories/quoteRequests.repository";
import { evaluateCandidate } from "../personalizador";
import { buscarOpcionesPersonalizadas } from "./searchOptions";
import { crearCotizacionPersonalizada } from "./createQuote";
import { buscarCotizacionPorCodigo } from "./quoteLookup";

const ROOT = resolve(__dirname, "../../..");
const TEST_MARKER = "[TEST-B4-INTEGRACION]";
const P1_ID = "10000000-0000-0000-0000-000000000001"; // [SEED] Dell Latitude 5490 — DIRECT_MATCH, sin upgrades

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

/** Mismo workaround que repositories.integration.test.ts — ver ese archivo para la explicación completa. */
const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<{ assertNotProduction: (action: string) => void }>;

let anonClient: SupabaseClient;
let adminClient: SupabaseClient;
const CREATED_IDS: string[] = [];

before(async () => {
  loadEnvLocal();
  const { assertNotProduction } = await dynamicImport(
    resolve(ROOT, "src/lib/env/assertNotProduction.mjs")
  );
  assertNotProduction("personalizadorServer-integration-test");

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
  if (CREATED_IDS.length === 0) return;

  for (const id of CREATED_IDS) {
    const { error } = await adminClient.from("quote_requests").delete().eq("id", id).eq("customer_city", TEST_MARKER);
    assert.equal(error, null, `no se pudo borrar la fila de prueba id=${id} — DETENTE y reporta este id manualmente`);
  }

  const { data: remaining, error: countError } = await adminClient
    .from("quote_requests")
    .select("id")
    .eq("customer_city", TEST_MARKER);
  assert.equal(countError, null);
  assert.equal(
    (remaining ?? []).length,
    0,
    `quedaron filas de prueba sin limpiar: ${(remaining ?? []).map((r) => r.id).join(", ")}`
  );
});

function buildReadDeps() {
  return {
    productsRepo: createProductsRepository(anonClient),
    productUpgradeOptionsRepo: createProductUpgradeOptionsRepository(anonClient),
  };
}

// A + B + C: crear cotización real, leerla por código, comprobar que coincide con B3
test("A+B+C: crea una cotización real con P1 [SEED], la lee por código, y el precio coincide con lo que B3 calcula de forma independiente", async () => {
  const requirements = {
    budgetMax: 800000,
    ramMinGb: 16,
    storageMinGb: 500,
    gpu: "cualquiera" as const,
    touch: "cualquiera" as const,
  };

  // A. Crear — pasa por la orquestación real (repos reales + B3 real).
  const createResult = await crearCotizacionPersonalizada(
    { requirements, selectedProductId: P1_ID, customerCity: TEST_MARKER },
    {
      ...buildReadDeps(),
      quoteRequestsRepo: createQuoteRequestsRepository(adminClient),
    }
  );
  assert.ok(createResult.ok, `crearCotizacionPersonalizada falló: ${JSON.stringify(createResult)}`);
  if (!createResult.ok) return;

  const code = createResult.data.code;

  // Registrar el id real para limpieza — se obtiene vía findByCode (admin), no se adivina.
  const quoteRepo = createQuoteRequestsRepository(adminClient);
  const stored = await quoteRepo.findByCode(code);
  assert.ok(stored, "la cotización recién creada debería ser legible por código con el cliente admin");
  if (stored) CREATED_IDS.push(stored.id);

  // B. Leerla por código — mismo camino que usará el Route Handler.
  const lookup = await buscarCotizacionPorCodigo(code, { quoteRequestsRepo: quoteRepo });
  assert.equal(lookup.status, "ok");
  if (lookup.status !== "ok") return;
  assert.equal(lookup.data.code, code);

  // C. El precio persistido coincide con lo que B3 calcula de forma
  // independiente, releyendo el producto/upgrades reales de STAGING ahora mismo.
  const productsRepo = createProductsRepository(anonClient);
  const upgradesRepo = createProductUpgradeOptionsRepository(anonClient);
  const product = await productsRepo.findById(P1_ID);
  assert.ok(product);
  if (!product) return;
  const compatibleUpgrades = await upgradesRepo.findCompatibleUpgradesForProduct(P1_ID);
  const expected = evaluateCandidate({ product, compatibleUpgrades }, requirements);
  assert.ok(expected);
  if (!expected) return;

  assert.equal(lookup.data.finalPrice, expected.finalPrice);
  assert.equal(lookup.data.basePrice, expected.basePrice);
  assert.equal(lookup.data.product?.title, product.title);
});

// E. Special quote de prueba
test("E: crea una cotización especial real cuando ningún candidato de STAGING cumple requisitos imposibles", async () => {
  const impossibleRequirements = {
    budgetMax: 800000,
    ramMinGb: 16,
    storageMinGb: 500,
    cpuGenerationMin: 20, // máximo permitido por el schema de B3 (MAX_CPU_GENERATION) — ningún [SEED] llega tan alto (el más nuevo es 11va gen)
    gpu: "cualquiera" as const,
    touch: "cualquiera" as const,
  };

  // Confirmación previa (solo lectura) de que en efecto no hay candidatos —
  // para no depender de una suposición sobre qué más pueda existir en STAGING.
  const search = await buscarOpcionesPersonalizadas(impossibleRequirements, buildReadDeps());
  assert.ok(search.ok);
  if (!search.ok) return;
  assert.equal(search.data.specialQuoteRequired, true);
  assert.equal(search.data.available.length, 0);
  assert.equal(search.data.referenceOnly.length, 0);

  const createResult = await crearCotizacionPersonalizada(
    { requirements: impossibleRequirements, wantsSpecialQuote: true, customerCity: TEST_MARKER },
    {
      ...buildReadDeps(),
      quoteRequestsRepo: createQuoteRequestsRepository(adminClient),
    }
  );
  assert.ok(createResult.ok, `crearCotizacionPersonalizada (special) falló: ${JSON.stringify(createResult)}`);
  if (!createResult.ok) return;

  assert.equal(createResult.data.isSpecialRequest, true);
  assert.equal(createResult.data.product, null);
  assert.equal(createResult.data.finalPrice, null);

  const quoteRepo = createQuoteRequestsRepository(adminClient);
  const stored = await quoteRepo.findByCode(createResult.data.code);
  assert.ok(stored);
  if (stored) {
    assert.equal(stored.productId, null); // NUNCA se inventa un product_id
    CREATED_IDS.push(stored.id);
  }
});

// F. anon sigue sin poder SELECT sobre quote_requests
test("F: el cliente anon NO puede leer quote_requests (RLS sin policy de lectura pública) — confirmado incluso con filas reales presentes", async () => {
  const { data, error } = await anonClient.from("quote_requests").select("id").limit(5);
  // Con RLS sin policy de SELECT para 'anon', Postgrest devuelve 0 filas
  // (no necesariamente un error) — lo que importa es que NUNCA se vean filas.
  assert.equal(error, null);
  assert.equal((data ?? []).length, 0);
});
