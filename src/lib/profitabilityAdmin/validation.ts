import {z} from "zod";

const category=z.enum(["upgrade","repair","spare_part","labor","transport","after_sales","sale_fee","accessory","other"]);
export const profitabilityListSchema=z.object({limit:z.number().int().min(1).max(200).optional().default(100)}).strict();
export const unitProfitabilityIdSchema=z.string().uuid("Unidad inválida.");
export const addCostEntrySchema=z.object({
  scopeType:z.enum(["unit","sale"]),
  scopeId:z.string().uuid("Destino de costo inválido."),
  category,
  description:z.string().trim().min(3,"Describe el costo.").max(500),
  amountCop:z.number().int().positive("El costo debe ser mayor que cero.").max(1_000_000_000),
  incurredAt:z.string().datetime({offset:true}).optional(),
}).strict();
export const reverseCostEntrySchema=z.object({
  costEntryId:z.string().uuid("Costo inválido."),
  reason:z.string().trim().min(3,"Explica el motivo del reverso.").max(500),
}).strict();
export function issuesFromProfitabilityZod(error:z.ZodError):string[]{return error.issues.map(i=>i.message);}
