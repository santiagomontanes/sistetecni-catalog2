import { z } from "zod";

export const ERP_AGENT_ACTIONS = [
  "inventory.summary",
  "inventory.find",
  "sales.today",
  "cash.status",
  "expenses.today",
  "purchases.recent",
  "warranties.open",
  "customers.find",

  // P20.17B — inventario físico.
  "inventory.sequence_status",
  "inventory.resolve_unit",

  "inventory.reserve",
  "inventory.release",
  "customer.create",
  "expense.create",
  "cash.open",
  "cash.close",
  "cash.movement",
  "sale.create_by_stu",

  // P20.17B — recepción y administración de unidades físicas.
  "inventory.receive_units",
  "inventory.assign_manufacturer_serial",
  "inventory.correct_manufacturer_serial",
  "inventory.update_unit_condition",
] as const;

export type ErpAgentAction = (typeof ERP_AGENT_ACTIONS)[number];

const Base = z.object({
  waId: z.string().min(8).max(32),
  metaMessageId: z.string().min(8).max(300),
});

export const ErpAgentCommandSchema = Base.extend({
  kind: z.literal("command"),
  requestId: z.string().uuid(),
  action: z.enum(ERP_AGENT_ACTIONS),
  arguments: z.record(z.unknown()).default({}),
});

export const ErpAgentConfirmSchema = Base.extend({
  kind: z.literal("confirm"),
  requestId: z.string().uuid(),
  confirmationCode: z.string().regex(/^\d{6}$/),
});

export const ErpAgentCancelSchema = Base.extend({
  kind: z.literal("cancel"),
  requestId: z.string().uuid(),
});

export const ErpAgentRequestSchema = z.discriminatedUnion("kind", [
  ErpAgentCommandSchema,
  ErpAgentConfirmSchema,
  ErpAgentCancelSchema,
]);

export type ErpAgentRequest = z.infer<typeof ErpAgentRequestSchema>;
export type ErpAgentCommand = z.infer<typeof ErpAgentCommandSchema>;
