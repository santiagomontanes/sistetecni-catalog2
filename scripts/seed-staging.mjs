#!/usr/bin/env node
/**
 * Seed de datos FICTICIOS para el entorno de STAGING de "Personaliza tu
 * portátil". No copia nada de producción — todo aquí es inventado a mano,
 * pensado para cubrir los escenarios de prueba pedidos:
 *
 *   1. equipo que ya cumple requisitos típicos, sin upgrade         → P1
 *   2. equipo que necesita upgrade de RAM únicamente                → P2
 *   3. equipo que necesita upgrade de SSD únicamente                → P3
 *   4. equipo compatible con upgrade de RAM y de SSD                → P4
 *   5. equipo incompatible — sin ningún upgrade posible             → P5
 *   6. producto agotado (stock=0), visible como referencia (D7)     → P6
 *   7. producto por encima de un presupuesto típico                 → P7
 *
 * SEGURIDAD: assertNotProduction() se llama ANTES de crear el cliente de
 * Supabase — si algo apunta a producción, este script nunca llega a
 * importar @supabase/supabase-js ni a abrir una conexión.
 *
 * Requiere: SUPABASE_SERVICE_ROLE_KEY (bypassa RLS para poder insertar en
 * tablas cuya escritura está restringida a admins). Requiere también que
 * las migraciones de supabase/migrations/ ya estén aplicadas en STAGING
 * (confirmado: las 5 ya están aplicadas).
 *
 * También asegura que exista el bucket de Storage "products" (público,
 * igual que en producción) antes de insertar — se crea solo si falta,
 * nunca lo recrea si ya existe.
 *
 * Migraciones ya aplicadas a STAGING. Este script en sí TODAVÍA NO se ha
 * ejecutado — pendiente de autorización explícita.
 */
import { loadEnv } from "./lib/loadEnv.mjs";
loadEnv(); // cachea .env.local — en desarrollo normal es una copia de .env.staging.local (ver npm run env:staging)

import { assertNotProduction } from "../src/lib/env/assertNotProduction.mjs";
assertNotProduction("seed-staging");

// A partir de aquí, y solo si lo anterior no abortó, se toca Supabase.
const { createClient } = await import("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "[seed-staging] Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.local."
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

// ── Catálogo de upgrades ficticios ──────────────────────────────────────
const UPGRADE_OPTIONS = [
  {
    id: "20000000-0000-0000-0000-000000000001",
    category: "ram",
    label: "16 GB RAM",
    value: 16,
    interface: null,
    extra_cost: 70000,
    active: true,
  },
  {
    id: "20000000-0000-0000-0000-000000000002",
    category: "ram",
    label: "32 GB RAM",
    value: 32,
    interface: null,
    extra_cost: 150000,
    active: true,
  },
  {
    id: "20000000-0000-0000-0000-000000000003",
    category: "storage",
    label: "256 GB SSD NVMe",
    value: 256,
    interface: "NVMe",
    extra_cost: 60000,
    active: true,
  },
  {
    id: "20000000-0000-0000-0000-000000000004",
    category: "storage",
    label: "500 GB SSD NVMe",
    value: 500,
    interface: "NVMe",
    extra_cost: 90000,
    active: true,
  },
];
const [RAM_16, RAM_32, SSD_256, SSD_500] = UPGRADE_OPTIONS.map((u) => u.id);

// ── Productos ficticios ──────────────────────────────────────────────────
const PRODUCTS = [
  {
    id: "10000000-0000-0000-0000-000000000001",
    title: "[SEED] Dell Latitude 5490",
    brand: "Dell",
    model: "Latitude 5490",
    cpu: "Intel Core i5-8350U (8va Gen)",
    ram: 16,
    storage: "512 GB SSD",
    screen: '14" FHD',
    price: 750000,
    condition: "Usado",
    stock: 3,
    images: [],
    featured: false,
    visible_web: true,
    cpu_generation: 8,
    gpu_type: "integrada",
    gpu_model: null,
    touch_screen: false,
    screen_size_inches: 14.0,
    storage_gb: 512,
    // escenario 1: ya cumple requisitos típicos — sin upgrades
  },
  {
    id: "10000000-0000-0000-0000-000000000002",
    title: "[SEED] Lenovo ThinkPad T480",
    brand: "Lenovo",
    model: "ThinkPad T480",
    cpu: "Intel Core i5-8250U (8va Gen)",
    ram: 8,
    storage: "256 GB SSD",
    screen: '14" FHD',
    price: 620000,
    condition: "Usado",
    stock: 2,
    images: [],
    featured: false,
    visible_web: true,
    cpu_generation: 8,
    gpu_type: "integrada",
    gpu_model: null,
    touch_screen: false,
    screen_size_inches: 14.0,
    storage_gb: 256,
    // escenario 2: necesita upgrade de RAM únicamente
  },
  {
    id: "10000000-0000-0000-0000-000000000003",
    title: "[SEED] HP EliteBook 840 G5",
    brand: "HP",
    model: "EliteBook 840 G5",
    cpu: "Intel Core i5-8350U (8va Gen)",
    ram: 16,
    storage: "128 GB SSD",
    screen: '14" FHD',
    price: 680000,
    condition: "Usado",
    stock: 4,
    images: [],
    featured: false,
    visible_web: true,
    cpu_generation: 8,
    gpu_type: "integrada",
    gpu_model: null,
    touch_screen: false,
    screen_size_inches: 14.0,
    storage_gb: 128,
    // escenario 3: necesita upgrade de SSD únicamente
  },
  {
    id: "10000000-0000-0000-0000-000000000004",
    title: "[SEED] Dell Latitude 5491",
    brand: "Dell",
    model: "Latitude 5491",
    cpu: "Intel Core i5-8365U (8va Gen)",
    ram: 8,
    storage: "128 GB SSD",
    screen: '14" FHD',
    price: 640000,
    condition: "Usado",
    stock: 5,
    images: [],
    featured: false,
    visible_web: true,
    cpu_generation: 8,
    gpu_type: "integrada",
    gpu_model: null,
    touch_screen: false,
    screen_size_inches: 14.0,
    storage_gb: 128,
    // escenario 4: compatible con upgrade de RAM y de SSD
  },
  {
    id: "10000000-0000-0000-0000-000000000005",
    title: "[SEED] Acer TravelMate B118",
    brand: "Acer",
    model: "TravelMate B118",
    cpu: "Intel Celeron N3350 (RAM y almacenamiento soldados)",
    ram: 4,
    storage: "128 GB eMMC",
    screen: '11.6" HD',
    price: 480000,
    condition: "Usado",
    stock: 6,
    images: [],
    featured: false,
    visible_web: true,
    cpu_generation: null,
    gpu_type: "integrada",
    gpu_model: null,
    touch_screen: false,
    screen_size_inches: 11.6,
    storage_gb: 128,
    // escenario 5: incompatible — sin ningún upgrade posible (memoria soldada, eMMC no reemplazable)
  },
  {
    id: "10000000-0000-0000-0000-000000000006",
    title: "[SEED] Lenovo ThinkPad T14",
    brand: "Lenovo",
    model: "ThinkPad T14",
    cpu: "Intel Core i7-10510U (10ma Gen)",
    ram: 16,
    storage: "512 GB SSD",
    screen: '14" FHD',
    price: 980000,
    condition: "Usado",
    stock: 0,
    images: [],
    featured: false,
    visible_web: true,
    cpu_generation: 10,
    gpu_type: "integrada",
    gpu_model: null,
    touch_screen: false,
    screen_size_inches: 14.0,
    storage_gb: 512,
    // escenario 6: agotado — debe seguir siendo visible como referencia (D7)
  },
  {
    id: "10000000-0000-0000-0000-000000000007",
    title: "[SEED] Dell XPS 13 9310 Premium",
    brand: "Dell",
    model: "XPS 13 9310",
    cpu: "Intel Core i7-1165G7 (11va Gen)",
    ram: 16,
    storage: "512 GB SSD",
    screen: '13.3" 4K Touch',
    price: 2500000,
    condition: "Usado",
    stock: 2,
    images: [],
    featured: false,
    visible_web: true,
    cpu_generation: 11,
    gpu_type: "dedicada",
    gpu_model: "NVIDIA GeForce MX450",
    touch_screen: true,
    screen_size_inches: 13.3,
    storage_gb: 512,
    // escenario 7: por encima de un presupuesto típico (~$600-800k)
  },
];

// ── Compatibilidad (qué upgrades aplican a qué producto) ─────────────────
const [P1, P2, P3, P4, P5, P6, P7] = PRODUCTS.map((p) => p.id);
const PRODUCT_UPGRADE_OPTIONS = [
  // P2: solo RAM
  { product_id: P2, upgrade_option_id: RAM_16, note: null },
  { product_id: P2, upgrade_option_id: RAM_32, note: null },
  // P3: solo almacenamiento
  { product_id: P3, upgrade_option_id: SSD_256, note: null },
  { product_id: P3, upgrade_option_id: SSD_500, note: null },
  // P4: ambos
  { product_id: P4, upgrade_option_id: RAM_16, note: null },
  { product_id: P4, upgrade_option_id: RAM_32, note: null },
  { product_id: P4, upgrade_option_id: SSD_256, note: null },
  { product_id: P4, upgrade_option_id: SSD_500, note: "requiere retirar el SSD SATA original" },
  // P1, P5, P6, P7: sin filas — sin upgrades ofrecidos
];

async function ensureProductsBucket() {
  const { data: existing, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw new Error(`storage.listBuckets: ${listError.message}`);

  if (existing?.some((b) => b.id === "products")) {
    console.log(`[seed-staging] Bucket "products" ya existe — no se recrea.`);
    return;
  }

  console.log(`[seed-staging] Creando bucket "products" (público, igual que en producción)...`);
  const { error: createError } = await supabase.storage.createBucket("products", { public: true });
  if (createError) throw new Error(`storage.createBucket: ${createError.message}`);
}

async function main() {
  await ensureProductsBucket();

  console.log(`[seed-staging] Insertando ${PRODUCTS.length} productos ficticios...`);
  const { error: productsError } = await supabase
    .from("products")
    .upsert(PRODUCTS, { onConflict: "id" });
  if (productsError) throw new Error(`products: ${productsError.message}`);

  console.log(`[seed-staging] Insertando ${UPGRADE_OPTIONS.length} upgrade_options ficticias...`);
  const { error: upgradesError } = await supabase
    .from("upgrade_options")
    .upsert(UPGRADE_OPTIONS, { onConflict: "id" });
  if (upgradesError) throw new Error(`upgrade_options: ${upgradesError.message}`);

  console.log(
    `[seed-staging] Insertando ${PRODUCT_UPGRADE_OPTIONS.length} filas de compatibilidad...`
  );
  const { error: compatError } = await supabase
    .from("product_upgrade_options")
    .upsert(PRODUCT_UPGRADE_OPTIONS, { onConflict: "product_id,upgrade_option_id" });
  if (compatError) throw new Error(`product_upgrade_options: ${compatError.message}`);

  console.log("[seed-staging] Listo. Productos ficticios con prefijo [SEED] — fáciles de identificar y purgar.");
}

await main();
