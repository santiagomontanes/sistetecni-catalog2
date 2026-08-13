/**
 * Fixtures compartidas para los tests de B3 — reflejan EXACTAMENTE los 7
 * productos [SEED] / 4 upgrade_options / 8 compatibilidades ya cargados
 * en STAGING (scripts/seed-staging.mjs), pero como objetos en memoria: B3
 * no toca la base, solo reutiliza los mismos datos y escenarios para que
 * las pruebas sean trazables 1:1 contra lo que ya se verificó ahí.
 */
import type { Product } from "../../types/product";
import type { UpgradeOption, CompatibleUpgrade } from "../../types/upgrade";
import type { ProductCandidate } from "./types";

function buildProduct(overrides: Partial<Product> & { id: string; title: string }): Product {
  return {
    brand: "Marca",
    model: "Modelo",
    cpu: "CPU genérica",
    ram: 8,
    storage: "256 GB SSD",
    screen: '14"',
    price: 600000,
    condition: "Usado",
    stock: 1,
    images: [],
    featured: false,
    visibleWeb: true,
    createdAt: null,
    cpuGeneration: null,
    gpuType: null,
    gpuModel: null,
    touchScreen: false,
    screenSizeInches: null,
    storageGb: null,
    ...overrides,
  };
}

export const UPGRADE_RAM_16: UpgradeOption = {
  id: "20000000-0000-0000-0000-000000000001",
  category: "ram",
  label: "16 GB RAM",
  value: 16,
  interface: null,
  extraCost: 70000,
  componentCost: null,
  installCost: null,
  active: true,
  createdAt: null,
};

export const UPGRADE_RAM_32: UpgradeOption = {
  id: "20000000-0000-0000-0000-000000000002",
  category: "ram",
  label: "32 GB RAM",
  value: 32,
  interface: null,
  extraCost: 150000,
  componentCost: null,
  installCost: null,
  active: true,
  createdAt: null,
};

export const UPGRADE_SSD_256: UpgradeOption = {
  id: "20000000-0000-0000-0000-000000000003",
  category: "storage",
  label: "256 GB SSD NVMe",
  value: 256,
  interface: "NVMe",
  extraCost: 60000,
  componentCost: null,
  installCost: null,
  active: true,
  createdAt: null,
};

export const UPGRADE_SSD_500: UpgradeOption = {
  id: "20000000-0000-0000-0000-000000000004",
  category: "storage",
  label: "500 GB SSD NVMe",
  value: 500,
  interface: "NVMe",
  extraCost: 90000,
  componentCost: null,
  installCost: null,
  active: true,
  createdAt: null,
};

function compat(compatibilityId: string, option: UpgradeOption, note: string | null = null): CompatibleUpgrade {
  return { compatibilityId, note, option };
}

// ─── Escenario 1: ya cumple ────────────────────────────────────────────
export const PRODUCT_1_DIRECT_MATCH = buildProduct({
  id: "10000000-0000-0000-0000-000000000001",
  title: "[SEED] Dell Latitude 5490",
  brand: "Dell",
  model: "Latitude 5490",
  cpu: "Intel Core i5-8350U (8va Gen)",
  ram: 16,
  storage: "512 GB SSD",
  screen: '14" FHD',
  price: 750000,
  stock: 3,
  cpuGeneration: 8,
  gpuType: "integrada",
  touchScreen: false,
  screenSizeInches: 14.0,
  storageGb: 512,
});

// ─── Escenario 2: necesita RAM ──────────────────────────────────────────
export const PRODUCT_2_NEEDS_RAM = buildProduct({
  id: "10000000-0000-0000-0000-000000000002",
  title: "[SEED] Lenovo ThinkPad T480",
  brand: "Lenovo",
  model: "ThinkPad T480",
  cpu: "Intel Core i5-8250U (8va Gen)",
  ram: 8,
  storage: "256 GB SSD",
  screen: '14" FHD',
  price: 620000,
  stock: 2,
  cpuGeneration: 8,
  gpuType: "integrada",
  touchScreen: false,
  screenSizeInches: 14.0,
  storageGb: 256,
});
export const PRODUCT_2_UPGRADES: CompatibleUpgrade[] = [
  compat("c2-ram16", UPGRADE_RAM_16),
  compat("c2-ram32", UPGRADE_RAM_32),
];

// ─── Escenario 3: necesita SSD ───────────────────────────────────────────
export const PRODUCT_3_NEEDS_STORAGE = buildProduct({
  id: "10000000-0000-0000-0000-000000000003",
  title: "[SEED] HP EliteBook 840 G5",
  brand: "HP",
  model: "EliteBook 840 G5",
  cpu: "Intel Core i5-8350U (8va Gen)",
  ram: 16,
  storage: "128 GB SSD",
  screen: '14" FHD',
  price: 680000,
  stock: 4,
  cpuGeneration: 8,
  gpuType: "integrada",
  touchScreen: false,
  screenSizeInches: 14.0,
  storageGb: 128,
});
export const PRODUCT_3_UPGRADES: CompatibleUpgrade[] = [
  compat("c3-ssd256", UPGRADE_SSD_256),
  compat("c3-ssd500", UPGRADE_SSD_500),
];

// ─── Escenario 4: necesita RAM + SSD ─────────────────────────────────────
export const PRODUCT_4_NEEDS_BOTH = buildProduct({
  id: "10000000-0000-0000-0000-000000000004",
  title: "[SEED] Dell Latitude 5491",
  brand: "Dell",
  model: "Latitude 5491",
  cpu: "Intel Core i5-8365U (8va Gen)",
  ram: 8,
  storage: "128 GB SSD",
  screen: '14" FHD',
  price: 640000,
  stock: 5,
  cpuGeneration: 8,
  gpuType: "integrada",
  touchScreen: false,
  screenSizeInches: 14.0,
  storageGb: 128,
});
export const PRODUCT_4_UPGRADES: CompatibleUpgrade[] = [
  compat("c4-ram16", UPGRADE_RAM_16),
  compat("c4-ram32", UPGRADE_RAM_32),
  compat("c4-ssd256", UPGRADE_SSD_256),
  compat("c4-ssd500", UPGRADE_SSD_500, "requiere retirar el SSD SATA original"),
];

// ─── Escenario 5: incompatible (sin ningún upgrade) ──────────────────────
export const PRODUCT_5_INCOMPATIBLE = buildProduct({
  id: "10000000-0000-0000-0000-000000000005",
  title: "[SEED] Acer TravelMate B118",
  brand: "Acer",
  model: "TravelMate B118",
  cpu: "Intel Celeron N3350 (RAM y almacenamiento soldados)",
  ram: 4,
  storage: "128 GB eMMC",
  screen: '11.6" HD',
  price: 480000,
  stock: 6,
  cpuGeneration: null,
  gpuType: "integrada",
  touchScreen: false,
  screenSizeInches: 11.6,
  storageGb: 128,
});

// ─── Escenario 6: agotado ─────────────────────────────────────────────────
export const PRODUCT_6_OUT_OF_STOCK = buildProduct({
  id: "10000000-0000-0000-0000-000000000006",
  title: "[SEED] Lenovo ThinkPad T14",
  brand: "Lenovo",
  model: "ThinkPad T14",
  cpu: "Intel Core i7-10510U (10ma Gen)",
  ram: 16,
  storage: "512 GB SSD",
  screen: '14" FHD',
  price: 980000,
  stock: 0,
  cpuGeneration: 10,
  gpuType: "integrada",
  touchScreen: false,
  screenSizeInches: 14.0,
  storageGb: 512,
});

// ─── Escenario 7: sobre presupuesto ──────────────────────────────────────
export const PRODUCT_7_OVER_BUDGET = buildProduct({
  id: "10000000-0000-0000-0000-000000000007",
  title: "[SEED] Dell XPS 13 9310 Premium",
  brand: "Dell",
  model: "XPS 13 9310",
  cpu: "Intel Core i7-1165G7 (11va Gen)",
  ram: 16,
  storage: "512 GB SSD",
  screen: '13.3" 4K Touch',
  price: 2500000,
  stock: 2,
  cpuGeneration: 11,
  gpuType: "dedicada",
  gpuModel: "NVIDIA GeForce MX450",
  touchScreen: true,
  screenSizeInches: 13.3,
  storageGb: 512,
});

export function candidate(product: Product, compatibleUpgrades: CompatibleUpgrade[] = []): ProductCandidate {
  return { product, compatibleUpgrades };
}

/** Los 7 candidatos, en el mismo orden que scripts/seed-staging.mjs. */
export const ALL_SEED_CANDIDATES: ProductCandidate[] = [
  candidate(PRODUCT_1_DIRECT_MATCH),
  candidate(PRODUCT_2_NEEDS_RAM, PRODUCT_2_UPGRADES),
  candidate(PRODUCT_3_NEEDS_STORAGE, PRODUCT_3_UPGRADES),
  candidate(PRODUCT_4_NEEDS_BOTH, PRODUCT_4_UPGRADES),
  candidate(PRODUCT_5_INCOMPATIBLE),
  candidate(PRODUCT_6_OUT_OF_STOCK),
  candidate(PRODUCT_7_OVER_BUDGET),
];

/** Requisitos "típicos" usados por defecto en varios tests — 14"+, i5 8va+, 16GB/500GB, sin GPU/touch específicos. */
export const TYPICAL_REQUIREMENTS = {
  budgetMax: 800_000,
  ramMinGb: 16,
  storageMinGb: 500,
  cpuGenerationMin: 8,
  gpu: "cualquiera" as const,
  touch: "cualquiera" as const,
};
