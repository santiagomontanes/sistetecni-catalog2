"use server";

import { z } from "zod";
import { requireErpPermission } from "@/lib/erpAuth/auth";
import { buildLabelsPdf } from "@/lib/workshop/labelsPdf";

export type AuctionResult<T> = { ok: true; data: T } | { ok: false; error: string; message: string };
export interface AuctionLot { id: string; lotNumber: string; supplierName: string | null; purchasedOn: string; machines: number; memories: number; disks: number; totalPriceCop: string; notes: string | null; batchId: string; createdAt: string; labels: { code: string; state: string }[] }
export interface AuctionCreated { lot: AuctionLot; pdfBase64: string }

const messages: Record<string, string> = {
  auction_units_1_to_200: "La suma de computadores, memorias y discos debe estar entre 1 y 200.",
  auction_invalid_request: "Revise los datos del remate: cantidades enteras y precio total en pesos sin decimales.",
  auction_idempotency_conflict: "Este envío ya se usó con datos diferentes. Recargue la página e inténtelo de nuevo.",
  workshop_disabled: "El taller está desactivado. Un administrador puede activarlo en el taller.",
};
function failure(error: unknown): AuctionResult<never> {
  if (error instanceof z.ZodError) return { ok: false, error: "VALIDATION", message: error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const message = error instanceof Error ? error.message : "";
  const key = Object.keys(messages).find(k => message.includes(k));
  if (key) return { ok: false, error: key, message: messages[key] };
  if (/permiso|autenticado|Sesión|permission_denied|row-level/i.test(message)) return { ok: false, error: "FORBIDDEN", message: "Solo el administrador puede registrar remates y generar QR." };
  return { ok: false, error: "AUCTION_ERROR", message: "No fue posible registrar el remate. Revise los datos y la migración; puede reintentar sin duplicar." };
}
const count = z.number().int().min(0).max(200);
const input = z.object({
  supplier: z.string().trim().max(160).default(""), purchasedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  machines: count, memories: count, disks: count, totalPriceCop: z.string().regex(/^\d{1,12}$/), notes: z.string().trim().max(1000).default(""),
  size: z.enum(["small", "medium", "large"]), requestKey: z.string().uuid(),
}).refine(v => v.machines + v.memories + v.disks >= 1, { message: "Indique al menos una pieza", path: ["machines"] });

// Registra el remate y reserva un STU por cada computador, memoria o disco comprado. Solo administrador.
export async function createAuctionLot(args: { accessToken: unknown } & z.input<typeof input>): Promise<AuctionResult<AuctionCreated>> {
  try {
    const { client } = await requireErpPermission(args.accessToken, "users.manage");
    const v = input.parse(args);
    const payload: Record<string, unknown> = { purchasedOn: v.purchasedOn, machines: v.machines, memories: v.memories, disks: v.disks, totalPriceCop: v.totalPriceCop };
    if (v.supplier) payload.supplier = v.supplier;
    if (v.notes) payload.notes = v.notes;
    const { data, error } = await client.rpc("erp_auction_lot_create", { p_payload: payload, p_key: v.requestKey });
    if (error) throw new Error(error.message);
    const lot = data as AuctionLot;
    const codes = lot.labels.map(l => l.code);
    const bytes = await buildLabelsPdf(codes, v.size, `Remate ${lot.lotNumber} · ${new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}`);
    return { ok: true, data: { lot, pdfBase64: Buffer.from(bytes).toString("base64") } };
  } catch (error) { return failure(error); }
}

export async function listAuctionLots(args: { accessToken: unknown }): Promise<AuctionResult<AuctionLot[]>> {
  try {
    const { client } = await requireErpPermission(args.accessToken, "users.manage");
    const { data, error } = await client.from("auction_lots").select("id,lot_number,supplier_name,purchased_on,machines,memories,disks,total_price_cop::text,notes,qr_batch_id,created_at").order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const batchIds = rows.map(r => r.qr_batch_id as string);
    const labels = batchIds.length ? await client.from("workshop_qr_labels").select("batch_id,code,state").in("batch_id", batchIds).limit(5000) : { data: [], error: null };
    if (labels.error) throw new Error(labels.error.message);
    return { ok: true, data: rows.map(r => ({ id: r.id, lotNumber: r.lot_number, supplierName: r.supplier_name, purchasedOn: r.purchased_on, machines: r.machines, memories: r.memories, disks: r.disks, totalPriceCop: String(r.total_price_cop), notes: r.notes, batchId: r.qr_batch_id, createdAt: r.created_at,
      labels: (labels.data ?? []).filter(l => l.batch_id === r.qr_batch_id).map(l => ({ code: l.code as string, state: l.state as string })).sort((a, b) => a.code.localeCompare(b.code)) })) };
  } catch (error) { return failure(error); }
}

// Reimpresión de un remate (todas sus etiquetas, estén o no usadas).
export async function reprintAuctionLot(args: { accessToken: unknown; lotId: string; size: string }): Promise<AuctionResult<{ pdfBase64: string; lotNumber: string; count: number }>> {
  try {
    const { client } = await requireErpPermission(args.accessToken, "users.manage");
    const v = z.object({ lotId: z.string().uuid(), size: z.enum(["small", "medium", "large"]) }).parse(args);
    const lot = await client.from("auction_lots").select("lot_number,qr_batch_id").eq("id", v.lotId).single();
    if (lot.error || !lot.data) return { ok: false, error: "NOT_FOUND", message: "No encontré ese remate." };
    const labels = await client.from("workshop_qr_labels").select("code").eq("batch_id", lot.data.qr_batch_id).order("code").limit(200);
    if (labels.error) throw new Error(labels.error.message);
    const codes = (labels.data ?? []).map(l => l.code as string);
    if (!codes.length) return { ok: false, error: "NO_LABELS", message: "Este remate no tiene etiquetas." };
    const bytes = await buildLabelsPdf(codes, v.size, `Remate ${lot.data.lot_number} · reimpresión`);
    return { ok: true, data: { pdfBase64: Buffer.from(bytes).toString("base64"), lotNumber: lot.data.lot_number, count: codes.length } };
  } catch (error) { return failure(error); }
}
