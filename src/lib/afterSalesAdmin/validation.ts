import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const openAfterSalesCaseSchema = z.object({
  saleItemId: z.string().uuid("Selecciona un equipo vendido válido."),
  caseType: z.enum(["warranty", "return"]),
  reportedIssue: z.string().trim().min(3, "Describe el motivo del ingreso.").max(2000),
  intakeCondition: optionalText(2000),
  evidenceUrls: z.array(z.string().trim().url("Cada evidencia debe ser una URL válida.").max(2000)).max(12).default([]),
}).strict();

export const progressAfterSalesCaseSchema = z.object({
  caseId: z.string().uuid("Caso inválido."),
  action: z.enum(["start_diagnosis", "send_repair", "waiting_customer", "close_returned", "close_retired", "cancel"]),
  note: optionalText(4000),
  diagnosis: optionalText(4000),
  costCop: z.number().int().min(0).max(1_000_000_000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === "send_repair" && (!value.diagnosis || value.diagnosis.length < 3)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["diagnosis"], message: "Registra el diagnóstico antes de enviar a reparación." });
  }
  if (["close_returned", "close_retired", "cancel"].includes(value.action) && (!value.note || value.note.length < 3)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["note"], message: "Registra una nota de resolución." });
  }
});

export const afterSalesCaseIdSchema = z.string().uuid("Caso inválido.");
export const afterSalesOriginIdSchema = z.string().uuid("Equipo vendido inválido.");

export const afterSalesListSchema = z.object({
  status: z.enum(["open", "diagnosing", "repair", "waiting_customer", "closed", "cancelled"]).optional(),
  query: z.string().trim().max(100).optional().default(""),
  limit: z.number().int().min(1).max(200).optional().default(100),
}).strict();

export function issuesFromAfterSalesZod(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.message);
}
