/**
 * Mapeo de tipos internos (B2/B3) a DTOs serializables — la única capa que
 * decide qué campos cruzan el límite servidor→cliente.
 */
import type { MatchResult } from "../personalizador";
import type { QuoteRequest } from "../../types/quote";
import type { PublicQuoteDTO, SearchOptionDTO, SearchOptionUpgradeDTO } from "./types";

function mapUpgrades(
  upgrades: { category: "ram" | "storage"; label: string; value: number; extraCost: number }[]
): SearchOptionUpgradeDTO[] {
  return upgrades.map((u) => ({
    category: u.category,
    label: u.label,
    value: u.value,
    extraCost: u.extraCost,
  }));
}

export function toSearchOptionDTO(result: MatchResult): SearchOptionDTO {
  return {
    productId: result.product.id,
    title: result.product.title,
    brand: result.product.brand,
    model: result.product.model,
    cpu: result.product.cpu,
    screen: result.product.screen,
    images: result.product.images,
    classification: result.classification,
    basePrice: result.basePrice,
    finalPrice: result.finalPrice,
    budgetStatus: result.budgetStatus,
    stockStatus: result.stockStatus,
    selectedUpgrades: mapUpgrades(result.selectedUpgrades),
    finalConfiguration: result.finalConfiguration,
    reasons: result.reasons,
  };
}

/**
 * DTO público de una cotización — NUNCA la fila completa de quote_requests.
 * Excluye deliberadamente: id (uuid interno — ver comentario en la
 * migración de quote_requests), productId (uuid interno; el snapshot ya
 * trae toda la info humana del producto), customerCity/customerNote
 * (privacidad — no hace falta devolverlos para que el cliente vea su
 * cotización), channel, updatedAt.
 */
export function toPublicQuoteDTO(quote: QuoteRequest): PublicQuoteDTO {
  return {
    code: quote.code,
    status: quote.status,
    isSpecialRequest: quote.isSpecialRequest,
    requestedConfig: quote.requestedConfig,
    product: quote.baseConfigSnapshot
      ? {
          title: quote.baseConfigSnapshot.title,
          brand: quote.baseConfigSnapshot.brand,
          model: quote.baseConfigSnapshot.model,
          cpu: quote.baseConfigSnapshot.cpu,
          ram: quote.baseConfigSnapshot.ram,
          storage: quote.baseConfigSnapshot.storage,
          screen: quote.baseConfigSnapshot.screen,
          condition: quote.baseConfigSnapshot.condition,
          image: quote.baseConfigSnapshot.image,
        }
      : null,
    selectedUpgrades: quote.selectedUpgradesSnapshot.map((u) => ({
      category: u.category as "ram" | "storage",
      label: u.label,
      value: u.value,
      extraCost: u.extra_cost,
    })),
    basePrice: quote.basePriceSnapshot,
    finalPrice: quote.estimatedPrice,
    createdAt: quote.createdAt ? quote.createdAt.toISOString() : null,
    expiresAt: quote.expiresAt ? quote.expiresAt.toISOString() : null,
  };
}
