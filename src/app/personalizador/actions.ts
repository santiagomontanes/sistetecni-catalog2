"use server";

/**
 * Server Actions del personalizador (Fase 2B/B4). Wrappers FINOS a
 * propósito: toda la lógica real vive en src/lib/personalizadorServer/
 * (orquestación) y src/lib/personalizador/ (motor puro, B3) — este archivo
 * solo construye los repositorios reales (con el cliente admin
 * server-only) y atrapa errores inesperados para nunca dejar pasar un
 * error crudo de Supabase hacia el navegador (ver punto 15 del pedido de
 * B4: "No serialices errores completos de Supabase hacia el navegador").
 *
 * Nada de este archivo se importa desde ningún Client Component todavía
 * (B5, el wizard, no existe aún) — pero al ser "use server", Next.js ya lo
 * trata como un límite servidor/cliente real en cuanto se conecte.
 */
import { getAdminClient } from "@/supabase/admin";
import { createProductsRepository } from "@/lib/repositories/products.repository";
import { createProductUpgradeOptionsRepository } from "@/lib/repositories/productUpgradeOptions.repository";
import { createQuoteRequestsRepository } from "@/lib/repositories/quoteRequests.repository";
import {
  buscarOpcionesPersonalizadas as buscarOpcionesCore,
  crearCotizacionPersonalizada as crearCotizacionCore,
  type CreateQuoteInput,
  type CreateQuoteResult,
  type SearchOptionsResult,
} from "@/lib/personalizadorServer";

function buildReadDeps() {
  const client = getAdminClient();
  return {
    productsRepo: createProductsRepository(client),
    productUpgradeOptionsRepo: createProductUpgradeOptionsRepository(client),
  };
}

/**
 * Loguea SOLO información técnica segura (nombre + mensaje del error) —
 * nunca el objeto de error completo, que en un RepositoryError incluye
 * `cause` (el error crudo de Supabase/Postgrest: puede traer detalles de
 * la query, nunca credenciales, pero se evita igual imprimir la forma
 * completa sin necesidad).
 */
function logUnexpectedError(action: string, err: unknown): void {
  const name = err instanceof Error ? err.name : "UnknownError";
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[personalizador/actions] "${action}" falló de forma inesperada: ${name}: ${message}`);
}

export async function buscarOpcionesPersonalizadas(input: unknown): Promise<SearchOptionsResult> {
  try {
    return await buscarOpcionesCore(input, buildReadDeps());
  } catch (err) {
    logUnexpectedError("buscarOpcionesPersonalizadas", err);
    return { ok: false, error: "INTERNAL_ERROR" };
  }
}

export async function crearCotizacionPersonalizada(input: CreateQuoteInput): Promise<CreateQuoteResult> {
  try {
    const client = getAdminClient();
    return await crearCotizacionCore(input, {
      productsRepo: createProductsRepository(client),
      productUpgradeOptionsRepo: createProductUpgradeOptionsRepository(client),
      quoteRequestsRepo: createQuoteRequestsRepository(client),
    });
  } catch (err) {
    logUnexpectedError("crearCotizacionPersonalizada", err);
    return { ok: false, error: "INTERNAL_ERROR" };
  }
}
