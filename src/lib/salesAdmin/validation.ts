/**
 * Validación Zod del módulo de ventas — nunca se confía en lo que manda el
 * navegador, ni en los totales (siempre se recalculan, ver money.ts) ni en
 * los datos del cliente. Mismo estilo que
 * src/lib/personalizadorAdmin/validation.ts: .strict() en objetos
 * compuestos, formatZodIssues() para mapear errores a strings legibles.
 */
import { z } from "zod";
import { formatZodIssues } from "../personalizadorAdmin/validation";
import { PAYMENT_METHODS, PAYMENT_STATUSES } from "../../types/sale";

export { formatZodIssues };

const MAX_UNIT_PRICE_COP = 500_000_000;
const MAX_DISCOUNT_COP = 500_000_000;
const MAX_QUANTITY = 999;
const MAX_WARRANTY_MONTHS = 120;
const MAX_ITEMS_PER_SALE = 50;

/** Colapsa espacios internos repetidos y recorta extremos — "normalizar espacios" del pedido. */
function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Rechaza los dos caracteres mínimos necesarios para inyectar markup (< >) — el resto ya lo escapa React al renderizar. */
const noHtmlAngleBrackets = (value: string) => !/[<>]/.test(value);

const uuidSchema = z.string().uuid();

export const customerNameSchema = z
  .string()
  .trim()
  .min(2, "El nombre debe tener al menos 2 caracteres.")
  .max(120, "El nombre no puede superar 120 caracteres.")
  .transform(normalizeSpaces)
  .refine(noHtmlAngleBrackets, "El nombre no puede contener < o >.");

export const customerDocumentSchema = z
  .string()
  .trim()
  .min(4, "El documento debe tener al menos 4 caracteres.")
  .max(20, "El documento no puede superar 20 caracteres.")
  .regex(/^[A-Za-z0-9.\-]+$/, "El documento solo puede contener letras, números, puntos y guiones.");

export const customerPhoneSchema = z
  .string()
  .trim()
  .transform(normalizeSpaces)
  .refine((v) => /^[0-9+()\-\s]{7,20}$/.test(v), "El celular tiene un formato inválido.")
  .refine((v) => (v.match(/\d/g)?.length ?? 0) >= 7, "El celular debe tener al menos 7 dígitos.");

export const customerEmailSchema = z.string().trim().toLowerCase().email("Correo inválido.").max(160);

const shortTextSchema = (max: number, min = 0) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .transform(normalizeSpaces)
    .refine(noHtmlAngleBrackets, "No se permiten los caracteres < o >.");

export const paymentMethodSchema = z.enum(PAYMENT_METHODS as [string, ...string[]]);
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES as [string, ...string[]]);

const moneyCopSchema = z.number().int().min(0).max(MAX_UNIT_PRICE_COP);
const quantitySchema = z.number().int().min(1).max(MAX_QUANTITY);

const catalogItemSchema = z
  .object({
    itemType: z.literal("catalog"),
    productId: uuidSchema,
    description: shortTextSchema(300).optional(),
    unitPriceCop: moneyCopSchema,
    quantity: quantitySchema,
  })
  .strict();

const manualItemSchema = z
  .object({
    itemType: z.literal("manual"),
    description: shortTextSchema(300, 1),
    unitPriceCop: moneyCopSchema,
    quantity: quantitySchema,
  })
  .strict();

export const saleItemInputSchema = z.discriminatedUnion("itemType", [catalogItemSchema, manualItemSchema]);

export const createSaleSchema = z
  .object({
    customerName: customerNameSchema,
    customerDocument: customerDocumentSchema,
    customerPhone: customerPhoneSchema,
    customerEmail: customerEmailSchema.nullable().optional(),
    items: z.array(saleItemInputSchema).min(1, "Debe agregar al menos un producto.").max(MAX_ITEMS_PER_SALE),
    discountCop: z.number().int().min(0).max(MAX_DISCOUNT_COP),
    paymentMethod: paymentMethodSchema,
    paymentStatus: paymentStatusSchema,
    warrantyMonths: z.number().int().min(0).max(MAX_WARRANTY_MONTHS),
    notes: shortTextSchema(1000).nullable().optional(),
    idempotencyKey: uuidSchema,
  })
  .strict();

export const listSalesFilterSchema = z
  .object({
    search: z.string().trim().min(1).max(60).optional(),
    offset: z.number().int().min(0).optional(),
    pageSize: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const getSaleSchema = uuidSchema;

export const searchProductsQuerySchema = z.string().trim().min(1, "Escribe algo para buscar.").max(80);
