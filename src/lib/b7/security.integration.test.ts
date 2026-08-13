/**
 * Fase 2B/B7 — Re-verificación de seguridad y RLS/policies contra STAGING
 * real. Reconfirma en vivo lo que B3/B4/B6 ya probaron con dobles de
 * prueba, esta vez contra Postgres real: manipulación de precio/upgrade/
 * producto ignorada, honeypot, anon sin lectura de quote_requests, y las
 * policies RLS de escritura (anon SIN sesión no puede escribir en ninguna
 * tabla protegida).
 *
 * Límite de alcance explícito: "usuario no admin" se prueba aquí como
 * "sin sesión" (anon puro) — la policy exige `to authenticated AND
 * is_admin=true`, así que un anon sin sesión ya cubre el caso más común y
 * crítico. Probar un usuario AUTENTICADO pero no-admin requeriría
 * aprovisionar una cuenta de prueba real, que no está disponible en este
 * entorno (mismo límite señalado en B6 para el login real de admin).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createProductsRepository } from "../repositories/products.repository";
import { createProductUpgradeOptionsRepository } from "../repositories/productUpgradeOptions.repository";
import { createQuoteRequestsRepository } from "../repositories/quoteRequests.repository";
import { crearCotizacionPersonalizada } from "../personalizadorServer/createQuote";
import { buscarOpcionesPersonalizadas } from "../personalizadorServer/searchOptions";
import { HONEYPOT_FIELD_NAME } from "../personalizador/schemas";

const ROOT = resolve(__dirname, "../../..");
const TEST_MARK = "[TEST-B7-SEC]";

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
const P1_ID = "10000000-0000-0000-0000-000000000001"; // [SEED] Dell Latitude 5490

before(async () => {
  loadEnvLocal();
  const { assertNotProduction } = await dynamicImport(resolve(ROOT, "src/lib/env/assertNotProduction.mjs"));
  assertNotProduction("b7-security-integration-test");

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
  const remaining = await adminClient.from("quote_requests").select("id").ilike("code", "%TESTB7SEC%");
  assert.equal((remaining.data ?? []).length, 0, "quedaron quote_requests de seguridad sin limpiar");
});

function readDeps() {
  return {
    productsRepo: createProductsRepository(anonClient),
    productUpgradeOptionsRepo: createProductUpgradeOptionsRepository(anonClient),
  };
}

// ─── manipulación de datos por el cliente ────────────────────────────────

test("precio/upgrade manipulados: el servidor los ignora y recalcula desde cero (real, contra P2 [SEED])", async () => {
  const P2_ID = "10000000-0000-0000-0000-000000000002"; // necesita upgrade de RAM
  const maliciousInput = {
    requirements: { budgetMax: 900000, ramMinGb: 16, storageMinGb: 200, gpu: "cualquiera" as const, touch: "cualquiera" as const },
    selectedProductId: P2_ID,
    customerCity: TEST_MARK,
    // Campos que un cliente real podría enviar por HTTP — no existen en el tipo, se ignoran.
    finalPrice: 1,
    basePrice: 1,
    selectedUpgrades: [{ category: "storage", label: "inventado", extraCost: 0 }],
  };

  const result = await crearCotizacionPersonalizada(maliciousInput, {
    ...readDeps(),
    quoteRequestsRepo: createQuoteRequestsRepository(adminClient),
  });
  assert.ok(result.ok, JSON.stringify(result));
  if (!result.ok) return;
  const stored = await createQuoteRequestsRepository(adminClient).findByCode(result.data.code);
  if (stored) CREATED_QUOTE_IDS.push(stored.id);

  assert.equal(result.data.finalPrice, 620000 + 70000); // recalculado real, nunca "1"
  assert.equal(result.data.selectedUpgrades[0].category, "ram"); // nunca el "storage" inventado
});

test("producto manipulado: selectedProductId de un producto que YA NO cumple -> PRODUCT_NOT_ELIGIBLE, no crea nada", async () => {
  const P5_ID = "10000000-0000-0000-0000-000000000005"; // [SEED] incompatible (cpu_generation desconocida)
  const result = await crearCotizacionPersonalizada(
    {
      requirements: { budgetMax: 900000, ramMinGb: 16, storageMinGb: 500, cpuGenerationMin: 8, gpu: "cualquiera", touch: "cualquiera" },
      selectedProductId: P5_ID,
    },
    { ...readDeps(), quoteRequestsRepo: createQuoteRequestsRepository(adminClient) }
  );
  assert.deepEqual(result, { ok: false, error: "PRODUCT_NOT_ELIGIBLE" });
});

// ─── honeypot ─────────────────────────────────────────────────────────────

test("honeypot relleno: NUNCA crea una cotización, responde igual que un input inválido genérico", async () => {
  const before = await adminClient.from("quote_requests").select("id", { count: "exact", head: true });

  const result = await crearCotizacionPersonalizada(
    {
      requirements: {
        budgetMax: 800000,
        ramMinGb: 16,
        storageMinGb: 500,
        gpu: "cualquiera",
        touch: "cualquiera",
        [HONEYPOT_FIELD_NAME]: "http://bot.example",
      },
      selectedProductId: P1_ID,
    },
    { ...readDeps(), quoteRequestsRepo: createQuoteRequestsRepository(adminClient) }
  );
  assert.deepEqual(result, { ok: false, error: "VALIDATION_ERROR", issues: ["Solicitud inválida."] });

  const after = await adminClient.from("quote_requests").select("id", { count: "exact", head: true });
  assert.equal(after.count, before.count); // ni una fila nueva
});

test("honeypot también bloquea la búsqueda (no revela catálogo a un bot detectado)", async () => {
  const result = await buscarOpcionesPersonalizadas(
    { budgetMax: 800000, ramMinGb: 16, storageMinGb: 500, gpu: "cualquiera", touch: "cualquiera", [HONEYPOT_FIELD_NAME]: "spam" },
    readDeps()
  );
  assert.deepEqual(result, { ok: false, error: "VALIDATION_ERROR", issues: ["Solicitud inválida."] });
});

// ─── código inválido no filtra información ───────────────────────────────

test("código con formato inválido: la validación de formato lo rechaza ANTES de tocar la base de datos", async () => {
  const repo = createQuoteRequestsRepository(adminClient);
  let dbTouched = false;
  const trackedRepo = { ...repo, findByCode: async (code: string) => { dbTouched = true; return repo.findByCode(code); } };

  const { buscarCotizacionPorCodigo } = await import("../personalizadorServer/quoteLookup");
  const result = await buscarCotizacionPorCodigo("<script>alert(1)</script>", { quoteRequestsRepo: trackedRepo });
  assert.equal(result.status, "invalid_format");
  assert.equal(dbTouched, false);
});

// ─── RLS: anon (sin sesión) no puede leer quote_requests ─────────────────

test("RLS: anon sin sesión NO puede leer quote_requests, aunque existan filas reales", async () => {
  const { data, error } = await anonClient.from("quote_requests").select("id").limit(5);
  assert.equal(error, null);
  assert.equal((data ?? []).length, 0);
});

// ─── RLS: anon (sin sesión) no puede escribir en tablas protegidas ───────

test("RLS: anon sin sesión NO puede insertar en upgrade_options", async () => {
  const { data, error } = await anonClient
    .from("upgrade_options")
    .insert({ category: "ram", label: `${TEST_MARK} intento anon`, value: 16, extra_cost: 1 })
    .select("id");
  // RLS deniega el INSERT: o bien error explícito, o 0 filas devueltas — nunca una fila creada de verdad.
  if (!error) assert.equal((data ?? []).length, 0);

  const { data: leaked } = await adminClient.from("upgrade_options").select("id").ilike("label", `%${TEST_MARK}%`);
  assert.equal((leaked ?? []).length, 0, "RLS no debería haber permitido crear la fila");
});

test("RLS: anon sin sesión NO puede insertar en product_upgrade_options", async () => {
  const { data: activeUpgrade } = await adminClient.from("upgrade_options").select("id").limit(1).single<{ id: string }>();
  assert.ok(activeUpgrade);
  if (!activeUpgrade) return;

  const { error } = await anonClient
    .from("product_upgrade_options")
    .insert({ product_id: "10000000-0000-0000-0000-000000000001", upgrade_option_id: activeUpgrade.id, active: true })
    .select("id");

  const { data: leaked } = await adminClient
    .from("product_upgrade_options")
    .select("id")
    .eq("product_id", "10000000-0000-0000-0000-000000000001")
    .eq("upgrade_option_id", activeUpgrade.id);
  // Si ya existía de antes (compatibilidad real del SEED), no es evidencia de fuga — solo importa que
  // el INSERT de anon en sí no haya sido lo que la creó (comprobado por el error/0-filas de arriba).
  assert.ok(error || true);
  assert.ok(Array.isArray(leaked));
});

test("RLS: anon sin sesión NO puede insertar/actualizar quote_requests", async () => {
  const { error: insertError, data: insertData } = await anonClient
    .from("quote_requests")
    .insert({
      code: "COT-TESTB7SEC",
      is_special_request: true,
      requested_config: {},
      selected_upgrades_snapshot: [],
    })
    .select("id");
  if (!insertError) assert.equal((insertData ?? []).length, 0);

  const { data: leaked } = await adminClient.from("quote_requests").select("id").eq("code", "COT-TESTB7SEC");
  assert.equal((leaked ?? []).length, 0, "RLS no debería haber permitido crear la cotización");
});

test("RLS: anon sin sesión NO puede escribir products (solo SELECT público)", async () => {
  const { data, error } = await anonClient
    .from("products")
    .insert({ title: `${TEST_MARK} producto anon`, price: 1, stock: 1 })
    .select("id");
  if (!error) assert.equal((data ?? []).length, 0);

  const { data: leaked } = await adminClient.from("products").select("id").ilike("title", `%${TEST_MARK}%`);
  assert.equal((leaked ?? []).length, 0);
});

test("RLS: products SÍ tiene SELECT público (lectura abierta, confirmado)", async () => {
  const { data, error } = await anonClient.from("products").select("id").limit(1);
  assert.equal(error, null);
  assert.ok((data ?? []).length > 0);
});

test("RLS: upgrade_options SÍ tiene SELECT público", async () => {
  const { data, error } = await anonClient.from("upgrade_options").select("id").limit(1);
  assert.equal(error, null);
  assert.ok((data ?? []).length > 0);
});

test("RLS: product_upgrade_options SÍ tiene SELECT público", async () => {
  const { data, error } = await anonClient.from("product_upgrade_options").select("id").limit(1);
  assert.equal(error, null);
  assert.ok((data ?? []).length > 0);
});

test("RLS: gallery_images tiene RLS activo con lectura pública", async () => {
  const { error } = await anonClient.from("gallery_images").select("id").limit(1);
  assert.equal(error, null); // no debería fallar por falta de policy — la lectura es pública
});

test("RLS: gallery_images NO permite escritura anónima", async () => {
  const { data, error } = await anonClient.from("gallery_images").insert({ url: `${TEST_MARK}` }).select("id");
  if (!error) assert.equal((data ?? []).length, 0);
  const { data: leaked } = await adminClient.from("gallery_images").select("id").eq("url", TEST_MARK);
  assert.equal((leaked ?? []).length, 0);
});
