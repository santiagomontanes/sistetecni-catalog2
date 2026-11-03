import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

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

export const purchaseIdSchema = z.string().uuid("Compra inválida.");
export const purchaseListSchema = z.object({
  query: z.string().trim().max(100).default(""),
  limit: z.number().int().min(1).max(200).default(100),
}).strict();
export const supplierListSchema = z.object({ query: z.string().trim().max(100).default(""), limit: z.number().int().min(1).max(200).default(100) }).strict();

export function issuesFromPurchaseZod(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.message);
}
