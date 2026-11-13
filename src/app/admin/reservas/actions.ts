"use server";

// Reservas: reservar un equipo para un cliente, y confirmar la venta desde la reserva (genera la venta y su comprobante).
// Reutiliza la transición de unidad (erp_transition_product_unit) y la creación de venta existentes; no crea reglas nuevas.
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/personalizadorAdmin/auth";
import { mapUnexpectedError } from "@/lib/personalizadorAdmin/errorMapping";
import type { AdminResult } from "@/lib/personalizadorAdmin/types";
import { createSaleAdmin } from "@/lib/salesAdmin";
import { customerDocumentSchema, customerNameSchema, customerPhoneSchema, paymentMethodSchema, paymentStatusSchema } from "@/lib/salesAdmin/validation";
import type { AdminSaleDetailDTO } from "@/lib/salesAdmin/types";
import { createSalesRepository } from "@/lib/repositories/sales.repository";
import { createProductsRepository } from "@/lib/repositories/products.repository";
import { createProductUnitsRepository } from "@/lib/repositories/productUnits.repository";
import { createCustomersRepository } from "@/lib/repositories/customers.repository";

export interface ReservationDTO {
  unitId: string; unitCode: string; serialNumber: string | null; productId: string | null; productTitle: string;
  priceCop: number; customerName: string | null; customerPhone: string | null; expiresAt: string | null; reservedAt: string | null; note: string | null; expired: boolean;
}
export interface ReservableUnitDTO { unitId: string; unitCode: string; productTitle: string; priceCop: number }

async function withAdmin<T>(action: string, accessToken: unknown, fn: (client: SupabaseClient, userId: string) => Promise<AdminResult<T>>): Promise<AdminResult<T>> {
  try {
    const { client, userId } = await requireAdmin(accessToken);
    return await fn(client, userId);
  } catch (err) {
    const mapped = mapUnexpectedError(err);
    if (mapped.error === "INTERNAL_ERROR") console.error(`[admin/reservas/actions] "${action}" falló: ${err instanceof Error ? err.message : String(err)}`);
    return mapped;
  }
}

type Row = { id: string; unit_code: string; serial_number: string | null; product_id: string | null; commercial_price_cop: number | string | null; reservation_customer_name: string | null; reservation_customer_phone: string | null; reservation_expires_at: string | null; reserved_at: string | null; reservation_note: string | null; products: { title: string; price: number | string | null } | { title: string; price: number | string | null }[] | null };
const SELECT = "id,unit_code,serial_number,product_id,commercial_price_cop,reservation_customer_name,reservation_customer_phone,reservation_expires_at,reserved_at,reservation_note,products(title,price)";
const productOf = (r: Row) => (Array.isArray(r.products) ? r.products[0] : r.products) ?? null;
const priceOf = (r: Row) => Math.round(Number(r.commercial_price_cop ?? productOf(r)?.price ?? 0));

export async function listReservations(payload: { accessToken: unknown }): Promise<AdminResult<{ items: ReservationDTO[] }>> {
  return withAdmin("listReservations", payload.accessToken, async client => {
    const { data, error } = await client.from("product_units").select(SELECT).eq("status", "reserved").eq("asset_kind", "computer").order("reservation_expires_at", { ascending: true, nullsFirst: false }).limit(200).returns<Row[]>();
    if (error) throw new Error(error.message);
    const now = Date.now();
    return { ok: true, data: { items: (data ?? []).map(r => ({
      unitId: r.id, unitCode: r.unit_code, serialNumber: r.serial_number, productId: r.product_id, productTitle: productOf(r)?.title ?? "Equipo sin producto",
      priceCop: priceOf(r), customerName: r.reservation_customer_name, customerPhone: r.reservation_customer_phone, expiresAt: r.reservation_expires_at, reservedAt: r.reserved_at, note: r.reservation_note,
      expired: !!r.reservation_expires_at && new Date(r.reservation_expires_at).getTime() < now,
    })) } };
  });
}

// Equipos disponibles que se pueden reservar (con producto del catálogo, que es lo que exige la venta).
export async function listReservableUnits(payload: { accessToken: unknown; query?: unknown }): Promise<AdminResult<{ items: ReservableUnitDTO[] }>> {
  return withAdmin("listReservableUnits", payload.accessToken, async client => {
    const q = typeof payload.query === "string" ? payload.query.trim().slice(0, 60).replace(/[%,()]/g, "") : "";
    let query = client.from("product_units").select(SELECT).eq("status", "available").eq("asset_kind", "computer").not("product_id", "is", null).order("unit_code").limit(40);
    if (q) query = query.ilike("unit_code", `%${q}%`);
    const { data, error } = await query.returns<Row[]>();
    if (error) throw new Error(error.message);
    const items = (data ?? []).map(r => ({ unitId: r.id, unitCode: r.unit_code, productTitle: productOf(r)?.title ?? "Equipo", priceCop: priceOf(r) }));
    return { ok: true, data: { items } };
  });
}

const reserveSchema = z.object({ unitId: z.string().uuid(), customerName: customerNameSchema, customerPhone: customerPhoneSchema, hours: z.number().int().min(1).max(720), note: z.string().trim().max(300).optional() });
export async function reserveUnit(payload: { accessToken: unknown; [k: string]: unknown }): Promise<AdminResult<{ unitId: string }>> {
  const { accessToken, ...rest } = payload;
  return withAdmin("reserveUnit", accessToken, async client => {
    const parsed = reserveSchema.safeParse(rest);
    if (!parsed.success) return { ok: false, error: "VALIDATION_ERROR", issues: parsed.error.issues.map(i => i.message) };
    const v = parsed.data;
    const { error } = await client.rpc("erp_transition_product_unit", { p_unit_id: v.unitId, p_to_status: "reserved", p_reason: v.note ?? null,
      p_reservation_customer_name: v.customerName, p_reservation_customer_phone: v.customerPhone, p_reservation_expires_at: new Date(Date.now() + v.hours * 3600_000).toISOString() });
    if (error) {
      if (/invalid_status_transition/.test(error.message)) return { ok: false, error: "VALIDATION_ERROR", issues: ["Ese equipo ya no está disponible para reservar."] };
      throw new Error(error.message);
    }
    return { ok: true, data: { unitId: v.unitId } };
  });
}

export async function releaseReservation(payload: { accessToken: unknown; unitId: unknown; reason?: unknown }): Promise<AdminResult<{ unitId: string }>> {
  return withAdmin("releaseReservation", payload.accessToken, async client => {
    const parsed = z.object({ unitId: z.string().uuid(), reason: z.string().trim().min(3).max(300) }).safeParse({ unitId: payload.unitId, reason: payload.reason });
    if (!parsed.success) return { ok: false, error: "VALIDATION_ERROR", issues: ["Escriba el motivo de la liberación (mínimo 3 letras)."] };
    const { error } = await client.rpc("erp_transition_product_unit", { p_unit_id: parsed.data.unitId, p_to_status: "available", p_reason: parsed.data.reason, p_reservation_customer_name: null, p_reservation_customer_phone: null, p_reservation_expires_at: null });
    if (error) {
      if (/invalid_status_transition/.test(error.message)) return { ok: false, error: "VALIDATION_ERROR", issues: ["Esa reserva ya no existe (el equipo cambió de estado)."] };
      throw new Error(error.message);
    }
    return { ok: true, data: { unitId: parsed.data.unitId } };
  });
}

const confirmSchema = z.object({
  unitId: z.string().uuid(), customerDocument: customerDocumentSchema, priceCop: z.number().int().min(0).max(500_000_000), discountCop: z.number().int().min(0).max(500_000_000),
  paymentMethod: paymentMethodSchema, paymentStatus: paymentStatusSchema, warrantyMonths: z.number().int().min(0).max(120), notes: z.string().trim().max(1000).optional(), idempotencyKey: z.string().uuid(),
});
// Confirma la venta de un equipo reservado: crea la venta con los datos de la reserva (la base valida que el cliente coincida) y devuelve el comprobante.
export async function confirmReservation(payload: { accessToken: unknown; [k: string]: unknown }): Promise<AdminResult<AdminSaleDetailDTO>> {
  const { accessToken, ...rest } = payload;
  return withAdmin("confirmReservation", accessToken, async (client, userId) => {
    const parsed = confirmSchema.safeParse(rest);
    if (!parsed.success) return { ok: false, error: "VALIDATION_ERROR", issues: parsed.error.issues.map(i => i.message) };
    const v = parsed.data;
    const { data, error } = await client.from("product_units").select(SELECT).eq("id", v.unitId).eq("status", "reserved").maybeSingle<Row>();
    if (error) throw new Error(error.message);
    if (!data || !data.product_id) return { ok: false, error: "VALIDATION_ERROR", issues: ["Ese equipo ya no está reservado."] };
    if (!data.reservation_customer_name) return { ok: false, error: "VALIDATION_ERROR", issues: ["La reserva no tiene cliente; libérela y reserve de nuevo con los datos del cliente."] };
    return createSaleAdmin({
      customerName: data.reservation_customer_name, customerDocument: v.customerDocument, customerPhone: data.reservation_customer_phone ?? "",
      items: [{ itemType: "catalog", productId: data.product_id, productUnitId: data.id, unitPriceCop: v.priceCop, quantity: 1 }],
      discountCop: v.discountCop, paymentMethod: v.paymentMethod, paymentStatus: v.paymentStatus, warrantyMonths: v.warrantyMonths, notes: v.notes ?? null, idempotencyKey: v.idempotencyKey,
    }, userId, { salesRepo: createSalesRepository(client), productsRepo: createProductsRepository(client), productUnitsRepo: createProductUnitsRepository(client), customersRepo: createCustomersRepository(client) });
  });
}
