import { z } from "zod";

function optionalTrimmed(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined));
}

function optionalInteger(min: number, max: number) {
  return z.preprocess(
    (value) => {
      if (value === "" || value === null || value === undefined) return undefined;
      if (typeof value === "string") {
        const parsed = Number(value.replace(/[^0-9.-]/g, ""));
        return Number.isFinite(parsed) ? parsed : value;
      }
      return value;
    },
    z.number().int().min(min).max(max).optional()
  );
}

export const customerSearchSchema = z.object({
  query: z.string().trim().max(100).default(""),
});

export const createCustomerAdminSchema = z.object({
  fullName: z.string().trim().min(2, "El nombre es obligatorio.").max(160),
  documentType: optionalTrimmed(30),
  documentNumber: optionalTrimmed(80),
  phone: optionalTrimmed(50),
  email: z
    .union([z.literal(""), z.string().trim().email("El correo no es válido.").max(200)])
    .optional()
    .transform((value) => (value ? value : undefined)),
  address: optionalTrimmed(300),
  city: optionalTrimmed(120),
  notes: optionalTrimmed(2000),
});

export const inventoryListSchema = z.object({
  limit: z.number().int().min(1).max(200).default(100),
});

export const productSearchSchema = z.object({
  query: z.string().trim().min(1).max(100),
});

export const unitIdSchema = z.string().uuid("Selecciona una unidad válida.");

export const productStockModeSchema = z
  .object({
    productId: z.string().uuid("Selecciona un producto válido."),
    enabled: z.boolean(),
  })
  .strict();

export const receiveProductUnitAdminSchema = z.object({
  productId: z.string().uuid("Selecciona un producto válido."),
  serialNumber: optionalTrimmed(120),
  acquisitionCostCop: optionalInteger(0, 1_000_000_000),
  batteryHealthPercent: optionalInteger(0, 100),
  storageHealthPercent: optionalInteger(0, 100),
  ramGb: optionalInteger(1, 1024),
  storageGb: optionalInteger(1, 1_000_000),
  storageType: optionalTrimmed(40),
  conditionNotes: optionalTrimmed(1000),
  notes: optionalTrimmed(2000),
});

export function issuesFromZod(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.message);
}
