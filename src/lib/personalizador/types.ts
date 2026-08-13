/**
 * Tipos centrales del motor determinista del personalizador (Fase 2B/B3).
 *
 * Este módulo y sus hermanos en src/lib/personalizador/ son lógica de
 * negocio PURA: no importan Supabase, no leen variables de entorno, no
 * usan React, no hacen red. Reciben datos ya tipados (típicamente
 * ensamblados por B4 a partir de los repositorios de B2) y devuelven
 * resultados tipados. Ver README.md de esta carpeta para la arquitectura
 * completa.
 */
import type { Product } from "../../types/product";
import type { CompatibleUpgrade } from "../../types/upgrade";

// ─── A. Requisitos del cliente ──────────────────────────────────────────
//
// Distinción central del diseño: CPU/GPU/touch/pantalla son FILTROS del
// equipo base — nunca se convierten en upgrade. Solo RAM y almacenamiento
// son upgradeables. Esto no es solo una convención: el tipo de abajo
// estructuralmente NO tiene forma de expresar "quiero upgrade de GPU" —
// no existe ningún campo para ello.

export type GpuRequirement = "cualquiera" | "integrada" | "dedicada";
export type TouchRequirement = "cualquiera" | "si" | "no";

export interface ScreenSizeRange {
  minInches?: number;
  maxInches?: number;
}

export interface CustomerRequirements {
  /** Presupuesto máximo declarado por el cliente, en COP, entero > 0. */
  budgetMax: number;
  /** RAM mínima deseada, en GB, entero > 0. Upgradeable. */
  ramMinGb: number;
  /** Almacenamiento mínimo deseado, en GB, entero > 0. Upgradeable. */
  storageMinGb: number;
  /** Generación mínima de CPU. Filtro de equipo BASE — nunca upgrade. */
  cpuGenerationMin?: number;
  /** Filtro de equipo BASE — nunca upgrade. */
  gpu: GpuRequirement;
  /** Filtro de equipo BASE — nunca upgrade. */
  touch: TouchRequirement;
  /** Filtro de equipo BASE — nunca upgrade. */
  screenSize?: ScreenSizeRange;
}

// ─── B. Candidato de entrada ─────────────────────────────────────────────
//
// B3 no consulta Supabase — recibe el producto y sus upgrades compatibles
// YA resueltos (B4 los obtiene de ProductsRepository/
// ProductUpgradeOptionsRepository, ambos de B2). Array vacío en
// compatibleUpgrades es un caso válido: "este producto no admite ningún
// upgrade", no un error.

export interface ProductCandidate {
  product: Product;
  compatibleUpgrades: CompatibleUpgrade[];
}

// ─── C. Clasificación y motivos ─────────────────────────────────────────

/** A–D del brief. E (incompatible) nunca aparece aquí — ver MatchOutcome. */
export type UpgradeClassification =
  | "DIRECT_MATCH"
  | "RAM_UPGRADE_MATCH"
  | "STORAGE_UPGRADE_MATCH"
  | "RAM_AND_STORAGE_UPGRADE_MATCH";

export type BudgetStatus = "WITHIN_BUDGET" | "WITHIN_TOLERANCE" | "OVER_BUDGET";
export type StockStatus = "AVAILABLE" | "OUT_OF_STOCK";

/**
 * Códigos deterministas, nunca texto libre — el motivo exacto de cada
 * decisión, para que B5 pueda traducirlos a mensajes sin que ningún LLM
 * "redacte" por qué un producto fue aceptado o descartado.
 */
export type MatchReasonCode =
  | "CPU_GENERATION_OK"
  | "CPU_GENERATION_TOO_LOW"
  | "CPU_GENERATION_UNKNOWN"
  | "GPU_OK"
  | "GPU_MISMATCH"
  | "GPU_UNKNOWN"
  | "TOUCH_OK"
  | "TOUCH_MISMATCH"
  | "TOUCH_UNKNOWN"
  | "SCREEN_SIZE_OK"
  | "SCREEN_SIZE_OUT_OF_RANGE"
  | "SCREEN_SIZE_UNKNOWN"
  | "RAM_ALREADY_SUFFICIENT"
  | "RAM_UPGRADE_AVAILABLE"
  | "RAM_UPGRADE_UNAVAILABLE"
  | "STORAGE_ALREADY_SUFFICIENT"
  | "STORAGE_UPGRADE_AVAILABLE"
  | "STORAGE_UPGRADE_UNAVAILABLE"
  | "WITHIN_BUDGET"
  | "WITHIN_BUDGET_TOLERANCE"
  | "OVER_BUDGET"
  | "IN_STOCK"
  | "OUT_OF_STOCK";

export interface SelectedUpgrade {
  compatibilityId: string;
  upgradeOptionId: string;
  category: "ram" | "storage";
  label: string;
  value: number;
  extraCost: number;
}

export interface FinalConfiguration {
  ramGb: number;
  storageGb: number;
}

export interface MatchResult {
  product: Product;
  classification: UpgradeClassification;
  basePrice: number;
  selectedUpgrades: SelectedUpgrade[];
  finalConfiguration: FinalConfiguration;
  finalPrice: number;
  budgetStatus: BudgetStatus;
  stockStatus: StockStatus;
  reasons: MatchReasonCode[];
}

/**
 * Resultado completo de una corrida de matching. `available` y
 * `referenceOnly` nunca se mezclan en el mismo array (D7): un agotado
 * jamás puede rankear como si estuviera disponible. `specialQuoteRequired`
 * es true únicamente cuando NINGÚN producto (ni disponible ni agotado)
 * pudo satisfacer los requisitos — ver docs de esta carpeta.
 */
export interface MatchOutcome {
  available: MatchResult[];
  referenceOnly: MatchResult[];
  specialQuoteRequired: boolean;
}
