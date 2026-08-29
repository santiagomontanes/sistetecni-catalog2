#!/usr/bin/env node
/**
 * Restaura SOLO la fuente/stock esperado de los 7 productos [SEED] usados por B7.
 *
 * Motivo: desde ERP Fase 1D un producto puede quedar con erp_stock_enabled=true.
 * Si se usa accidentalmente un fixture [SEED] para probar inventario físico,
 * products.stock pasa a derivarse de product_units y los escenarios B7 dejan de
 * ser deterministas. Este script devuelve esos fixtures a stock manual sin
 * tocar especificaciones, precios, upgrades ni inventario físico.
 */
import { loadEnv } from "./lib/loadEnv.mjs";
loadEnv();

import { assertNotProduction } from "../src/lib/env/assertNotProduction.mjs";
assertNotProduction("restore-b7-seed-stock");

const { createClient } = await import("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("[restore-b7-seed-stock] Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EXPECTED = [
  ["10000000-0000-0000-0000-000000000001", 3],
  ["10000000-0000-0000-0000-000000000002", 2],
  ["10000000-0000-0000-0000-000000000003", 4],
  ["10000000-0000-0000-0000-000000000004", 5],
  ["10000000-0000-0000-0000-000000000005", 6],
  ["10000000-0000-0000-0000-000000000006", 0],
  ["10000000-0000-0000-0000-000000000007", 2],
];

for (const [id, stock] of EXPECTED) {
  const { data, error } = await supabase
    .from("products")
    .update({
      erp_stock_enabled: false,
      erp_stock_synced_at: null,
      stock,
    })
    .eq("id", id)
    .ilike("title", "[SEED]%")
    .select("id,title,stock,erp_stock_enabled")
    .maybeSingle();

  if (error) throw new Error(`[restore-b7-seed-stock] ${id}: ${error.message}`);
  if (!data) throw new Error(`[restore-b7-seed-stock] No se encontró el fixture [SEED] ${id}; ejecuta primero npm run seed:staging.`);
  if (data.stock !== stock || data.erp_stock_enabled !== false) {
    throw new Error(`[restore-b7-seed-stock] ${id}: restauración no quedó consistente.`);
  }
  console.log(`✓ ${data.title}: stock=${data.stock}, fuente=manual`);
}

console.log("[restore-b7-seed-stock] Listo. Los 7 fixtures B7 volvieron a su baseline determinista.");
