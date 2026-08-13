/**
 * Consulta de una cotización por código — usado por el Route Handler
 * GET /api/cotizaciones/[code]. SIEMPRE lee el snapshot ya guardado
 * (toPublicQuoteDTO solo toca campos de la fila de quote_requests) — NUNCA
 * relee products/upgrade_options para "actualizar" el precio mostrado. Si
 * el producto cambia de precio mañana, esta cotización sigue mostrando el
 * precio congelado en el momento en que se creó, hasta que expire.
 */
import { isValidQuoteCodeFormat } from "../personalizador";
import type { QuoteRequestsRepository } from "../repositories/quoteRequests.repository";
import { toPublicQuoteDTO } from "./mappers";
import type { PublicQuoteDTO } from "./types";

export type QuoteLookupResult =
  | { status: "ok"; data: PublicQuoteDTO }
  | { status: "invalid_format" }
  | { status: "not_found" }
  | { status: "expired"; data: PublicQuoteDTO };

export interface QuoteLookupDeps {
  quoteRequestsRepo: QuoteRequestsRepository;
  /** Inyectable para tests deterministas de expiración. */
  now?: Date;
}

export async function buscarCotizacionPorCodigo(
  code: string,
  deps: QuoteLookupDeps
): Promise<QuoteLookupResult> {
  if (!isValidQuoteCodeFormat(code)) {
    return { status: "invalid_format" };
  }

  const quote = await deps.quoteRequestsRepo.findByCode(code);
  if (!quote) {
    return { status: "not_found" };
  }

  const dto = toPublicQuoteDTO(quote);
  const now = deps.now ?? new Date();
  if (quote.expiresAt && quote.expiresAt.getTime() < now.getTime()) {
    return { status: "expired", data: dto };
  }

  return { status: "ok", data: dto };
}
