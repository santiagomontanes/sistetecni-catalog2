/**
 * Orquestación de quote_requests para el panel admin (B6). Lectura y
 * cambio de estado — NUNCA recalcula precios: toda la información sale
 * del snapshot ya guardado (buildQuoteSnapshotFromMatch/
 * buildSpecialQuoteSnapshot, B3), ver toAdminQuoteDetailDTO.
 */
import { isValidQuoteCodeFormat } from "../personalizador";
import type { QuoteRequestsRepository, ListQuoteRequestsFilter } from "../repositories/quoteRequests.repository";
import { listQuotesFilterSchema, updateQuoteStatusSchema, formatZodIssues } from "./validation";
import { toAdminQuoteListItemDTO, toAdminQuoteDetailDTO } from "./dto";
import type { AdminResult, AdminQuoteDetailDTO, AdminQuoteListItemDTO } from "./types";

export async function listQuotesAdmin(
  rawFilter: unknown,
  repo: QuoteRequestsRepository
): Promise<AdminResult<AdminQuoteListItemDTO[]>> {
  const parsed = listQuotesFilterSchema.safeParse(rawFilter ?? {});
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_ERROR", issues: formatZodIssues(parsed.error) };
  }
  const filter: ListQuoteRequestsFilter = parsed.data;
  const quotes = await repo.list(filter);
  return { ok: true, data: quotes.map((q) => toAdminQuoteListItemDTO(q)) };
}

export async function getQuoteDetailAdmin(
  code: unknown,
  repo: QuoteRequestsRepository
): Promise<AdminResult<AdminQuoteDetailDTO>> {
  if (typeof code !== "string" || !isValidQuoteCodeFormat(code)) {
    return { ok: false, error: "VALIDATION_ERROR", issues: ["code: formato inválido."] };
  }
  const quote = await repo.findByCode(code);
  if (!quote) {
    return { ok: false, error: "NOT_FOUND" };
  }
  return { ok: true, data: toAdminQuoteDetailDTO(quote) };
}

export async function updateQuoteStatusAdmin(
  rawInput: unknown,
  repo: QuoteRequestsRepository
): Promise<AdminResult<AdminQuoteDetailDTO>> {
  const parsed = updateQuoteStatusSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_ERROR", issues: formatZodIssues(parsed.error) };
  }
  const updated = await repo.updateStatus(parsed.data.quoteId, parsed.data.status);
  return { ok: true, data: toAdminQuoteDetailDTO(updated) };
}
