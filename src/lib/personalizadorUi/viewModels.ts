/**
 * Mapeo puro de datos de B4 (SearchOptionDTO / PublicQuoteDTO) a formas
 * listas para pintar — nunca recalcula precio ni decide compatibilidad,
 * solo traduce lo que B3/B4 ya decidieron a texto/tono de UI.
 */
import type { BudgetStatus, StockStatus, UpgradeClassification } from "../personalizador";

export type BadgeTone = "positive" | "warning" | "negative";

export interface BadgeViewModel {
  label: string;
  tone: BadgeTone;
}

/** Punto 8 del pedido: nunca esconder que un resultado supera el presupuesto. */
export function budgetBadge(status: BudgetStatus): BadgeViewModel {
  switch (status) {
    case "WITHIN_BUDGET":
      return { label: "Dentro de tu presupuesto", tone: "positive" };
    case "WITHIN_TOLERANCE":
      return { label: "Un poco por encima de tu presupuesto", tone: "warning" };
    case "OVER_BUDGET":
      return { label: "Fuera de tu presupuesto", tone: "negative" };
  }
}

/** Punto 9 del pedido: stock=0 nunca puede decir "Disponible". */
export function stockBadge(status: StockStatus): BadgeViewModel {
  switch (status) {
    case "AVAILABLE":
      return { label: "Disponible", tone: "positive" };
    case "OUT_OF_STOCK":
      return { label: "Actualmente agotado", tone: "negative" };
  }
}

export function classificationLabel(classification: UpgradeClassification): string {
  switch (classification) {
    case "DIRECT_MATCH":
      return "Cumple tal como está";
    case "RAM_UPGRADE_MATCH":
      return "Con mejora de RAM";
    case "STORAGE_UPGRADE_MATCH":
      return "Con mejora de almacenamiento";
    case "RAM_AND_STORAGE_UPGRADE_MATCH":
      return "Con mejora de RAM y almacenamiento";
  }
}

export interface PriceBreakdownRow {
  label: string;
  amount: number;
}

export interface PriceBreakdownViewModel {
  rows: PriceBreakdownRow[];
  total: number;
}

export interface PriceBreakdownInput {
  basePrice: number | null;
  selectedUpgrades: { label: string; extraCost: number }[];
  finalPrice: number | null;
}

/**
 * Punto 7 del pedido: SOLO presenta lo que B4 ya devolvió — nunca suma de
 * nuevo con datos propios. null cuando no hay precio (cotización especial).
 */
export function buildPriceBreakdown(input: PriceBreakdownInput): PriceBreakdownViewModel | null {
  if (input.basePrice === null || input.finalPrice === null) return null;

  const rows: PriceBreakdownRow[] = [
    { label: "Equipo base", amount: input.basePrice },
    ...input.selectedUpgrades.map((u) => ({ label: u.label, amount: u.extraCost })),
  ];

  return { rows, total: input.finalPrice };
}

const PLACEHOLDER_IMAGE = "/placeholder.jpg";

/** Punto 14 del pedido: los [SEED] no tienen imágenes — nunca romper con una URL vacía. */
export function resolveImageUrl(images: string[]): string {
  const first = images.find((url) => url && url.trim().length > 0);
  return first ?? PLACEHOLDER_IMAGE;
}
