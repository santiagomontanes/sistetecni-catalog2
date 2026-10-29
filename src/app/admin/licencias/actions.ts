"use server";

import { z } from "zod";
import { requireErpPermission } from "@/lib/erpAuth/auth";

export type LicenseState = "current" | "due_soon" | "overdue" | "paid" | "pending_payment" | "suspended" | "cancelled";
export interface LicensePayment { id: string; amount_cop: string; paid_on: string; payment_method: string; reference: string | null; period_from: string | null; period_to: string | null; cash_movement: string | null; reversed_at: string | null; reversal_reason: string | null }
export interface License { id: string; license_number: string; customer_id: string; customer_name_snapshot: string; software_name: string; plan: "monthly" | "annual" | "one_time"; price_cop: string; starts_on: string; paid_until: string | null; status: string; status_reason: string | null; notes: string | null; version: number; has_key: boolean; paid_total_cop: string; balance_cop: string | null; last_paid_on: string | null; state: LicenseState; days_to_due: number | null; created_at: string; payments?: LicensePayment[] }
export interface LicenseSummary { active: number; current: number; due_soon: number; overdue: number; pending_payment: number; suspended: number; monthly_recurring_cop: string; one_time_balance_cop: string; collected_month_cop: string }
export type LicenseResult<T> = { ok: true; data: T } | { ok: false; message: string };

const uuid = z.string().uuid(); const cop = z.string().regex(/^\d{1,12}$/); const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const methods = z.enum(["efectivo", "transferencia", "nequi", "daviplata", "tarjeta", "otro"]);
const schemas = {
  list: z.object({ search: z.string().trim().max(120).optional(), state: z.enum(["current", "due_soon", "overdue", "paid", "pending_payment", "suspended", "cancelled"]).optional(), limit: z.number().int().min(1).max(100).optional(), offset: z.number().int().min(0).optional() }).strict(),
  detail: z.object({ id: uuid }).strict(),
  key: z.object({ id: uuid }).strict(),
  create: z.object({ customerId: uuid, software: z.string().trim().min(2).max(160), licenseKey: z.string().trim().max(500).optional(), plan: z.enum(["monthly", "annual", "one_time"]), priceCop: cop, startsOn: date.optional(), notes: z.string().trim().max(1000).optional() }).strict(),
  update: z.object({ id: uuid, version: z.number().int().positive(), licenseKey: z.string().trim().max(500).optional(), notes: z.string().trim().max(1000).optional(), priceCop: cop.optional() }).strict(),
  status: z.object({ id: uuid, version: z.number().int().positive(), status: z.enum(["active", "suspended", "cancelled"]), reason: z.string().trim().min(3).max(500) }).strict(),
  payment: z.object({ id: uuid, amountCop: cop, periods: z.number().int().min(1).max(36).optional(), paidOn: date.optional(), method: methods, reference: z.string().trim().max(160).optional() }).strict(),
  payment_reverse: z.object({ id: uuid, paymentId: uuid, reason: z.string().trim().min(3).max(500) }).strict(),
} as const;
export type LicenseAction = keyof typeof schemas;

const messages: Record<string, string> = {
  license_not_found: "No encontré esa licencia.", license_customer_not_found: "El cliente no existe o está inactivo.",
  license_version_conflict: "Otra persona modificó esta licencia. Recárgala antes de guardar.",
  license_not_active: "La licencia está suspendida o cancelada: reactívala antes de registrar un pago.",
  license_payment_exceeds_balance: "El pago supera el saldo pendiente de esta licencia.",
  license_idempotency_conflict: "Este envío ya se usó con datos diferentes. Recarga e inténtalo de nuevo.",
  license_reverse_through_license: "Los pagos de licencias se reversan desde Licencias, no desde Caja.",
  license_status_reason_required: "Indica el motivo del cambio de estado (mínimo 3 caracteres).",
  license_reason_required: "Indica el motivo (mínimo 3 caracteres).", license_invalid_request: "Revisa los datos: montos en pesos enteros y fechas válidas (el pago no puede ser futuro).",
  license_payment_not_found: "No encontré ese pago.", movement_already_reversed: "Ese pago ya fue reversado.", reversal_reason_required: "Indica el motivo del reverso.",
};
export async function licenseAction(input: { accessToken: unknown; action: LicenseAction; args: unknown; requestId?: string }): Promise<LicenseResult<Record<string, unknown>>> {
  try {
    if (!Object.prototype.hasOwnProperty.call(schemas, input.action)) return { ok: false, message: "Acción desconocida." };
    const { client } = await requireErpPermission(input.accessToken, "sales.read");
    const args = schemas[input.action].parse(input.args);
    const requestId = input.requestId ? z.string().uuid().parse(input.requestId) : null;
    const { data, error } = await client.rpc("erp_license_command", { p_action: input.action, p_arguments: args, p_request_id: requestId });
    if (error) {
      const key = Object.keys(messages).find(k => error.message.includes(k));
      if (key) return { ok: false, message: messages[key] };
      return { ok: false, message: error.code === "42501" || /permission/i.test(error.message) ? "Tu rol no tiene permiso para esta operación." : "No se pudo completar la operación. Revisa los datos e inténtalo de nuevo." };
    }
    return { ok: true, data: data as Record<string, unknown> };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, message: "Datos inválidos: " + error.issues.map(i => `${i.path.join(".")} ${i.message}`).join("; ") };
    return { ok: false, message: /permiso|autenticado|Sesión/i.test(error instanceof Error ? error.message : "") ? "Tu rol no tiene permiso para esta operación." : "No se pudo completar la operación." };
  }
}
