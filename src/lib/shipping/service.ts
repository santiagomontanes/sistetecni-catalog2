import type { SupabaseClient } from "@supabase/supabase-js";
import { findCollectionMatches, type CollectionCandidate } from "./domain";
import { parseShippingCommand, type ShippingAction } from "./contracts";
import type { ErpPermission } from "@/lib/erpAuth/types";
import { createHash } from "node:crypto";

export function shippingPermission(action: ShippingAction): ErpPermission {
  if (["reconcile", "reverse_deposit","apply_deposit_credit"].includes(action)) return "cash.manage";
  if (["transport_save","difference_review"].includes(action)) return "profitability.manage";
  if (["pending_collections", "deposits", "metrics", "search","references"].includes(action)) return "cash.read";
  if (action === "configure") return "users.manage";
  if (["create", "guide", "dispatch", "deliver", "incident", "cancel", "return", "return_confirm", "quick_create"].includes(action)) return "sales.manage";
  return "sales.read";
}

export function shippingEnabled(): boolean { return process.env.ERP_SHIPPING_ENABLED === "true"; }

// UUID estable derivado de la clave del intento: un reintento reutiliza la venta y el envío ya creados.
function derivedUuid(requestId: string, label: string): string {
  const h = createHash("sha256").update(`${requestId}:${label}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Crea la venta (pendiente, contraentrega) con el computador por su STU y el envío en un solo paso. */
async function quickCreate(client: SupabaseClient, args: Record<string, unknown>, requestId: string): Promise<Record<string, unknown>> {
  const code = String(args.stu).trim().toUpperCase();
  const normalized = /^STU-?\d{1,12}$/.test(code) ? `STU-${code.replace(/\D/g, "").padStart(6, "0")}` : code;
  const { data: unit, error: unitError } = await client.from("product_units").select("id,unit_code,product_id,status,asset_kind,commercial_price_cop").ilike("unit_code", normalized.replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle();
  if (unitError) throw new Error("SHIPPING_ERROR");
  if (!unit) throw new Error("shipping_unit_not_found");
  if (unit.asset_kind !== "computer" || !unit.product_id) throw new Error("shipping_unit_needs_product");
  const { data: product } = await client.from("products").select("title,warranty_months").eq("id", unit.product_id).maybeSingle();
  const price = args.priceCop != null ? String(args.priceCop) : unit.commercial_price_cop != null ? String(unit.commercial_price_cop) : "";
  if (!/^[1-9]\d{0,11}$/.test(price)) throw new Error("shipping_price_required");
  const { data: saleId, error: saleError } = await client.rpc("erp_create_sale_with_units", {
    p_customer_id: null, p_customer_name: String(args.name), p_customer_document: String(args.document), p_customer_phone: String(args.phone), p_customer_email: null,
    p_items: [{ itemType: "catalog", productId: unit.product_id, productUnitId: unit.id, description: product?.title ?? unit.unit_code, unitPriceCop: Number(price), quantity: 1 }],
    p_discount_cop: 0, p_payment_method: "transferencia", p_payment_status: "pendiente", p_warranty_months: product?.warranty_months ?? 0,
    p_notes: `Envío ${unit.unit_code}`, p_idempotency_key: derivedUuid(requestId, "sale"),
  });
  if (saleError || typeof saleId !== "string") {
    if ((saleError?.message ?? "").includes("unit_not_available")) throw new Error("shipping_unit_not_available");
    throw new Error(saleError?.code === "42501" ? "FORBIDDEN" : "shipping_quick_sale_failed");
  }
  const { data, error } = await client.rpc("erp_shipping_command", {
    p_action: "create", p_request_id: derivedUuid(requestId, "shipment"),
    p_arguments: { saleId, name: args.name, document: args.document, phone: args.phone, city: args.city, department: args.department, officePickup: Boolean(args.officePickup), address: args.address, carrier: args.carrier, paymentMode: "cod", collectCop: price, notes: args.notes ?? null },
  });
  if (error) throw new Error(error.code === "42501" ? "FORBIDDEN" : error.message.match(/shipping_[a-z_]+/)?.[0] ?? "SHIPPING_ERROR");
  return data as Record<string, unknown>;
}

export async function executeShipping(client: SupabaseClient, input: unknown): Promise<Record<string, unknown>> {
  const command = parseShippingCommand(input);
  if (command.action === "quick_create") return quickCreate(client, command.arguments, command.requestId as string);
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
  shipping_unit_not_found: "No encontré ese STU. Escríbelo como aparece en la etiqueta, por ejemplo STU-000027.",
  shipping_unit_needs_product: "Ese STU no es un computador con producto asociado. Termina primero su Fase 3 (producto, acabado y precio).",
  shipping_unit_not_available: "Ese equipo no está disponible para vender (ya vendido, en revisión o sin controles aprobados).",
  shipping_price_required: "Escribe el valor de venta: el equipo no tiene precio definido en la Fase 3.",
  shipping_quick_sale_failed: "No se pudo crear la venta del envío. Revisa los datos y que el equipo esté disponible.",
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
