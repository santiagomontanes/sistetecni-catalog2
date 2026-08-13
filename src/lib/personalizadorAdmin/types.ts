import type { QuoteRequestedConfig, QuoteStatus, QuoteUpgradeSnapshot, QuoteBaseConfigSnapshot } from "../../types/quote";

export type AdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: "VALIDATION_ERROR"; issues: string[] }
  | { ok: false; error: "NOT_FOUND" }
  | { ok: false; error: "FORBIDDEN" }
  /** Solo la producen los wrappers "use server" al atrapar un error inesperado — nunca esta capa de orquestación. */
  | { ok: false; error: "INTERNAL_ERROR" };

/** (D14) nunca se borra un upgrade — solo se desactiva. Punto 9: badge "Expirada" calculado, sin cron. */
const TERMINAL_QUOTE_STATUSES: readonly QuoteStatus[] = ["aceptada", "rechazada", "expirada"];

export function isQuoteVisuallyExpired(expiresAt: Date | null, status: QuoteStatus, now: Date): boolean {
  if (!expiresAt) return false;
  if (TERMINAL_QUOTE_STATUSES.includes(status)) return false;
  return expiresAt.getTime() < now.getTime();
}

export interface AdminQuoteListItemDTO {
  id: string;
  code: string;
  createdAt: string | null;
  status: QuoteStatus;
  isSpecialRequest: boolean;
  productTitle: string | null;
  estimatedPrice: number | null;
  customerCity: string | null;
  expiresAt: string | null;
  isVisuallyExpired: boolean;
}

export interface AdminQuoteDetailDTO extends AdminQuoteListItemDTO {
  productId: string | null;
  requestedConfig: QuoteRequestedConfig;
  baseConfigSnapshot: QuoteBaseConfigSnapshot | null;
  basePriceSnapshot: number | null;
  selectedUpgradesSnapshot: QuoteUpgradeSnapshot[];
  customerBudget: number | null;
  customerNote: string | null;
}
