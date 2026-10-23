"use server";

import QRCode from "qrcode";
import { z } from "zod";
import { requireErpPermission } from "@/lib/erpAuth/auth";
import { validateWorkshopCommand } from "@/lib/workshop/validation";
import type { WorkshopData, WorkshopResult, WorkshopUnit } from "@/lib/workshop/types";

const messages: Record<string, string> = {
  workshop_disabled: "El taller está desactivado. Un administrador puede activarlo después de aplicar y verificar la migración.",
  workshop_version_conflict: "Otra sesión modificó esta unidad. Recargue la ficha y revise los cambios antes de guardar de nuevo.",
  workshop_qr_not_free: "La etiqueta ya fue asignada o anulada. No se creó otra unidad.",
  workshop_qr_missing: "QR no encontrado. Genere las etiquetas desde el taller.",
  workshop_required_checks_missing: "Faltan controles obligatorios aprobados o justificados como no aplicables.",
  workshop_product_required: "Asocie primero el producto del catálogo desde estética.",
  workshop_not_ready: "La unidad debe completar control final y pasar a lista para venta.",
  workshop_component_unavailable: "El componente no está disponible o aún no está probado como funcional.",
  workshop_unit_locked_commercially: "La unidad está vendida, reservada o retirada; resuelva primero su estado comercial.",
  workshop_idempotency_conflict: "Este identificador de operación ya se usó con datos diferentes.",
  workshop_incompatible_ram: "La generación de RAM no coincide con la especificación verificada del equipo.",
  workshop_incompatible_ram_format: "El formato de RAM no coincide con el equipo.",
  workshop_incompatible_storage_interface: "La interfaz del disco no está entre las interfaces verificadas del equipo.",
  workshop_incompatible_charger_connector: "El conector del cargador no coincide con el verificado para el equipo.",
  workshop_incompatible_charger_voltage: "El voltaje del cargador no coincide con el requerido por el equipo.",
  workshop_location_required: "Seleccione una ubicación activa.",
  workshop_receive_existing_first: "Esta unidad aún usa el flujo anterior. Para incorporarla al taller, escanee un QR libre y registre su recepción indicando el STU de la unidad existente.",
};
function failure(error: unknown): WorkshopResult<never> {
  if (error instanceof z.ZodError) return { ok: false, error: "VALIDATION", message: error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const message = error instanceof Error ? error.message : "";
  const key = Object.keys(messages).find(k => message.includes(k));
  if (key) return { ok: false, error: key, message: messages[key] };
  if (/permiso|autenticado|Sesión|permission_denied/.test(message)) return { ok: false, error: "FORBIDDEN", message: "Su sesión no tiene permiso para esta operación." };
  return { ok: false, error: "WORKSHOP_ERROR", message: "No fue posible completar la operación. Revise los datos, permisos y la migración del taller. Puede reintentar sin duplicar la operación." };
}
export async function readWorkshop(input: { accessToken: unknown; unitId?: string; search?: string; offset?: number }): Promise<WorkshopResult<WorkshopData>> {
  try {
    const { client } = await requireErpPermission(input.accessToken, "inventory.read");
    const parsed = z.object({ unitId: z.string().uuid().optional(), search: z.string().max(150).default(""), offset: z.number().int().min(0).max(100000).default(0) }).parse(input);
    const { data, error } = await client.rpc("erp_workshop_read", { p_unit_id: parsed.unitId ?? null, p_search: parsed.search, p_offset: parsed.offset });
    if (error) throw new Error(error.message);
    return { ok: true, data: data as WorkshopData };
  } catch (error) { return failure(error); }
}
export async function commandWorkshop(input: { accessToken: unknown; action: string; payload: unknown; key: string }): Promise<WorkshopResult<Record<string, unknown>>> {
  try {
    const { client } = await requireErpPermission(input.accessToken, "inventory.manage");
    const payload = validateWorkshopCommand(input.action, input.payload);
    if(input.action==="receive"&&"existingUnitId" in payload&&typeof payload.existingUnitId==="string"&&payload.existingUnitId.startsWith("STU-")){
      const unit=await client.from("product_units").select("id").eq("unit_code",payload.existingUnitId).single();
      if(unit.error||!unit.data)throw new Error("workshop_existing_unit_not_found");payload.existingUnitId=unit.data.id;
    }
    const key = z.string().uuid().parse(input.key);
    const { data, error } = await client.rpc("erp_workshop_command", { p_action: input.action, p_payload: payload, p_key: key });
    if (error) throw new Error(error.message);
    return { ok: true, data: data as Record<string, unknown> };
  } catch (error) { return failure(error); }
}
export async function renderWorkshopLabels(input: { accessToken: unknown; codes: string[] }): Promise<WorkshopResult<{ code: string; svg: string }[]>> {
  try {
    await requireErpPermission(input.accessToken, "inventory.read");
    const codes = z.array(z.string().regex(/^STQ-[A-F0-9]{12}$/)).max(200).parse(input.codes);
    // Solo identidad, sin PII ni servicios de QR externos; escáner autenticado resuelve el código.
    const result = await Promise.all(codes.map(async code => ({ code, svg: await QRCode.toString(code, { type: "svg", errorCorrectionLevel: "M", margin: 3, width: 160 }) })));
    return { ok: true, data: result };
  } catch (error) { return failure(error); }
}

export async function searchWorkshopComponents(input: { accessToken: unknown; query: string; offset: number }): Promise<WorkshopResult<{ items: WorkshopUnit[]; offset: number; pageSize: number }>> {
  try {
    const { client } = await requireErpPermission(input.accessToken, "inventory.read");
    const parsed = z.object({ query: z.string().max(150), offset: z.number().int().min(0).max(100000) }).parse(input);
    const { data, error } = await client.rpc("erp_workshop_components", { p_query: parsed.query, p_offset: parsed.offset });
    if (error) throw new Error(error.message);
    return { ok: true, data };
  } catch (error) { return failure(error); }
}
