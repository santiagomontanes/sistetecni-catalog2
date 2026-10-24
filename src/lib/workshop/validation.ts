import { z } from "zod";

const optionalText = (max = 300) => z.string().trim().max(max).optional();
const uuid = z.string().uuid();
const money = z.string().regex(/^\d{1,15}$/, "Use pesos enteros, sin separadores").optional();
export const componentSchema = z.object({
  kind: z.enum(["ram", "storage", "charger"]),
  capacityGb: z.number().positive().max(100000).nullable().optional(),
  generation: z.enum(["DDR2", "DDR3", "DDR3L", "DDR4", "DDR5"]).nullable().optional(),
  formFactor: optionalText(50), technology: z.enum(["HDD", "SSD"]).nullable().optional(),
  interface: z.enum(["SATA", "NVMe", "IDE", "SAS", "unknown"]).optional(),
  connector: optionalText(80), voltage: z.number().positive().nullable().optional(),
  current: z.number().positive().nullable().optional(), watts: z.number().positive().nullable().optional(),
  notes: optionalText(500),
}).strict();
export const receiptSchema = z.object({
  brand: optionalText(100), model: optionalText(150), serial: optionalText(150), source: optionalText(200),
  physical: z.enum(["perfect", "good", "bad", "unknown"]),
  screenInches: z.number().positive().max(100).nullable().optional(),
  screenType: z.enum(["standard", "slim", "special", "unknown"]), screenNotes: optionalText(500),
  powersOn: z.enum(["yes", "no", "unchecked"]), video: z.enum(["yes", "no", "unchecked"]),
  apparentBattery: optionalText(500), chargerReceived: z.enum(["yes", "no", "unchecked", "not_applicable"]),
  components: z.array(componentSchema).max(30), notes: optionalText(4000),
}).strict();
const unitVersion = { unitId: uuid, version: z.number().int().nonnegative() };
const reason = z.string().trim().min(3).max(1000);
const schemas = {
  configure: z.object({ enabled: z.boolean() }), qr_batch: z.object({ count: z.number().int().min(1).max(200) }),
  qr_void: z.object({ code: z.string().regex(/^STU-\d{6,}$/), reason }),
  location: z.union([z.object({ code: z.string().trim().regex(/^[A-Z0-9_-]{1,32}$/), name: z.string().trim().min(1).max(120), parentId: uuid.optional() }), z.object({ id: uuid, active: z.boolean() })]),
  receive: z.object({ qrCode: z.string().regex(/^STU-\d{6,}$/), existingUnitId: z.union([uuid,z.string().regex(/^STU-\d{6,}$/)]).optional(), productId: uuid.optional(), locationId: uuid, costCop: money, condition: z.enum(["good", "fair", "bad"]), snapshot: receiptSchema }),
  component_receive: z.object({ kind: z.enum(["ram", "storage", "charger"]), locationId: uuid, costCop: money, componentCondition: z.enum(["untested", "functional", "defective"]), snapshot: componentSchema }),
  move: z.object({ ...unitVersion, locationId: uuid, reason }),
  phase: z.object({ ...unitVersion, phase: z.enum(["reception", "diagnosis", "technical", "aesthetic", "final_check", "ready", "warehouse"]), reason: reason.optional() }),
  correct_receipt: z.object({ ...unitVersion, snapshot: receiptSchema, reason }),
  configuration: z.object({ ...unitVersion, configuration: z.object({ cpu: optionalText(150), screen: optionalText(150), ramGeneration: z.enum(["DDR2", "DDR3", "DDR3L", "DDR4", "DDR5"]).nullable().optional(), ramFormFactor: optionalText(50), storageInterfaces: z.array(z.enum(["SATA", "NVMe", "IDE", "SAS"])).max(4).optional(), chargerVoltage: z.number().positive().nullable().optional(), chargerConnector: optionalText(80) }).strict(), reason }),
  check: z.object({ ...unitVersion, code: z.string().regex(/^[a-z0-9_]{1,50}$/), result: z.enum(["passed", "failed", "not_applicable"]), note: optionalText(2000) }).refine(v => v.result !== "not_applicable" || (v.note?.length ?? 0) >= 3, "Justifique por qué no aplica"),
  check_definition: z.object({ code: z.string().regex(/^[a-z0-9_]{1,50}$/), label: z.string().min(1).max(100), required: z.boolean(), active: z.boolean() }),
  software: z.object({ ...unitVersion, name: z.string().trim().min(1).max(100), edition: optionalText(100), softwareVersion: optionalText(100), installed: z.boolean(), tested: z.boolean(), notes: optionalText(2000) }).refine(v => !v.tested || v.installed, "No se puede probar software no instalado"),
  component_test: z.object({ ...unitVersion, condition: z.enum(["untested", "functional", "defective"]), reason }),
  component_move: z.object({ ...unitVersion, componentId: uuid, componentVersion: z.number().int().nonnegative(), direction: z.enum(["install", "remove"]), locationId: uuid.optional(), condition: z.enum(["untested", "functional", "defective"]).optional(), reason, reversalOf: uuid.optional() }).refine(v => v.direction !== "remove" || v.locationId, "Indique ubicación de destino"),
  usb: z.object({ code: z.string().trim().min(1).max(50), locationId: uuid.optional(), content: z.string().trim().min(1).max(1000), version: optionalText(100), bootModes: z.array(z.enum(["UEFI", "Legacy"])).max(2), active: z.boolean() }),
};
export type WorkshopAction = keyof typeof schemas;
export function validateWorkshopCommand(action: string, payload: unknown) {
  if (!Object.prototype.hasOwnProperty.call(schemas, action)) throw new Error("Acción desconocida");
  return schemas[action as WorkshopAction].parse(payload);
}
export function parseQr(value: string): string | null {
  const trimmed = value.trim();
  if (/^STU-\d{6,}$/i.test(trimmed)) return trimmed.toUpperCase();
  try { const url = new URL(trimmed); const qr = url.searchParams.get("qr"); return qr && /^STU-\d{6,}$/i.test(qr) ? qr.toUpperCase() : null; } catch { return null; }
}
