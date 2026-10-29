import type { SupabaseClient } from "@supabase/supabase-js";
import { findCollectionMatches, type CollectionCandidate } from "./domain";
import { parseShippingCommand, type ShippingAction } from "./contracts";
import type { ErpPermission } from "@/lib/erpAuth/types";

export function shippingPermission(action: ShippingAction): ErpPermission {
  if (["reconcile", "reverse_deposit","apply_deposit_credit"].includes(action)) return "cash.manage";
  if (["transport_save","difference_review"].includes(action)) return "profitability.manage";
  if (["pending_collections", "deposits", "metrics", "search","references"].includes(action)) return "cash.read";
  if (action === "configure") return "users.manage";
  if (["create", "guide", "dispatch", "deliver", "incident", "cancel", "return", "return_confirm"].includes(action)) return "sales.manage";
  return "sales.read";
}

export function shippingEnabled(): boolean { return process.env.ERP_SHIPPING_ENABLED === "true"; }

export async function executeShipping(client: SupabaseClient, input: unknown): Promise<Record<string, unknown>> {
  const command = parseShippingCommand(input);
  const action = command.action === "search" ? "pending_collections" : command.action;
  const args = command.action === "search" ? { ...command.arguments, amountCop: undefined, limit: 101 } : command.arguments;
  const { data, error } = await client.rpc("erp_shipping_command", { p_action: action, p_arguments: args, p_request_id: command.requestId ?? null });
  if (error) {
    if (error.code === "23505") {
      if (error.message.includes("erp_shipping_deposits_account_reference")) throw new Error("shipping_duplicate_reference");
      if (error.message.includes("erp_shipments_carrier_guide")) throw new Error("shipping_guide_already_used");
      if (error.message.includes("erp_shipments_active_sale")) throw new Error("shipping_sale_already_shipped");
    }
    throw new Error(error.code === "42501" ? "FORBIDDEN" : error.message.match(/shipping_[a-z_]+/)?.[0] ?? "SHIPPING_ERROR");
  }
  if (command.action !== "search") return data as Record<string, unknown>;
  const rows = (data?.items ?? []) as CollectionCandidate[];
  const result = findCollectionMatches(rows.slice(0, 100), String(command.arguments.amountCop));
  return { ...result, limited: result.limited || rows.length > 100, requiresConfirmation: true };
}

const MESSAGES: Record<string, string> = {
  shipping_existing_cost_requires_review:"Esta venta ya tiene transporte registrado en Rentabilidad. Vincula el costo existente antes de reconocerlo de nuevo.",
  shipping_existing_cost_mismatch:"El costo existente debe pertenecer a esta venta, estar vigente y coincidir con el importe del concepto.",
  shipping_transport_correction_below_received:"El nuevo neto quedaría por debajo de lo recibido. Revisa/revierte la consignación antes de corregir el concepto.",
  shipping_prepayment_requires_existing_manual_cash_out:"Vincula una salida de caja vigente por el anticipo. Si ya es un gasto, sólo se asignará al margen sin repetir gasto ni caja.",
  shipping_clear_expense_allocation_before_source_change:"Primero deja en cero la asignación anterior con motivo; después corrige o anula su gasto y vincula la nueva fuente.",
  shipping_transport_source_conflict:"El concepto no puede vincular simultáneamente un gasto y un costo ya registrado.",
  shipping_prepayment_overallocated:"Ese anticipo ya está asignado o su importe no cubre este concepto.",
  shipping_unknown_amount_is_provisional:"Un importe desconocido debe permanecer provisional.",
  shipping_withheld_requires_cod_known_amount:"Sólo un importe conocido de una contraentrega puede descontarse del recaudo.",
  shipping_withheld_bearer_requires_review:"Un descuento del recaudo de Sistetecni requiere identificar el costo asumido. Revisa el cobro al cliente por separado.",
  shipping_credit_exceeds_balance:"El crédito no cubre ese importe o el saldo cambió. Actualiza la ficha.",
  shipping_adjust_cost_through_shipment:"Corrige este costo desde el envío para conservar también sus conceptos y su neto esperado.",
  FORBIDDEN: "No tienes permiso para esta operación.", shipping_disabled: "El módulo está desactivado. Un administrador debe activarlo en configuración.",
  shipping_version_conflict: "La ficha cambió en otra sesión. Recarga y revisa los datos antes de reintentar.",
  shipping_idempotency_conflict: "La clave del intento ya pertenece a otra operación. Recarga la ficha.",
  shipping_balance_not_pending: "El saldo ya fue conciliado o el envío dejó de estar entregado. Actualiza la búsqueda.",
  shipping_allocation_exceeds_balance: "El importe supera el saldo vigente. Actualiza la búsqueda.",
  shipping_expected_net_mismatch: "El neto debe coincidir con el valor por cobrar menos los conceptos descontados del recaudo.",
  shipping_deduction_reason_required: "Indica el concepto de los descuentos de la transportadora.",
  shipping_cod_requires_full_unpaid_sale: "Contraentrega requiere una venta pendiente y recaudar su valor completo. Las ventas con abonos previos necesitan revisión de caja.",
  shipping_prepaid_requires_paid_sale: "El envío prepagado requiere una venta pagada y recaudo cero.",
  shipping_reverse_collection_before_return: "Revierte primero la conciliación; la devolución no devuelve dinero automáticamente.",
  shipping_sale_has_existing_cash: "Esta venta ya tiene un movimiento de caja. Revisa su recaudo para evitar duplicarlo.",
  shipping_invalid_delivery_date: "La entrega debe ser posterior al despacho y no estar en el futuro.",
  shipping_reverse_deposit_through_shipping: "Revierte esta consignación desde Envíos para corregir también sus saldos.",
  shipping_duplicate_reference: "Esta cuenta y referencia ya tienen una consignación registrada. Revisa el registro existente antes de continuar.",
  shipping_guide_already_used: "La guía ya pertenece a otro envío de esta transportadora.",
  shipping_sale_already_shipped: "Esta venta ya tiene un envío activo. Abre su ficha existente.",
};
export function shippingErrorMessage(error: unknown): string {
  const key = error instanceof Error ? error.message : "SHIPPING_ERROR";
  return MESSAGES[key] ?? (key.startsWith("shipping_") ? `No se guardó la operación (${key}). Revisa los datos y el estado actual.` : "No fue posible completar la operación. Revisa los campos y vuelve a intentar.");
}
