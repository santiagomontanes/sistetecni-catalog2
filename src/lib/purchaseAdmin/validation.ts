import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const optionalInteger = (min: number, max: number) => z.number().int().min(min).max(max).optional();

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2, "El nombre del proveedor es obligatorio.").max(160),
  documentType: optionalText(30),
  documentNumber: optionalText(80),
  contactName: optionalText(160),
  phone: optionalText(50),
  email: z.union([z.literal(""), z.string().trim().email("Correo inválido.").max(200)]).optional().transform((v) => v || undefined),
  address: optionalText(300),
  city: optionalText(120),
  notes: optionalText(2000),
}).strict();

const purchaseUnitSchema = z.object({
  productId: z.string().uuid("Producto inválido."),
  serialNumber: optionalText(120),
  baseCostCop: z.number().int().min(0).max(1_000_000_000),
  batteryHealthPercent: optionalInteger(0, 100),
  storageHealthPercent: optionalInteger(0, 100),
  ramGb: optionalInteger(1, 1024),
  storageGb: optionalInteger(1, 1_000_000),
  storageType: optionalText(40),
  conditionNotes: optionalText(1000),
  notes: optionalText(2000),
}).strict();

export const receivePurchaseBatchSchema = z.object({
  supplierId: z.string().uuid("Proveedor inválido."),
  supplierInvoiceReference: optionalText(120),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de compra inválida."),
  sharedCostsCop: z.number().int().min(0).max(1_000_000_000).default(0),
  notes: optionalText(2000),
  units: z.array(purchaseUnitSchema).min(1, "Agrega al menos un computador.").max(100),
}).strict().superRefine((value, ctx) => {
  const serials = new Set<string>();
  value.units.forEach((unit, index) => {
    if (!unit.serialNumber) return;
    const key = unit.serialNumber.trim().toLowerCase();
    if (serials.has(key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["units", index, "serialNumber"], message: "El mismo serial está repetido dentro del lote." });
    }
    serials.add(key);
  });
});

export const purchaseIdSchema = z.string().uuid("Compra inválida.");
export const purchaseListSchema = z.object({
  query: z.string().trim().max(100).default(""),
  limit: z.number().int().min(1).max(200).default(100),
}).strict();
export const supplierListSchema = z.object({ query: z.string().trim().max(100).default(""), limit: z.number().int().min(1).max(200).default(100) }).strict();

export function issuesFromPurchaseZod(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.message);
}
