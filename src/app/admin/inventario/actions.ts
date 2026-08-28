"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/personalizadorAdmin/auth";
import { mapUnexpectedError } from "@/lib/personalizadorAdmin/errorMapping";
import type { AdminResult } from "@/lib/personalizadorAdmin/types";
import { createProductUnitsRepository } from "@/lib/repositories/productUnits.repository";
import { createProductsRepository } from "@/lib/repositories/products.repository";
import { RepositoryError } from "@/lib/repositories/errors";
import {
  inventoryListSchema,
  issuesFromZod,
  productSearchSchema,
  productStockModeSchema,
  receiveProductUnitAdminSchema,
  unitIdSchema,
} from "@/lib/erpAdmin/validation";
import type { AdminInventoryUnitDTO, AdminProductOptionDTO } from "@/lib/erpAdmin/types";
import type { ProductUnit } from "@/types/erp";
import type { Product } from "@/types/product";

function logUnexpectedError(action: string, err: unknown): void {
  const name = err instanceof Error ? err.name : "UnknownError";
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[admin/inventario/actions] "${action}" falló: ${name}: ${message}`);
}

async function withAdmin<T>(
  action: string,
  accessToken: unknown,
  fn: (client: SupabaseClient) => Promise<AdminResult<T>>
): Promise<AdminResult<T>> {
  try {
    const { client } = await requireAdmin(accessToken);
    return await fn(client);
  } catch (err) {
    const mapped = mapUnexpectedError(err);
    if (mapped.error === "INTERNAL_ERROR") logUnexpectedError(action, err);
    return mapped;
  }
}

function productOption(product: Product): AdminProductOptionDTO {
  return {
    id: product.id,
    title: product.title,
    brand: product.brand,
    model: product.model,
    cpu: product.cpu,
    ram: product.ram,
    storage: product.storage,
    stock: product.stock,
    visibleWeb: product.visibleWeb,
    erpStockEnabled: product.erpStockEnabled === true,
  };
}

function unitDTO(unit: ProductUnit, product: Product | undefined): AdminInventoryUnitDTO {
  return {
    id: unit.id,
    unitCode: unit.unitCode,
    serialNumber: unit.serialNumber,
    status: unit.status,
    productId: unit.productId,
    productTitle: product?.title ?? "Producto no disponible",
    productBrand: product?.brand ?? "",
    productModel: product?.model ?? "",
    webStock: product?.stock ?? 0,
    erpStockEnabled: product?.erpStockEnabled === true,
    erpStockSyncedAt: product?.erpStockSyncedAt?.toISOString() ?? null,
    acquisitionCostCop: unit.acquisitionCostCop,
    batteryHealthPercent: unit.batteryHealthPercent,
    storageHealthPercent: unit.storageHealthPercent,
    specOverrides: unit.specOverrides,
    notes: unit.notes,
    receivedAt: unit.receivedAt?.toISOString() ?? null,
  };
}

export async function listInventory(payload: { accessToken: unknown; limit?: unknown }): Promise<AdminResult<{ items: AdminInventoryUnitDTO[] }>> {
  return withAdmin("listInventory", payload.accessToken, async (client) => {
    const parsed = inventoryListSchema.safeParse({ limit: typeof payload.limit === "number" ? payload.limit : 100 });
    if (!parsed.success) return { ok: false, error: "VALIDATION_ERROR", issues: issuesFromZod(parsed.error) };
    const units = await createProductUnitsRepository(client).listRecent(parsed.data.limit);
    const productIds = [...new Set(units.map((unit) => unit.productId))];
    const products = await createProductsRepository(client).findManyByIds(productIds);
    const byId = new Map(products.map((product) => [product.id, product]));
    return { ok: true, data: { items: units.map((unit) => unitDTO(unit, byId.get(unit.productId))) } };
  });
}

export async function searchInventoryProducts(payload: { accessToken: unknown; query: unknown }): Promise<AdminResult<{ items: AdminProductOptionDTO[] }>> {
  return withAdmin("searchInventoryProducts", payload.accessToken, async (client) => {
    const parsed = productSearchSchema.safeParse({ query: payload.query });
    if (!parsed.success) return { ok: false, error: "VALIDATION_ERROR", issues: issuesFromZod(parsed.error) };
    const products = await createProductsRepository(client).search(parsed.data.query, 15);
    return { ok: true, data: { items: products.map(productOption) } };
  });
}

export async function receiveProductUnit(payload: { accessToken: unknown; [key: string]: unknown }): Promise<AdminResult<AdminInventoryUnitDTO>> {
  const { accessToken, ...input } = payload;
  return withAdmin("receiveProductUnit", accessToken, async (client) => {
    const parsed = receiveProductUnitAdminSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "VALIDATION_ERROR", issues: issuesFromZod(parsed.error) };

    const productsRepo = createProductsRepository(client);
    const product = await productsRepo.findById(parsed.data.productId);
    if (!product) return { ok: false, error: "NOT_FOUND" };

    const unitsRepo = createProductUnitsRepository(client);
    if (parsed.data.serialNumber) {
      const existing = await unitsRepo.findBySerial(parsed.data.serialNumber);
      if (existing) return { ok: false, error: "VALIDATION_ERROR", issues: ["Ya existe una unidad con ese número de serial."] };
    }

    const specOverrides: Record<string, unknown> = {};
    if (parsed.data.ramGb !== undefined) specOverrides.ramGb = parsed.data.ramGb;
    if (parsed.data.storageGb !== undefined) specOverrides.storageGb = parsed.data.storageGb;
    if (parsed.data.storageType !== undefined) specOverrides.storageType = parsed.data.storageType;
    if (parsed.data.conditionNotes !== undefined) specOverrides.conditionNotes = parsed.data.conditionNotes;

    const created = await unitsRepo.receive({
      productId: parsed.data.productId,
      serialNumber: parsed.data.serialNumber,
      acquisitionCostCop: parsed.data.acquisitionCostCop,
      batteryHealthPercent: parsed.data.batteryHealthPercent,
      storageHealthPercent: parsed.data.storageHealthPercent,
      specOverrides,
      notes: parsed.data.notes,
    });
    return { ok: true, data: unitDTO(created, product) };
  });
}

export async function markUnitAvailable(payload: { accessToken: unknown; unitId: unknown }): Promise<AdminResult<AdminInventoryUnitDTO>> {
  return withAdmin("markUnitAvailable", payload.accessToken, async (client) => {
    const parsed = unitIdSchema.safeParse(payload.unitId);
    if (!parsed.success) return { ok: false, error: "VALIDATION_ERROR", issues: issuesFromZod(parsed.error) };

    const unitsRepo = createProductUnitsRepository(client);
    const current = await unitsRepo.findById(parsed.data);
    if (!current) return { ok: false, error: "NOT_FOUND" };
    if (!(["received", "inspection", "available"] as string[]).includes(current.status)) {
      return { ok: false, error: "VALIDATION_ERROR", issues: [`${current.unitCode} no puede pasar a disponible desde ${current.status}.`] };
    }

    const updated = await unitsRepo.markAvailable(parsed.data);
    // Si el producto ya usa stock ERP, el trigger de Fase 1D recalculó
    // products.stock dentro de la misma transacción del cambio de estado.
    const product = await createProductsRepository(client).findById(updated.productId);
    return { ok: true, data: unitDTO(updated, product ?? undefined) };
  });
}

export async function setProductStockMode(payload: {
  accessToken: unknown;
  productId: unknown;
  enabled: unknown;
}): Promise<AdminResult<{
  productId: string;
  stock: number;
  erpStockEnabled: boolean;
  erpStockSyncedAt: string | null;
}>> {
  return withAdmin("setProductStockMode", payload.accessToken, async (client) => {
    const parsed = productStockModeSchema.safeParse({
      productId: payload.productId,
      enabled: payload.enabled,
    });
    if (!parsed.success) {
      return { ok: false, error: "VALIDATION_ERROR", issues: issuesFromZod(parsed.error) };
    }

    const productsRepo = createProductsRepository(client);
    const current = await productsRepo.findById(parsed.data.productId);
    if (!current) return { ok: false, error: "NOT_FOUND" };

    const { error } = await client.rpc("erp_set_product_stock_mode", {
      p_product_id: parsed.data.productId,
      p_enabled: parsed.data.enabled,
    });
    if (error) {
      throw new RepositoryError("setProductStockMode: RPC erp_set_product_stock_mode falló", error);
    }

    const updated = await productsRepo.findById(parsed.data.productId);
    if (!updated) return { ok: false, error: "NOT_FOUND" };

    return {
      ok: true,
      data: {
        productId: updated.id,
        stock: updated.stock,
        erpStockEnabled: updated.erpStockEnabled === true,
        erpStockSyncedAt: updated.erpStockSyncedAt?.toISOString() ?? null,
      },
    };
  });
}
