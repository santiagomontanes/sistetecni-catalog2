import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  QuoteRequest,
  QuoteStatus,
  CreateQuoteRequestInput,
  QuoteBaseConfigSnapshot,
  QuoteRequestedConfig,
  QuoteUpgradeSnapshot,
} from "../../types/quote";
import { RepositoryError } from "./errors";

/**
 * A diferencia de las otras 3, esta SIEMPRE requiere el cliente admin
 * (service_role) — quote_requests no tiene ninguna policy de lectura
 * pública (ver supabase/migrations/20260812223300_quote_requests.sql):
 * con la anon key, cualquier operación aquí sería denegada por RLS.
 *
 * Preparada para B4 (Server Actions) — B2 no decide CUÁNDO se llama
 * create(), solo provee el mecanismo.
 */
export interface QuoteRequestsRepository {
  findByCode(code: string): Promise<QuoteRequest | null>;
  create(input: CreateQuoteRequestInput): Promise<QuoteRequest>;
}

const SELECT_COLUMNS =
  "id,code,product_id,is_special_request,base_price_snapshot,base_config_snapshot," +
  "requested_config,selected_upgrades_snapshot,estimated_price,customer_budget," +
  "customer_city,customer_note,status,channel,created_at,updated_at,expires_at";

interface QuoteRequestRow {
  id: string;
  code: string;
  product_id: string | null;
  is_special_request: boolean;
  base_price_snapshot: number | null;
  base_config_snapshot: QuoteBaseConfigSnapshot | null;
  requested_config: QuoteRequestedConfig;
  selected_upgrades_snapshot: QuoteUpgradeSnapshot[];
  estimated_price: number | null;
  customer_budget: number | null;
  customer_city: string | null;
  customer_note: string | null;
  status: string;
  channel: string;
  created_at: string | null;
  updated_at: string | null;
  expires_at: string | null;
}

function mapRow(row: QuoteRequestRow): QuoteRequest {
  return {
    id: row.id,
    code: row.code,
    productId: row.product_id,
    isSpecialRequest: row.is_special_request,
    basePriceSnapshot: row.base_price_snapshot,
    baseConfigSnapshot: row.base_config_snapshot,
    requestedConfig: row.requested_config,
    selectedUpgradesSnapshot: row.selected_upgrades_snapshot ?? [],
    estimatedPrice: row.estimated_price,
    customerBudget: row.customer_budget,
    customerCity: row.customer_city,
    customerNote: row.customer_note,
    status: row.status as QuoteStatus,
    channel: row.channel,
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
  };
}

export function createQuoteRequestsRepository(
  adminClient: SupabaseClient
): QuoteRequestsRepository {
  return {
    async findByCode(code) {
      const { data, error } = await adminClient
        .from("quote_requests")
        .select(SELECT_COLUMNS)
        .eq("code", code)
        .maybeSingle<QuoteRequestRow>();

      if (error) {
        throw new RepositoryError(`QuoteRequestsRepository.findByCode(${code}) falló`, error);
      }
      return data ? mapRow(data) : null;
    },

    async create(input) {
      const { data, error } = await adminClient
        .from("quote_requests")
        .insert({
          code: input.code,
          product_id: input.productId,
          is_special_request: input.isSpecialRequest,
          base_price_snapshot: input.basePriceSnapshot,
          base_config_snapshot: input.baseConfigSnapshot,
          requested_config: input.requestedConfig,
          selected_upgrades_snapshot: input.selectedUpgradesSnapshot,
          estimated_price: input.estimatedPrice,
          customer_budget: input.customerBudget,
          customer_city: input.customerCity,
          customer_note: input.customerNote,
          expires_at: input.expiresAt?.toISOString() ?? null,
        })
        .select(SELECT_COLUMNS)
        .single<QuoteRequestRow>();

      if (error) {
        throw new RepositoryError(
          `QuoteRequestsRepository.create falló (code=${input.code})`,
          error
        );
      }
      return mapRow(data);
    },
  };
}
