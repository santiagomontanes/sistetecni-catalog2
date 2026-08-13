/**
 * DTOs del panel admin — a diferencia del DTO público de B4
 * (toPublicQuoteDTO), aquí SÍ se incluyen id, customerCity y customerNote:
 * quien los ve ya pasó por requireAdmin(). Sigue sin recalcular nada — todo
 * sale del snapshot ya guardado (punto 7 del pedido: "todo debe salir del
 * snapshot guardado, NO recalcular precios actuales").
 */
import type { QuoteRequest } from "../../types/quote";
import type { AdminQuoteDetailDTO, AdminQuoteListItemDTO } from "./types";
import { isQuoteVisuallyExpired } from "./types";

export function toAdminQuoteListItemDTO(quote: QuoteRequest, now: Date = new Date()): AdminQuoteListItemDTO {
  return {
    id: quote.id,
    code: quote.code,
    createdAt: quote.createdAt ? quote.createdAt.toISOString() : null,
    status: quote.status,
    isSpecialRequest: quote.isSpecialRequest,
    productTitle: quote.baseConfigSnapshot?.title ?? null,
    estimatedPrice: quote.estimatedPrice,
    customerCity: quote.customerCity,
    expiresAt: quote.expiresAt ? quote.expiresAt.toISOString() : null,
    isVisuallyExpired: isQuoteVisuallyExpired(quote.expiresAt, quote.status, now),
  };
}

export function toAdminQuoteDetailDTO(quote: QuoteRequest, now: Date = new Date()): AdminQuoteDetailDTO {
  return {
    ...toAdminQuoteListItemDTO(quote, now),
    productId: quote.productId,
    requestedConfig: quote.requestedConfig,
    baseConfigSnapshot: quote.baseConfigSnapshot,
    basePriceSnapshot: quote.basePriceSnapshot,
    selectedUpgradesSnapshot: quote.selectedUpgradesSnapshot,
    customerBudget: quote.customerBudget,
    customerNote: quote.customerNote,
  };
}
