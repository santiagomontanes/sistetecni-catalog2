/**
 * Tipos de la capa de orquestación (Fase 2B/B4). A diferencia de
 * src/lib/personalizador/ (B3, puro), este módulo SÍ depende de los
 * repositorios de B2 (Supabase) — es la pieza que conecta ambos. No
 * duplica ninguna decisión de matching/precio/compatibilidad: siempre
 * delega en las funciones de B3 (matchProducts, evaluateCandidate,
 * buildQuoteSnapshotFromMatch, buildSpecialQuoteSnapshot, generateQuoteCode).
 */
import type {
  BudgetStatus,
  MatchReasonCode,
  StockStatus,
  UpgradeClassification,
} from "../personalizador";
import type { QuoteRequestedConfig, QuoteStatus } from "../../types/quote";
import type { GpuType } from "../../types/product";

// ─── Búsqueda (buscarOpcionesPersonalizadas) ────────────────────────────

export interface SearchOptionUpgradeDTO {
  category: "ram" | "storage";
  label: string;
  value: number;
  extraCost: number;
}

/**
 * Vista serializable de un MatchResult — solo primitivos, para el wizard
 * (B5). `baseRamGb`/`baseStorage`/`gpuType`/`touchScreen` son la
 * configuración ORIGINAL del equipo (antes de cualquier upgrade) —
 * necesarios para que la UI pueda mostrar "qué traía" vs "tu
 * configuración final" (finalConfiguration) sin volver a consultar
 * Supabase ni adivinar un valor: B5 no tiene otra fuente para esto.
 * Agregado en B5 sobre el DTO de B4 (aditivo, no rompe nada existente).
 */
export interface SearchOptionDTO {
  productId: string;
  title: string;
  brand: string;
  model: string;
  cpu: string;
  screen: string;
  images: string[];
  classification: UpgradeClassification;
  basePrice: number;
  finalPrice: number;
  budgetStatus: BudgetStatus;
  stockStatus: StockStatus;
  selectedUpgrades: SearchOptionUpgradeDTO[];
  baseRamGb: number;
  baseStorage: string;
  gpuType: GpuType | null;
  touchScreen: boolean | null;
  finalConfiguration: { ramGb: number; storageGb: number };
  reasons: MatchReasonCode[];
}

export interface SearchOptionsResponse {
  available: SearchOptionDTO[];
  referenceOnly: SearchOptionDTO[];
  specialQuoteRequired: boolean;
}

/**
 * "VALIDATION_ERROR" cubre tanto un input con forma inválida como un
 * honeypot disparado — a propósito la misma forma de respuesta, para que
 * ningún cliente (ni un bot probando) pueda distinguir un caso del otro
 * inspeccionando la respuesta (ver README de esta carpeta).
 */
export type SearchOptionsResult =
  | { ok: true; data: SearchOptionsResponse }
  | { ok: false; error: "VALIDATION_ERROR"; issues: string[] }
  /** Solo la producen los wrappers "use server" (src/app/personalizador/actions.ts) al atrapar un error inesperado — nunca esta capa de orquestación. */
  | { ok: false; error: "INTERNAL_ERROR" };

// ─── Creación (crearCotizacionPersonalizada) ────────────────────────────

/**
 * Lo que el servidor acepta como intención del cliente — NUNCA como
 * autoridad de precio/compatibilidad. `selectedProductId` es solo un
 * puntero: "evalúa este producto de nuevo, desde cero, ahora mismo".
 * Cuando es null, `wantsSpecialQuote` debe ser true explícitamente — el
 * servidor nunca asume cotización especial por ausencia de selección.
 */
export interface CreateQuoteInput {
  requirements: unknown;
  selectedProductId?: string | null;
  wantsSpecialQuote?: boolean;
  customerCity?: string | null;
}

export interface PublicQuoteDTO {
  code: string;
  status: QuoteStatus;
  isSpecialRequest: boolean;
  requestedConfig: QuoteRequestedConfig;
  product: {
    title: string;
    brand: string;
    model: string;
    cpu: string;
    ram: number;
    storage: string;
    screen: string;
    condition: string;
    image: string | null;
  } | null;
  selectedUpgrades: SearchOptionUpgradeDTO[];
  basePrice: number | null;
  finalPrice: number | null;
  createdAt: string | null;
  expiresAt: string | null;
}

export type CreateQuoteResult =
  | { ok: true; data: PublicQuoteDTO }
  | { ok: false; error: "VALIDATION_ERROR"; issues: string[] }
  | { ok: false; error: "PRODUCT_NOT_ELIGIBLE" }
  | { ok: false; error: "SPECIAL_QUOTE_NOT_APPLICABLE" }
  | { ok: false; error: "CODE_GENERATION_FAILED" }
  /** Solo la producen los wrappers "use server" (src/app/personalizador/actions.ts) al atrapar un error inesperado — nunca esta capa de orquestación. */
  | { ok: false; error: "INTERNAL_ERROR" };
