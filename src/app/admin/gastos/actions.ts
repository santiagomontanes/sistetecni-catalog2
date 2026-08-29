"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireErpPermission } from "@/lib/erpAuth/auth";
import type { AdminResult } from "@/lib/personalizadorAdmin/types";
import { mapUnexpectedError } from "@/lib/personalizadorAdmin/errorMapping";
import { expenseSchema, issues, voidExpenseSchema } from "@/lib/adminPhase2/validation";
import type { ExpenseDTO } from "@/lib/adminPhase2/types";

interface ExpenseRow {
  id: string;
  expense_number: string;
  category: string;
  description: string;
  amount_cop: number | string;
  payment_method: ExpenseDTO["paymentMethod"];
  payee: string | null;
  receipt_url: string | null;
  occurred_on: string;
  status: ExpenseDTO["status"];
  void_reason: string | null;
  created_at: string;
}

async function run<T>(
  token: unknown,
  permission: "expenses.read" | "expenses.manage",
  fn: (client: SupabaseClient) => Promise<AdminResult<T>>
): Promise<AdminResult<T>> {
  try {
    const { client } = await requireErpPermission(token, permission);
    return await fn(client);
  } catch (error) {
    return mapUnexpectedError(error);
  }
}

function mapExpense(row: ExpenseRow): ExpenseDTO {
  return {
    id: row.id,
    expenseNumber: row.expense_number,
    category: row.category,
    description: row.description,
    amountCop: Number(row.amount_cop),
    paymentMethod: row.payment_method,
    payee: row.payee,
    receiptUrl: row.receipt_url,
    occurredOn: row.occurred_on,
    status: row.status,
    voidReason: row.void_reason,
    createdAt: row.created_at,
  };
}

export async function listExpenses(payload: {
  accessToken: unknown;
  limit?: unknown;
}): Promise<AdminResult<{ items: ExpenseDTO[] }>> {
  return run(payload.accessToken, "expenses.read", async (client) => {
    const limit =
      typeof payload.limit === "number"
        ? Math.max(1, Math.min(200, Math.trunc(payload.limit)))
        : 100;

    const { data, error } = await client
      .from("operating_expenses")
      .select("id,expense_number,category,description,amount_cop,payment_method,payee,receipt_url,occurred_on,status,void_reason,created_at")
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<ExpenseRow[]>();

    if (error) throw error;
    return { ok: true, data: { items: (data ?? []).map(mapExpense) } };
  });
}

export async function createExpense(payload: {
  accessToken: unknown;
  [key: string]: unknown;
}): Promise<AdminResult<{ id: string }>> {
  const { accessToken, ...input } = payload;
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_ERROR", issues: issues(parsed.error) };
  }

  return run(accessToken, "expenses.manage", async (client) => {
    const { data, error } = await client.rpc("erp_create_operating_expense", {
      p_category: parsed.data.category,
      p_description: parsed.data.description,
      p_amount_cop: parsed.data.amountCop,
      p_payment_method: parsed.data.paymentMethod,
      p_payee: parsed.data.payee ?? null,
      p_receipt_url: parsed.data.receiptUrl ?? null,
      p_occurred_on: parsed.data.occurredOn,
    });
    if (error) throw error;
    return { ok: true, data: { id: String(data) } };
  });
}

export async function voidExpense(payload: {
  accessToken: unknown;
  expenseId: unknown;
  reason: unknown;
}): Promise<AdminResult<{ id: string }>> {
  const parsed = voidExpenseSchema.safeParse({
    expenseId: payload.expenseId,
    reason: payload.reason,
  });
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_ERROR", issues: issues(parsed.error) };
  }

  return run(payload.accessToken, "expenses.manage", async (client) => {
    const { data, error } = await client.rpc("erp_void_operating_expense", {
      p_expense_id: parsed.data.expenseId,
      p_reason: parsed.data.reason,
    });
    if (error) throw error;
    return { ok: true, data: { id: String(data) } };
  });
}
