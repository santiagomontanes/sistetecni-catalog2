"use server";

/**
 * Server Actions del panel admin del personalizador (Fase 2B/B6).
 *
 * Cada acción recibe `accessToken` (el `session.access_token` que el
 * cliente ya tiene tras iniciar sesión — este proyecto no usa cookies de
 * sesión, ver src/lib/personalizadorAdmin/auth.ts) y SIEMPRE pasa primero
 * por requireAdmin() antes de tocar cualquier dato: verifica el token
 * contra Supabase Auth y comprueba is_admin=true en `profiles`. El cliente
 * que requireAdmin devuelve va scoped con ese mismo token — las policies
 * RLS de is_admin ya existentes (upgrade_options, product_upgrade_options,
 * quote_requests) actúan como una segunda capa de enforcement
 * independiente. Ninguna acción de este archivo usa el cliente
 * service_role.
 *
 * Wrappers finos: toda la lógica real vive en
 * src/lib/personalizadorAdmin/ (orquestación + Zod) y
 * src/lib/repositories/ (B2). Ningún error crudo de Supabase se
 * serializa hacia el navegador — withAdmin() lo atrapa y lo mapea a
 * "INTERNAL_ERROR".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/personalizadorAdmin/auth";
import { mapUnexpectedError } from "@/lib/personalizadorAdmin/errorMapping";
import {
  createUpgradeAdmin,
  updateUpgradeAdmin,
  toggleUpgradeAdmin,
  listUpgradesAdmin,
} from "@/lib/personalizadorAdmin/upgrades";
import { setProductCompatibilityAdmin, copyProductCompatibilityAdmin } from "@/lib/personalizadorAdmin/compatibility";
import { listQuotesAdmin, getQuoteDetailAdmin, updateQuoteStatusAdmin } from "@/lib/personalizadorAdmin/quotes";
import type { AdminResult } from "@/lib/personalizadorAdmin/types";
import { createUpgradeOptionsRepository } from "@/lib/repositories/upgradeOptions.repository";
import { createProductUpgradeOptionsRepository } from "@/lib/repositories/productUpgradeOptions.repository";
import { createQuoteRequestsRepository } from "@/lib/repositories/quoteRequests.repository";

function logUnexpectedError(action: string, err: unknown): void {
  const name = err instanceof Error ? err.name : "UnknownError";
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[admin/personalizador/actions] "${action}" falló de forma inesperada: ${name}: ${message}`);
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

// ─── Upgrades ────────────────────────────────────────────────────────────

export async function createUpgrade(payload: { accessToken: unknown; [key: string]: unknown }) {
  const { accessToken, ...rest } = payload;
  return withAdmin("createUpgrade", accessToken, (client) =>
    createUpgradeAdmin(rest, createUpgradeOptionsRepository(client))
  );
}

export async function updateUpgrade(payload: { accessToken: unknown; id: unknown; [key: string]: unknown }) {
  const { accessToken, id, ...rest } = payload;
  return withAdmin("updateUpgrade", accessToken, (client) =>
    updateUpgradeAdmin(id, rest, createUpgradeOptionsRepository(client))
  );
}

export async function toggleUpgrade(payload: { accessToken: unknown; id: unknown; active: unknown }) {
  return withAdmin("toggleUpgrade", payload.accessToken, (client) =>
    toggleUpgradeAdmin(payload.id, payload.active, createUpgradeOptionsRepository(client))
  );
}

export async function listUpgrades(payload: { accessToken: unknown }) {
  return withAdmin("listUpgrades", payload.accessToken, (client) =>
    listUpgradesAdmin(createUpgradeOptionsRepository(client))
  );
}

// ─── Compatibilidad ──────────────────────────────────────────────────────

export async function setProductCompatibility(payload: { accessToken: unknown; [key: string]: unknown }) {
  const { accessToken, ...rest } = payload;
  return withAdmin("setProductCompatibility", accessToken, (client) =>
    setProductCompatibilityAdmin(rest, createProductUpgradeOptionsRepository(client))
  );
}

export async function copyProductCompatibility(payload: { accessToken: unknown; [key: string]: unknown }) {
  const { accessToken, ...rest } = payload;
  return withAdmin("copyProductCompatibility", accessToken, (client) =>
    copyProductCompatibilityAdmin(rest, createProductUpgradeOptionsRepository(client))
  );
}

// ─── Cotizaciones ────────────────────────────────────────────────────────

export async function listQuotes(payload: { accessToken: unknown; [key: string]: unknown }) {
  const { accessToken, ...rest } = payload;
  return withAdmin("listQuotes", accessToken, (client) => listQuotesAdmin(rest, createQuoteRequestsRepository(client)));
}

export async function getQuoteDetail(payload: { accessToken: unknown; code: unknown }) {
  return withAdmin("getQuoteDetail", payload.accessToken, (client) =>
    getQuoteDetailAdmin(payload.code, createQuoteRequestsRepository(client))
  );
}

export async function updateQuoteStatus(payload: { accessToken: unknown; [key: string]: unknown }) {
  const { accessToken, ...rest } = payload;
  return withAdmin("updateQuoteStatus", accessToken, (client) =>
    updateQuoteStatusAdmin(rest, createQuoteRequestsRepository(client))
  );
}
