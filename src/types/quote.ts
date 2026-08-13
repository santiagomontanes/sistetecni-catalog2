// Corresponde al esquema real desplegado en STAGING:
// supabase/migrations/20260812223300_quote_requests.sql

export type QuoteStatus =
  | "nueva"
  | "en_revision"
  | "contactada"
  | "cotizada"
  | "aceptada"
  | "rechazada"
  | "expirada";

/**
 * Snapshot de un upgrade elegido, congelado en el momento de la cotización.
 * Deliberadamente NO es UpgradeOption completo — solo lo que
 * selected_upgrades_snapshot realmente guarda (ver migración).
 */
export interface QuoteUpgradeSnapshot {
  category: string;
  label: string;
  value: number;
  extra_cost: number;
}

/**
 * Snapshot de la configuración base del producto en el momento de la
 * cotización. Estructura definida en docs/fase2a-personalizador-diseno.md
 * §12 — se tipa aquí como objeto conocido en vez de Record<string, unknown>
 * porque su forma SÍ está definida, a diferencia de requestedConfig (abajo).
 */
export interface QuoteBaseConfigSnapshot {
  title: string;
  brand: string;
  model: string;
  cpu: string;
  ram: number;
  storage: string;
  screen: string;
  condition: string;
  image: string | null;
}

/**
 * Lo que el cliente pidió. Forma exacta pendiente del motor de matching
 * (Fase 2B/B3, tipo RequirementProfile) — se tipa como registro estructurado
 * en vez de `any` porque en tiempo de ejecución siempre es un objeto JSON,
 * nunca un valor arbitrario; B3 podrá refinarlo a un tipo más estricto sin
 * romper este archivo.
 */
export type QuoteRequestedConfig = Record<string, unknown>;

export interface QuoteRequest {
  id: string;
  code: string;
  /** null solo cuando isSpecialRequest es true (sin producto base compatible). */
  productId: string | null;
  isSpecialRequest: boolean;

  basePriceSnapshot: number | null;
  baseConfigSnapshot: QuoteBaseConfigSnapshot | null;
  requestedConfig: QuoteRequestedConfig;
  selectedUpgradesSnapshot: QuoteUpgradeSnapshot[];

  estimatedPrice: number | null;
  customerBudget: number | null;
  /** (D5) único dato de contacto pre-WhatsApp. Nunca nombre ni teléfono. */
  customerCity: string | null;
  customerNote: string | null;

  status: QuoteStatus;
  channel: string;

  createdAt: Date | null;
  updatedAt: Date | null;
  expiresAt: Date | null;
}

/**
 * Lo que hace falta para crear una cotización — excluye todo lo que la
 * base de datos genera (id, createdAt) o que la aplicación calcula antes
 * de llamar al repositorio (code, updatedAt se gestiona explícitamente en
 * cada UPDATE posterior, no en la creación).
 */
export interface CreateQuoteRequestInput {
  code: string;
  productId: string | null;
  isSpecialRequest: boolean;
  basePriceSnapshot: number | null;
  baseConfigSnapshot: QuoteBaseConfigSnapshot | null;
  requestedConfig: QuoteRequestedConfig;
  selectedUpgradesSnapshot: QuoteUpgradeSnapshot[];
  estimatedPrice: number | null;
  customerBudget: number | null;
  customerCity: string | null;
  customerNote: string | null;
  expiresAt: Date | null;
}
