"use server";

/**
 * Server Actions del panel admin de ventas — mismo patrón que
 * src/app/admin/personalizador/actions.ts: cada acción recibe
 * `accessToken` (ver src/lib/personalizadorAdmin/auth.ts, este proyecto
 * no usa cookies de sesión) y pasa primero por requireAdmin() antes de
 * tocar cualquier dato. El wrapper withAdmin() se duplica aquí en vez de
 * extraerse a un helper compartido — cambio mínimo y aislado, sin tocar
 * el archivo existente del personalizador.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/personalizadorAdmin/auth";
import { mapUnexpectedError } from "@/lib/personalizadorAdmin/errorMapping";
import { createSaleAdmin, listSalesAdmin, getSaleDetailAdmin, searchProductsForSaleAdmin } from "@/lib/salesAdmin";
import type { AdminResult } from "@/lib/personalizadorAdmin/types";
import { createSalesRepository } from "@/lib/repositories/sales.repository";
import { createProductsRepository } from "@/lib/repositories/products.repository";

function logUnexpectedError(action: string, err: unknown): void {
  const name = err instanceof Error ? err.name : "UnknownError";
  const message = err instanceof Error ? err.message : String(err);
  // Nunca se registra nombre/documento/celular de un cliente aquí.
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
