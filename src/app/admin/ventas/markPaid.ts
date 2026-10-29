"use server";

import { z } from "zod";
import { requireErpPermission } from "@/lib/erpAuth/auth";

export type MarkPaidResult = { ok: true; saleNumber: string; alreadyPaid: boolean } | { ok: false; message: string };
const messages: Record<string, string> = {
  sale_collection_managed_by_shipping: "Esta venta es de un envío contraentrega: se marca pagada al registrar la consignación de la transportadora en Envíos → Recaudos (así queda el valor real consignado y el costo de envío).",
  sale_mark_paid_only_pending: "Solo se puede marcar como pagada una venta pendiente.",
  sale_cash_already_recorded: "Esta venta ya tiene un ingreso en caja. Revise Caja antes de cambiar su estado.",
  sale_invalid_payment_method: "Elija un medio de pago válido.",
  sale_not_found: "No encontré la venta.",
};
export async function markSalePaid(args: { accessToken: unknown; saleId: string; paymentMethod: string; reference?: string }): Promise<MarkPaidResult> {
  try {
    const { client } = await requireErpPermission(args.accessToken, "cash.manage");
    const v = z.object({ saleId: z.string().uuid(), paymentMethod: z.string().max(20), reference: z.string().trim().max(160).optional() }).parse(args);
    const { data, error } = await client.rpc("erp_sale_mark_paid", { p_sale_id: v.saleId, p_payment_method: v.paymentMethod, p_reference: v.reference || null });
    if (error) {
      const key = Object.keys(messages).find(k => error.message.includes(k));
      return { ok: false, message: key ? messages[key] : "No se pudo marcar como pagada. Revise los datos e inténtelo de nuevo." };
    }
    return { ok: true, saleNumber: String(data.saleNumber), alreadyPaid: Boolean(data.alreadyPaid) };
  } catch (error) {
    const text = error instanceof Error ? error.message : "";
    return { ok: false, message: /permiso|autenticado|Sesión/i.test(text) ? "Tu rol no puede registrar cobros en caja." : "No se pudo marcar como pagada." };
  }
}
