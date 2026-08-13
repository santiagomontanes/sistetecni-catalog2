/**
 * Validación Zod de las Server Actions admin (B6) — nunca se confía en
 * valores enviados por el cliente, ni siquiera para algo tan aparentemente
 * inofensivo como un cambio de estado (punto 8 del pedido).
 */
import { z } from "zod";

const MAX_PRICE_COP = 100_000_000; // mismo tope que B3 (customerRequirementsSchema.budgetMax)
const MAX_LABEL_LENGTH = 120;

export const upgradeCategorySchema = z.enum(["ram", "storage"]);

export const createUpgradeSchema = z
  .object({
    category: upgradeCategorySchema,
    label: z.string().trim().min(1).max(MAX_LABEL_LENGTH),
    value: z.number().int().positive(),
    interface: z.string().trim().min(1).max(20).nullable(),
    extraCost: z.number().int().min(0).max(MAX_PRICE_COP),
    componentCost: z.number().int().min(0).max(MAX_PRICE_COP).nullable(),
    installCost: z.number().int().min(0).max(MAX_PRICE_COP).nullable(),
    active: z.boolean(),
  })
  .strict();

export const updateUpgradeSchema = createUpgradeSchema.partial().strict();

const uuidSchema = z.string().uuid();

export const setCompatibilitySchema = z
  .object({
    productId: uuidSchema,
    upgradeOptionIds: z.array(uuidSchema).max(200),
  })
  .strict();

export const copyCompatibilitySchema = z
  .object({
    sourceProductId: uuidSchema,
    targetProductId: uuidSchema,
  })
  .strict()
  .refine((v) => v.sourceProductId !== v.targetProductId, {
    message: "El producto origen y el destino no pueden ser el mismo.",
  });

/** Los 7 estados aprobados — única fuente de verdad, nunca se inventa uno nuevo aquí ni en ningún otro punto de B6. */
export const QUOTE_STATUSES = [
  "nueva",
  "en_revision",
  "contactada",
  "cotizada",
  "aceptada",
  "rechazada",
  "expirada",
] as const;

export const quoteStatusSchema = z.enum(QUOTE_STATUSES);

export const updateQuoteStatusSchema = z
  .object({
    quoteId: uuidSchema,
    status: quoteStatusSchema,
  })
  .strict();

export const listQuotesFilterSchema = z
  .object({
    status: quoteStatusSchema.optional(),
    codeSearch: z.string().trim().min(1).max(20).optional(),
  })
  .strict();

export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "(raíz)"}: ${issue.message}`);
}
