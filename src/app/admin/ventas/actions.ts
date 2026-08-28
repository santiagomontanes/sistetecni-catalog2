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
import { RepositoryError } from "@/lib/repositories/errors";

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

interface SellableUnitRow {
  id: string;
  product_id: string;
  unit_code: string;
  serial_number: string | null;
  status: "available" | "reserved";
  battery_health_percent: number | null;
  storage_health_percent: number | null;
  spec_overrides: Record<string, unknown> | null;
  reservation_customer_name: string | null;
  reservation_customer_phone: string | null;
  reservation_expires_at: string | null;
}

// Mantiene el nombre histórico para no romper la página, pero desde 1E devuelve
// unidades disponibles Y reservadas. Una reservada solo se vuelve sold dentro
// del RPC transaccional de venta; no se libera previamente en otra transacción.
export async function listAvailableUnits(payload: {
  accessToken: unknown;
  productId: unknown;
}): Promise<AdminResult<{ items: AdminAvailableUnitDTO[] }>> {
  return withAdmin("listAvailableUnits", payload.accessToken, async (client) => {
    const parsed = productIdSchema.safeParse(payload.productId);
    if (!parsed.success) {
      return { ok: false, error: "VALIDATION_ERROR", issues: ["Producto inválido."] };
    }

    const { data, error } = await client
      .from("product_units")
      .select(
        "id,product_id,unit_code,serial_number,status,battery_health_percent,storage_health_percent,spec_overrides,reservation_customer_name,reservation_customer_phone,reservation_expires_at"
      )
      .eq("product_id", parsed.data)
      .in("status", ["available", "reserved"])
      .order("received_at", { ascending: true })
      .returns<SellableUnitRow[]>();

    if (error) throw new RepositoryError("listAvailableUnits: consulta de unidades vendibles falló", error);

    return {
      ok: true,
      data: {
        items: (data ?? []).map((unit) => ({
          id: unit.id,
          productId: unit.product_id,
          unitCode: unit.unit_code,
          serialNumber: unit.serial_number,
          status: unit.status,
          batteryHealthPercent: unit.battery_health_percent,
          storageHealthPercent: unit.storage_health_percent,
          specOverrides: unit.spec_overrides ?? {},
          reservationCustomerName: unit.reservation_customer_name,
          reservationCustomerPhone: unit.reservation_customer_phone,
          reservationExpiresAt: unit.reservation_expires_at,
        })),
      },
    };
  });
}
