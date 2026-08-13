/**
 * Construcción del snapshot que B4 guardará en quote_requests — pura, no
 * escribe nada. Congela TODO lo que una cotización histórica necesita
 * para seguir siendo reproducible aunque mañana cambien products/
 * upgrade_options: precio base, configuración base, upgrades elegidos
 * (con su costo de ESTE momento), configuración final, precio final, y
 * los requisitos originales del cliente.
 *
 * `now` es inyectable (por defecto `new Date()`) para que el cálculo de
 * expiración (D6, 7 días) sea determinista en tests — igual criterio que
 * la aleatoriedad inyectable de code.ts.
 */
import type {
  CreateQuoteRequestInput,
  QuoteBaseConfigSnapshot,
  QuoteUpgradeSnapshot,
} from "../../types/quote";
import type { CustomerRequirements, MatchResult } from "./types";

const EXPIRATION_DAYS = 7; // D6, aprobada

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

function toBaseConfigSnapshot(result: MatchResult): QuoteBaseConfigSnapshot {
  return {
    title: result.product.title,
    brand: result.product.brand,
    model: result.product.model,
    cpu: result.product.cpu,
    ram: result.product.ram,
    storage: result.product.storage,
    screen: result.product.screen,
    condition: result.product.condition,
    image: result.product.images[0] ?? null,
  };
}

function toUpgradeSnapshots(result: MatchResult): QuoteUpgradeSnapshot[] {
  return result.selectedUpgrades.map((u) => ({
    category: u.category,
    label: u.label,
    value: u.value,
    extra_cost: u.extraCost,
  }));
}

/** requestedConfig serializable de los requisitos originales — nada inventado, ecos del input. */
function toRequestedConfig(requirements: CustomerRequirements): Record<string, unknown> {
  return { ...requirements };
}

export function buildQuoteSnapshotFromMatch(
  result: MatchResult,
  requirements: CustomerRequirements,
  code: string,
  now: Date = new Date()
): CreateQuoteRequestInput {
  return {
    code,
    productId: result.product.id,
    isSpecialRequest: false,
    basePriceSnapshot: result.basePrice,
    baseConfigSnapshot: toBaseConfigSnapshot(result),
    requestedConfig: toRequestedConfig(requirements),
    selectedUpgradesSnapshot: toUpgradeSnapshots(result),
    estimatedPrice: result.finalPrice,
    customerBudget: requirements.budgetMax,
    customerCity: null, // (D5) lo completa B4/B5 si el cliente lo dio — B3 no lo conoce
    customerNote: null,
    expiresAt: addDays(now, EXPIRATION_DAYS),
  };
}

export function buildSpecialQuoteSnapshot(
  requirements: CustomerRequirements,
  code: string,
  now: Date = new Date()
): CreateQuoteRequestInput {
  return {
    code,
    productId: null,
    isSpecialRequest: true,
    basePriceSnapshot: null,
    baseConfigSnapshot: null,
    requestedConfig: toRequestedConfig(requirements),
    selectedUpgradesSnapshot: [],
    estimatedPrice: null,
    customerBudget: requirements.budgetMax,
    customerCity: null,
    customerNote: null,
    expiresAt: addDays(now, EXPIRATION_DAYS),
  };
}
