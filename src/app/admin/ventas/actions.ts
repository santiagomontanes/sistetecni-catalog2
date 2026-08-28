"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/personalizadorAdmin/auth";
import { mapUnexpectedError } from "@/lib/personalizadorAdmin/errorMapping";
import { createSaleAdmin, listSalesAdmin, getSaleDetailAdmin, searchProductsForSaleAdmin } from "@/lib/salesAdmin";
import { productIdSchema } from "@/lib/salesAdmin/validation";
import type { AdminAvailableUnitDTO } from "@/lib/salesAdmin/types";
import type { AdminResult } from "@/lib/personalizadorAdmin/types";
import { createSalesRepository } from "@/lib/repositories/sales.repository";
import { createProductsRepository } from "@/lib/repositories/products.repository";
import { createProductUnitsRepository } from "@/lib/repositories/productUnits.repository";
import { createCustomersRepository } from "@/lib/repositories/customers.repository";

function logUnexpectedError(action: string, err: unknown): void {
  const name = err instanceof Error ? err.name : "UnknownError";
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[admin/ventas/actions] "${action}" falló de forma inesperada: ${name}: ${message}`);
}

async function withAdmin<T>(
  action: string,
  accessToken: unknown,
  fn: (client: SupabaseClient, userId: string) => Promise<AdminResult<T>>
): Promise<AdminResult<T>> {
  try {
    const { client, userId } = await requireAdmin(accessToken);
    return await fn(client, userId);
  } catch (err) {
    const mapped = mapUnexpectedError(err);
    if (mapped.error === "INTERNAL_ERROR") logUnexpectedError(action, err);
    return mapped;
  }
}

export async function createSale(payload: { accessToken: unknown; [key: string]: unknown }) {
  const { accessToken, ...rest } = payload;
  return withAdmin("createSale", accessToken, (client, userId) =>
    createSaleAdmin(rest, userId, {
      salesRepo: createSalesRepository(client),
      productsRepo: createProductsRepository(client),
      productUnitsRepo: createProductUnitsRepository(client),
      customersRepo: createCustomersRepository(client),
    })
  );
}

export async function listSales(payload: { accessToken: unknown; [key: string]: unknown }) {
  const { accessToken, ...rest } = payload;
  return withAdmin("listSales", accessToken, (client) => listSalesAdmin(rest, createSalesRepository(client)));
}

export async function getSaleDetail(payload: { accessToken: unknown; id: unknown }) {
  return withAdmin("getSaleDetail", payload.accessToken, (client) =>
    getSaleDetailAdmin(payload.id, createSalesRepository(client))
  );
}

export async function searchProducts(payload: { accessToken: unknown; query: unknown }) {
  return withAdmin("searchProducts", payload.accessToken, (client) =>
    searchProductsForSaleAdmin(payload.query, createProductsRepository(client))
  );
}

export async function listAvailableUnits(payload: {
  accessToken: unknown;
  productId: unknown;
}): Promise<AdminResult<{ items: AdminAvailableUnitDTO[] }>> {
  return withAdmin("listAvailableUnits", payload.accessToken, async (client) => {
    const parsed = productIdSchema.safeParse(payload.productId);
    if (!parsed.success) {
      return { ok: false, error: "VALIDATION_ERROR", issues: ["Producto inválido."] };
    }

    const units = await createProductUnitsRepository(client).listAvailableByProduct(parsed.data);
    return {
      ok: true,
      data: {
        items: units.map((unit) => ({
          id: unit.id,
          productId: unit.productId,
          unitCode: unit.unitCode,
          serialNumber: unit.serialNumber,
          batteryHealthPercent: unit.batteryHealthPercent,
          storageHealthPercent: unit.storageHealthPercent,
          specOverrides: unit.specOverrides,
        })),
      },
    };
  });
}
