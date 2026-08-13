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
 * A diferencia de las otras 3, esta requiere un cliente AUTENTICADO con
 * privilegios — quote_requests no tiene ninguna policy de lectura pública
 * (ver supabase/migrations/20260812223300_quote_requests.sql): con la
 * anon key sin sesión, cualquier operación aquí es denegada por RLS.
 * Dos clientes válidos, según quién llama:
 *   - el cliente admin (service_role) — B4, creación pública de
 *     cotizaciones, donde no hay sesión de usuario.
 *   - un cliente scoped con el access_token de un usuario verificado
 *     is_admin=true — B6 (panel admin), donde la policy "quote_requests
 *     admin manage" (for all, to authenticated, is_admin) ya cubre
 *     list/updateStatus sin necesitar service_role.
 *
 * Preparada para B4/B6 (Server Actions) — B2 no decide CUÁNDO se llama
 * cada método, solo provee el mecanismo.
 */
export interface ListQuoteRequestsFilter {
  status?: QuoteStatus;
  /** Búsqueda parcial, insensible a mayúsculas (punto 15 de B6 — opcional). */
  codeSearch?: string;
}

export interface QuoteRequestsRepository {
  findByCode(code: string): Promise<QuoteRequest | null>;
  create(input: CreateQuoteRequestInput): Promise<QuoteRequest>;
  /** Más recientes primero (B6, panel admin). */
  list(filter?: ListQuoteRequestsFilter): Promise<QuoteRequest[]>;
  /** Server-side siempre valida contra los 7 estados aprobados — ver personalizadorAdmin/validation.ts. */
  updateStatus(id: string, status: QuoteStatus): Promise<QuoteRequest>;
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

    async list(filter) {
      let query = adminClient.from("quote_requests").select(SELECT_COLUMNS).order("created_at", { ascending: false });
      if (filter?.status) query = query.eq("status", filter.status);
      if (filter?.codeSearch) query = query.ilike("code", `%${filter.codeSearch}%`);

      const { data, error } = await query.returns<QuoteRequestRow[]>();

      if (error) {
        throw new RepositoryError("QuoteRequestsRepository.list falló", error);
      }
      return (data ?? []).map(mapRow);
    },

    async updateStatus(id, status) {
      const { data, error } = await adminClient
        .from("quote_requests")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select(SELECT_COLUMNS)
        .single<QuoteRequestRow>();

      if (error) {
        throw new RepositoryError(`QuoteRequestsRepository.updateStatus(${id}) falló`, error);
      }
      return mapRow(data);
    },
  };
}
