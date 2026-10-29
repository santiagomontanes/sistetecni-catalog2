"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireErpPermission } from "@/lib/erpAuth/auth";
import { validateWorkshopCommand } from "@/lib/workshop/validation";
import { buildLabelsPdf } from "@/lib/workshop/labelsPdf";
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
const labelSize = z.enum(["small", "medium", "large"]);
export interface LabelBatch { batchId: string; createdAt: string; total: number; free: number; assigned: number; void: number; first: string; last: string }
export interface LabelsPdfResult { pdfBase64: string; batchId: string; count: number; first: string; last: string }
async function pdfForCodes(codes: string[], size: z.infer<typeof labelSize>, batchId: string): Promise<LabelsPdfResult> {
  const sorted = [...codes].sort();
  const title = `Etiquetas SISTETECNI ${new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}`;
  const bytes = await buildLabelsPdf(sorted, size, title);
  return { pdfBase64: Buffer.from(bytes).toString("base64"), batchId, count: sorted.length, first: sorted[0], last: sorted[sorted.length - 1] };
}
// Solo administrador (también se exige en SQL). Reserva N números STU y devuelve el PDF para imprimir. Si el PDF fallara, el lote queda
// registrado y se puede reimprimir desde «Lotes anteriores»; los STU no se pierden.
export async function createWorkshopLabelsPdf(input: { accessToken: unknown; count: number; size: string }): Promise<WorkshopResult<LabelsPdfResult>> {
  try {
    const { client } = await requireErpPermission(input.accessToken, "users.manage");
    const parsed = z.object({ count: z.number().int().min(1).max(200), size: labelSize }).parse(input);
    const { data, error } = await client.rpc("erp_workshop_command", { p_action: "qr_batch", p_payload: { count: parsed.count }, p_key: randomUUID() });
    if (error) throw new Error(error.message);
    const batch = data as { batchId: string; labels: { code: string }[] };
    return { ok: true, data: await pdfForCodes(batch.labels.map(l => l.code), parsed.size, batch.batchId) };
  } catch (error) { return failure(error); }
}
export async function reprintWorkshopLabelsPdf(input: { accessToken: unknown; batchId: string; size: string }): Promise<WorkshopResult<LabelsPdfResult>> {
  try {
    const { client } = await requireErpPermission(input.accessToken, "inventory.read");
    const parsed = z.object({ batchId: z.string().uuid(), size: labelSize }).parse(input);
    const { data, error } = await client.from("workshop_qr_labels").select("code").eq("batch_id", parsed.batchId).eq("state", "free").order("code").limit(200);
    if (error) throw new Error(error.message);
    if (!data?.length) return { ok: false, error: "labels_none_free", message: "Este lote ya no tiene etiquetas libres para imprimir." };
    return { ok: true, data: await pdfForCodes(data.map(l => l.code as string), parsed.size, parsed.batchId) };
  } catch (error) { return failure(error); }
}
// Reimpresión de etiquetas de unidades ya registradas (etiqueta rota, borrada o ilegible). No reserva números nuevos.
export async function reprintUnitLabelsPdf(input: { accessToken: unknown; codes: string; from?: number; to?: number; size: string }): Promise<WorkshopResult<LabelsPdfResult>> {
  try {
    const { client } = await requireErpPermission(input.accessToken, "inventory.read");
    const parsed = z.object({ codes: z.string().max(5000), from: z.number().int().min(1).max(999999999999).optional(), to: z.number().int().min(1).max(999999999999).optional(), size: labelSize }).parse(input);
    const wanted = new Set<string>();
    const code = (n: number) => `STU-${String(n).padStart(6, "0")}`;
    for (const token of parsed.codes.split(/[\s,;]+/).filter(Boolean)) {
      const match = /^(?:stu-?)?(\d{1,12})$/i.exec(token);
      if (!match) return { ok: false, error: "labels_bad_code", message: `«${token.slice(0, 40)}» no es un código válido. Use el formato STU-000123 o solo el número.` };
      wanted.add(code(Number(match[1])));
    }
    if (parsed.from || parsed.to) {
      const from = parsed.from ?? parsed.to!, to = parsed.to ?? parsed.from!;
      if (to < from || to - from >= 200) return { ok: false, error: "labels_bad_range", message: "El rango debe ir de menor a mayor y tener máximo 200 equipos." };
      for (let n = from; n <= to; n++) wanted.add(code(n));
    }
    if (!wanted.size) return { ok: false, error: "labels_empty", message: "Escriba al menos un STU o un rango." };
    if (wanted.size > 200) return { ok: false, error: "labels_too_many", message: "Máximo 200 etiquetas por PDF." };
    const { data, error } = await client.from("product_units").select("unit_code").in("unit_code", [...wanted]);
    if (error) throw new Error(error.message);
    const found = new Set((data ?? []).map(u => u.unit_code as string));
    const missing = [...wanted].filter(c => !found.has(c));
    if (missing.length) return { ok: false, error: "labels_unit_not_found", message: `No existe ninguna unidad registrada con: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}. Las etiquetas nuevas se generan arriba.` };
    return { ok: true, data: await pdfForCodes([...found], parsed.size, "reimpresion") };
  } catch (error) { return failure(error); }
}
export async function listWorkshopLabelBatches(input: { accessToken: unknown }): Promise<WorkshopResult<LabelBatch[]>> {
  try {
    const { client } = await requireErpPermission(input.accessToken, "inventory.read");
    const { data, error } = await client.from("workshop_qr_labels").select("batch_id,code,state,created_at").order("created_at", { ascending: false }).limit(2000);
    if (error) throw new Error(error.message);
    const batches = new Map<string, LabelBatch>();
    for (const row of data ?? []) {
      const b = batches.get(row.batch_id) ?? { batchId: row.batch_id, createdAt: row.created_at, total: 0, free: 0, assigned: 0, void: 0, first: row.code, last: row.code };
      b.total++; if (row.state === "free") b.free++; else if (row.state === "assigned") b.assigned++; else b.void++;
      if (row.code < b.first) b.first = row.code; if (row.code > b.last) b.last = row.code;
      batches.set(row.batch_id, b);
    }
    return { ok: true, data: [...batches.values()].slice(0, 12) };
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
