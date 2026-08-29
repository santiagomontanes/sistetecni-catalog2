"use server";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AdminAuthError } from "@/lib/personalizadorAdmin/auth";
import type { AdminResult } from "@/lib/personalizadorAdmin/types";
import { mapUnexpectedError } from "@/lib/personalizadorAdmin/errorMapping";
import {
  closeCashSchema,
  cashMovementSchema,
  issues,
  openCashSchema,
  reverseMovementSchema,
} from "@/lib/adminPhase2/validation";
import type { CashMovementDTO, CashSessionDTO } from "@/lib/adminPhase2/types";

interface CashSessionRow {
  id: string;
  session_number: string;
  status: CashSessionDTO["status"];
  opening_cash_cop: number | string;
  expected_cash_cop: number | string | null;
  counted_cash_cop: number | string | null;
  difference_cop: number | string | null;
  opened_at: string;
  closed_at: string | null;
}

interface CashMovementRow {
  id: string;
  movement_number: string;
  session_id: string | null;
  movement_type: string;
  payment_method: CashMovementDTO["paymentMethod"];
  amount_cop: number | string;
  description: string;
  created_at: string;
  reversal_of_id: string | null;
}

interface CashDashboardRpc {
  sessions?: CashSessionRow[];
  movements?: CashMovementRow[];
}

function requiredEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
  const value = process.env[name];
  if (!value) throw new Error(`[admin/caja] Falta ${name}.`);
  return value;
}

/**
 * Caja usa un cliente scoped con el JWT recibido del navegador, pero NO hace
 * auth.getUser() ni un SELECT previo de profiles. Eso elimina dos round-trips.
 * Supabase valida el JWT al recibir la petición y PostgreSQL valida auth.uid()
 * + cash.read/cash.manage dentro de los RPC/RLS antes de leer o mover dinero.
 */
function clientForCash(accessToken: unknown): SupabaseClient {
  if (typeof accessToken !== "string" || accessToken.trim().length === 0) {
    throw new AdminAuthError("No autenticado.");
  }
  return createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

async function run<T>(
  action: string,
  token: unknown,
  fn: (client: SupabaseClient) => Promise<AdminResult<T>>
): Promise<AdminResult<T>> {
  const startedAt = Date.now();
  try {
    const client = clientForCash(token);
    const result = await fn(client);
    console.info(`[admin/caja] ${action} ${Date.now() - startedAt}ms ok=${result.ok}`);
    return result;
  } catch (error) {
    console.warn(`[admin/caja] ${action} ${Date.now() - startedAt}ms error=${error instanceof Error ? error.name : "UnknownError"}`);
    return mapUnexpectedError(error);
  }
}

function mapSession(row: CashSessionRow): CashSessionDTO {
  return {
    id: row.id,
    sessionNumber: row.session_number,
    status: row.status,
    openingCashCop: Number(row.opening_cash_cop),
    expectedCashCop: row.expected_cash_cop == null ? null : Number(row.expected_cash_cop),
    countedCashCop: row.counted_cash_cop == null ? null : Number(row.counted_cash_cop),
    differenceCop: row.difference_cop == null ? null : Number(row.difference_cop),
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}

function mapMovement(row: CashMovementRow): CashMovementDTO {
  return {
    id: row.id,
    movementNumber: row.movement_number,
    sessionId: row.session_id,
    movementType: row.movement_type,
    paymentMethod: row.payment_method,
    amountCop: Number(row.amount_cop),
    description: row.description,
    createdAt: row.created_at,
    reversalOfId: row.reversal_of_id,
  };
}

export async function getCashDashboard(payload: {
  accessToken: unknown;
}): Promise<AdminResult<{ open: CashSessionDTO | null; sessions: CashSessionDTO[]; movements: CashMovementDTO[] }>> {
  return run("dashboard", payload.accessToken, async (client) => {
    const { data, error } = await client.rpc("erp_get_cash_dashboard");
    if (error) throw error;

    const snapshot = (data ?? {}) as CashDashboardRpc;
    const sessions = (snapshot.sessions ?? []).map(mapSession);
    const movements = (snapshot.movements ?? []).map(mapMovement);

    return {
      ok: true,
      data: {
        open: sessions.find((item) => item.status === "open") ?? null,
        sessions,
        movements,
      },
    };
  });
}

export async function findPurchaseForCash(payload: {
  accessToken: unknown;
  purchaseNumber: unknown;
}): Promise<AdminResult<{ id: string; purchaseNumber: string; totalCop: number; supplier: string }>> {
  const purchaseNumber =
    typeof payload.purchaseNumber === "string" ? payload.purchaseNumber.trim().toUpperCase() : "";

  if (!/^COMP-\d{6}$/.test(purchaseNumber)) {
    return { ok: false, error: "VALIDATION_ERROR", issues: ["Usa un número COMP-000000 válido."] };
  }

  return run("findPurchase", payload.accessToken, async (client) => {
    const { data, error } = await client
      .from("purchases")
      .select("id,purchase_number,total_cost_cop,supplier_name_snapshot")
      .eq("purchase_number", purchaseNumber)
      .maybeSingle<{
        id: string;
        purchase_number: string;
        total_cost_cop: number | string;
        supplier_name_snapshot: string;
      }>();

    if (error) throw error;
    if (!data) return { ok: false, error: "NOT_FOUND" };

    return {
      ok: true,
      data: {
        id: data.id,
        purchaseNumber: data.purchase_number,
        totalCop: Number(data.total_cost_cop),
        supplier: data.supplier_name_snapshot,
      },
    };
  });
}

export async function openCash(payload: {
  accessToken: unknown;
  openingCashCop: unknown;
  notes?: unknown;
}): Promise<AdminResult<{ id: string }>> {
  const parsed = openCashSchema.safeParse({
    openingCashCop: payload.openingCashCop,
    notes: payload.notes,
  });
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_ERROR", issues: issues(parsed.error) };
  }

  return run("open", payload.accessToken, async (client) => {
    const { data, error } = await client.rpc("erp_open_cash_session", {
      p_opening_cash_cop: parsed.data.openingCashCop,
      p_notes: parsed.data.notes ?? null,
    });
    if (error) throw error;
    return { ok: true, data: { id: String(data) } };
  });
}

export async function closeCash(payload: {
  accessToken: unknown;
  sessionId: unknown;
  countedCashCop: unknown;
  notes?: unknown;
}): Promise<AdminResult<{ id: string }>> {
  const parsed = closeCashSchema.safeParse({
    sessionId: payload.sessionId,
    countedCashCop: payload.countedCashCop,
    notes: payload.notes,
  });
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_ERROR", issues: issues(parsed.error) };
  }

  return run("close", payload.accessToken, async (client) => {
    const { data, error } = await client.rpc("erp_close_cash_session", {
      p_session_id: parsed.data.sessionId,
      p_counted_cash_cop: parsed.data.countedCashCop,
      p_notes: parsed.data.notes ?? null,
    });
    if (error) throw error;
    return { ok: true, data: { id: String(data) } };
  });
}

export async function addCashMovement(payload: {
  accessToken: unknown;
  [key: string]: unknown;
}): Promise<AdminResult<{ id: string }>> {
  const { accessToken, ...input } = payload;
  const parsed = cashMovementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_ERROR", issues: issues(parsed.error) };
  }

  return run("movement", accessToken, async (client) => {
    const { data, error } = await client.rpc("erp_add_cash_movement", {
      p_movement_type: parsed.data.movementType,
      p_payment_method: parsed.data.paymentMethod,
      p_amount_cop: parsed.data.amountCop,
      p_description: parsed.data.description,
      p_purchase_id: parsed.data.purchaseId ?? null,
    });
    if (error) throw error;
    return { ok: true, data: { id: String(data) } };
  });
}

export async function reverseCashMovement(payload: {
  accessToken: unknown;
  movementId: unknown;
  reason: unknown;
}): Promise<AdminResult<{ id: string }>> {
  const parsed = reverseMovementSchema.safeParse({
    movementId: payload.movementId,
    reason: payload.reason,
  });
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_ERROR", issues: issues(parsed.error) };
  }

  return run("reverse", payload.accessToken, async (client) => {
    const { data, error } = await client.rpc("erp_reverse_cash_movement", {
      p_movement_id: parsed.data.movementId,
      p_reason: parsed.data.reason,
    });
    if (error) throw error;
    return { ok: true, data: { id: String(data) } };
  });
}
