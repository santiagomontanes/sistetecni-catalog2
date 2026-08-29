"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/personalizadorAdmin/auth";
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

/**
 * Caja no duplica la autorización fina en la capa Next.
 * requireAdmin() valida sesión + acceso al panel; los RPC de PostgreSQL
 * validan cash.read/cash.manage con erp_assert_permission(). Esto evita
 * una segunda lectura de profiles antes de cada RPC y mantiene la
 * autorización efectiva en la misma transacción que toca el dinero.
 */
async function run<T>(
  token: unknown,
  fn: (client: SupabaseClient) => Promise<AdminResult<T>>
): Promise<AdminResult<T>> {
  try {
    const { client } = await requireAdmin(token);
    return await fn(client);
  } catch (error) {
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
  return run(payload.accessToken, async (client) => {
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
  if (
    typeof payload.purchaseNumber !== "string" ||
    !/^COMP-\d{6}$/.test(payload.purchaseNumber.trim().toUpperCase())
  ) {
    return { ok: false, error: "VALIDATION_ERROR", issues: ["Usa un número COMP-000000 válido."] };
  }

  return run(payload.accessToken, async (client) => {
    // La policy de purchases mantiene purchases.read como segunda barrera.
    const { data, error } = await client
      .from("purchases")
      .select("id,purchase_number,total_cost_cop,supplier_name_snapshot")
      .eq("purchase_number", payload.purchaseNumber.trim().toUpperCase())
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

  return run(payload.accessToken, async (client) => {
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

  return run(payload.accessToken, async (client) => {
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

  return run(accessToken, async (client) => {
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

  return run(payload.accessToken, async (client) => {
    const { data, error } = await client.rpc("erp_reverse_cash_movement", {
      p_movement_id: parsed.data.movementId,
      p_reason: parsed.data.reason,
    });
    if (error) throw error;
    return { ok: true, data: { id: String(data) } };
  });
}
