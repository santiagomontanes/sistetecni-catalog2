import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateProductUnitInput,
  ProductUnit,
  ProductUnitStatus,
} from "../../types/erp";
import { RepositoryError } from "./errors";

export interface ProductUnitsRepository {
  create(input: CreateProductUnitInput): Promise<ProductUnit>;
  findById(id: string): Promise<ProductUnit | null>;
  findBySerial(serialNumber: string): Promise<ProductUnit | null>;
  findByUnitCode(unitCode: string): Promise<ProductUnit | null>;
  listByProduct(productId: string): Promise<ProductUnit[]>;
  listByStatus(status: ProductUnitStatus, limit?: number): Promise<ProductUnit[]>;
}

const UNIT_COLUMNS =
  "id,product_id,unit_code,serial_number,status,acquisition_cost_cop,battery_health_percent," +
  "storage_health_percent,spec_overrides,images,notes,received_at,sold_at,created_by,created_at,updated_at";

interface ProductUnitRow {
  id: string;
  product_id: string;
  unit_code: string;
  serial_number: string | null;
  status: ProductUnitStatus;
  acquisition_cost_cop: number | null;
  battery_health_percent: number | null;
  storage_health_percent: number | null;
  spec_overrides: Record<string, unknown> | null;
  images: string[] | null;
  notes: string | null;
  received_at: string | null;
  sold_at: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function cleanOptional(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapRow(row: ProductUnitRow): ProductUnit {
  return {
    id: row.id,
    productId: row.product_id,
    unitCode: row.unit_code,
    serialNumber: row.serial_number,
    status: row.status,
    acquisitionCostCop:
      row.acquisition_cost_cop === null ? null : Number(row.acquisition_cost_cop),
    batteryHealthPercent: row.battery_health_percent,
    storageHealthPercent: row.storage_health_percent,
    specOverrides: row.spec_overrides ?? {},
    images: row.images ?? [],
    notes: row.notes,
    receivedAt: row.received_at ? new Date(row.received_at) : null,
    soldAt: row.sold_at ? new Date(row.sold_at) : null,
    createdBy: row.created_by,
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  };
}

export function createProductUnitsRepository(client: SupabaseClient): ProductUnitsRepository {
  return {
    async create(input) {
      const unitCode = input.unitCode.trim();
      if (!unitCode) throw new RepositoryError("ProductUnitsRepository.create: unitCode vacío");

      const payload = {
        product_id: input.productId,
        unit_code: unitCode,
        serial_number: cleanOptional(input.serialNumber),
        status: "received" as ProductUnitStatus,
        acquisition_cost_cop: input.acquisitionCostCop ?? null,
        battery_health_percent: input.batteryHealthPercent ?? null,
        storage_health_percent: input.storageHealthPercent ?? null,
        spec_overrides: input.specOverrides ?? {},
        images: input.images ?? [],
        notes: cleanOptional(input.notes),
        created_by: input.createdBy ?? null,
      };

      const { data, error } = await client
        .from("product_units")
        .insert(payload)
        .select(UNIT_COLUMNS)
        .single<ProductUnitRow>();

      if (error || !data) {
        throw new RepositoryError("ProductUnitsRepository.create falló", error);
      }
      return mapRow(data);
    },

    async findById(id) {
      const { data, error } = await client
        .from("product_units")
        .select(UNIT_COLUMNS)
        .eq("id", id)
        .maybeSingle<ProductUnitRow>();

      if (error) throw new RepositoryError(`ProductUnitsRepository.findById(${id}) falló`, error);
      return data ? mapRow(data) : null;
    },

    async findBySerial(serialNumber) {
      const serial = serialNumber.trim();
      if (!serial) return null;

      const { data, error } = await client
        .from("product_units")
        .select(UNIT_COLUMNS)
        .ilike("serial_number", serial)
        .maybeSingle<ProductUnitRow>();

      if (error) {
        throw new RepositoryError(`ProductUnitsRepository.findBySerial(${serial}) falló`, error);
      }
      return data ? mapRow(data) : null;
    },

    async findByUnitCode(unitCode) {
      const code = unitCode.trim();
      if (!code) return null;

      const { data, error } = await client
        .from("product_units")
        .select(UNIT_COLUMNS)
        .eq("unit_code", code)
        .maybeSingle<ProductUnitRow>();

      if (error) {
        throw new RepositoryError(`ProductUnitsRepository.findByUnitCode(${code}) falló`, error);
      }
      return data ? mapRow(data) : null;
    },

    async listByProduct(productId) {
      const { data, error } = await client
        .from("product_units")
        .select(UNIT_COLUMNS)
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .returns<ProductUnitRow[]>();

      if (error) {
        throw new RepositoryError(`ProductUnitsRepository.listByProduct(${productId}) falló`, error);
      }
      return (data ?? []).map(mapRow);
    },

    async listByStatus(status, limit = 100) {
      const { data, error } = await client
        .from("product_units")
        .select(UNIT_COLUMNS)
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(limit)
        .returns<ProductUnitRow[]>();

      if (error) {
        throw new RepositoryError(`ProductUnitsRepository.listByStatus(${status}) falló`, error);
      }
      return (data ?? []).map(mapRow);
    },
  };
}
