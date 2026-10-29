import { z } from "zod";

const uuid = z.string().uuid();
const money = z.string().regex(/^(0|[1-9][0-9]{0,11})$/, "COP enteros, sin separadores ni decimales.");
const bounded = (min: number, max: number) => z.string().trim().min(min).max(max);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const versioned = { id: uuid, version: z.number().int().positive() };
const filters = { carrier: bounded(1, 100).optional(), reference: bounded(1, 100).optional(), from: date.optional(), to: date.optional(), search: bounded(1, 100).optional() };
export const transportConceptSchema=z.object({
  code:z.string().regex(/^[a-z0-9_-]{1,50}$/),kind:z.enum(["freight","commission","return","failed_delivery","other"]),description:bounded(3,300),
  amountCop:money.nullable(),costBearer:z.enum(["sistetecni","customer","unclassified"]),settlement:z.enum(["withheld","prepaid","payable","customer_direct","unclassified"]),
  provisional:z.boolean(),customerChargeCop:money.default("0"),customerChargeMode:z.enum(["none","included_in_sale","direct_to_carrier"]).default("none"),
  prepaymentMovementId:uuid.optional(),existingCostEntryId:uuid.optional(),
}).strict();
export const shippingArgumentSchemas = {
  list: z.object({ status: z.enum(["pending_guide", "ready", "dispatched", "incident", "delivered", "return_pending", "returned", "cancelled"]).optional(), offset: z.number().int().min(0).max(100000).optional(), limit: z.number().int().min(1).max(101).optional(), ...filters }).strict(),
  detail: z.object({ id: uuid }).strict(),
  references:z.object({id:uuid,search:bounded(0,80).optional()}).strict(),
  sales: z.object({ search: bounded(1, 100).optional() }).strict(),
  settings: z.object({}).strict(),
  jobs: z.object({}).strict(),
  metrics: z.object({}).strict(),
  deposits: z.object({ offset: z.number().int().min(0).max(100000).optional() }).strict(),
  pending_collections: z.object({ ...filters, limit: z.number().int().min(1).max(101).optional(), offset: z.number().int().min(0).max(100000).optional() }).strict(),
  search: z.object({ ...filters, amountCop: money }).strict(),
  configure: z.object({ enabled: z.boolean().optional(), reminderHour: z.number().int().min(0).max(23).optional(), recipientIds: z.array(uuid).max(30).optional() }).strict(),
  create: z.object({ saleId: uuid, name: bounded(2, 160), document: bounded(3, 40), phone: bounded(7, 30), city: bounded(2, 100), department: bounded(2, 100), officePickup: z.boolean(), address: bounded(3, 300), carrier: bounded(2, 100), paymentMode: z.enum(["cod", "prepaid"]), collectCop: money, notes: bounded(0, 4000).optional() }).strict(),
  guide: z.object({ ...versioned, guide: bounded(1, 100), freightCop: money, deductionsCop: money, deductionReason: bounded(0, 1000).optional(),transport:z.array(transportConceptSchema).min(1).max(20).optional() }).strict(),
  transport_save:z.object({...versioned,concept:transportConceptSchema,incurred:z.boolean().optional(),reason:bounded(3,1000),confirmed:z.literal(true)}).strict(),
  difference_review:z.object({id:uuid,reason:bounded(3,1000),resolved:z.boolean().default(false),confirmed:z.literal(true)}).strict(),
  apply_deposit_credit:z.object({...versioned,depositId:uuid,amountCop:money,confirmed:z.literal(true)}).strict(),
  dispatch: z.object(versioned).strict(),
  deliver: z.object({ ...versioned, deliveredAt: z.string().datetime({ offset: true }), expectedNetCop: money, evidence: bounded(1, 1000) }).strict(),
  incident: z.object({ ...versioned, reason: bounded(3, 1000),recognizeTransport:z.boolean().optional() }).strict(),
  cancel: z.object({ ...versioned, reason: bounded(3, 1000),recognizeTransport:z.boolean().optional() }).strict(),
  return: z.object({ ...versioned, reason: bounded(3, 1000),recognizeTransport:z.boolean().optional() }).strict(),
  quick_create: z.object({ stu: bounded(3, 60), name: bounded(2, 160), document: bounded(3, 40), phone: bounded(7, 30), city: bounded(2, 100), department: bounded(2, 100), address: bounded(3, 300), officePickup: z.boolean().optional(), carrier: bounded(2, 100), priceCop: money.optional(), notes: bounded(0, 4000).optional() }).strict(),
  return_confirm: z.object({ ...versioned, reason: bounded(3, 1000), guide: bounded(1, 100) }).strict(),
  reconcile: z.object({ amountCop: money, depositedOn: date, account: bounded(2, 160), reference: bounded(1, 160), evidence: bounded(0, 1000).optional(), confirmed: z.literal(true), allocations: z.array(z.object({ shipmentId: uuid, amountCop: money, version: z.number().int().positive(),finalSettlement:z.boolean().optional() }).strict()).min(1).max(50) }).strict(),
  reverse_deposit: z.object({ id: uuid, reason: bounded(3, 1000), confirmed: z.literal(true) }).strict(),
};
export type ShippingAction = keyof typeof shippingArgumentSchemas;
export interface ShippingCommand { action: ShippingAction; arguments: Record<string, unknown>; requestId?: string }
export const ShippingRequestSchema = z.object({ action: z.enum(Object.keys(shippingArgumentSchemas) as [ShippingAction, ...ShippingAction[]]), arguments: z.record(z.unknown()).default({}), requestId: uuid.optional() }).strict();
export const SHIPPING_READ_ACTIONS = new Set<ShippingAction>(["list", "detail", "references","sales", "settings", "jobs", "metrics", "deposits", "pending_collections", "search"]);
export function parseShippingCommand(value: unknown): ShippingCommand {
  const command = ShippingRequestSchema.parse(value);
  const args = shippingArgumentSchemas[command.action].parse(command.arguments);
  if (!SHIPPING_READ_ACTIONS.has(command.action) && !command.requestId) throw new Error("IDEMPOTENCY_REQUIRED");
  return { ...command, arguments: args };
}
export interface Shipment {
  transport_classified?:boolean;transport_review_required?:boolean;transport_company_cost_cop?:string;carrier_withheld_cop?:string;
  transport?:TransportConcept[];
  collection_differences?:{id:string;deposit_id:string;expected_cop:string;actual_cop:string;difference_cop:string;status:string;reason:string|null}[];
  id: string; sale_id: string; sale_number: string; recipient_name: string; recipient_document: string;
  recipient_phone: string; city: string; department: string; address: string; office_pickup: boolean;
  carrier: string; payment_mode: "cod" | "prepaid"; sale_value_cop: string; collect_cop: string;
  freight_cop: string | null; deductions_cop: string; expected_net_cop: string | null; received_cop: string;
  balance_cop: string; guide: string | null; status: string; collection_status: string; version: number;
  created_at: string; dispatched_at: string | null; delivered_at: string | null; notes: string | null;
  units: { id: string; unit_code: string }[];
  history?: { operation: string; at: string; actor: string; detail: Record<string, unknown> }[];
}
export interface TransportConcept{
 id:string;code:string;kind:string;description:string;amount_cop:string|null;cost_bearer:string;settlement:string;provisional:boolean;
 customer_charge_cop:string;customer_charge_mode:string;prepayment_movement_id:string|null;existing_cost_entry_id:string|null;recognized_at:string|null;updated_at:string;ledger_cop:string;allocated_expense_cop?:string;
}
