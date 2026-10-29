import { z } from "zod";

const uuid = z.string().uuid();
const reason = z.string().trim().min(3).max(1000);
const cop = z.string().regex(/^\d{1,13}$/).refine(v => BigInt(v) <= BigInt("1000000000000"), "Importe fuera de rango");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instant = z.string().datetime({ offset: true });
const correctionInstant = instant.nullable();
export const attendanceActions = {
  settings: z.object({ enabled: z.boolean().optional(), retentionDays: z.number().int().min(1).max(365).optional(), reason }).strict(),
  rate: z.object({ employeeId: uuid, effectiveFrom: instant, modality: z.enum(["hourly", "per_shift"]), amountCop: cop, paidLunch: z.boolean(), reason }).strict(),
  start: z.object({ evidenceId: uuid.optional() }).strict(),
  "lunch.start": z.object({ shiftId: uuid, version: z.number().int().positive() }).strict(),
  "lunch.end": z.object({ shiftId: uuid, version: z.number().int().positive() }).strict(),
  end: z.object({ shiftId: uuid, version: z.number().int().positive() }).strict(),
  correct: z.object({ shiftId: uuid, version: z.number().int().positive(), startedAt: instant.optional(), lunchStartedAt: correctionInstant.optional(), lunchEndedAt: correctionInstant.optional(), endedAt: correctionInstant.optional(), rateId: uuid.optional(), reason }).strict(),
  "settlement.create": z.object({ employeeId: uuid, from: date, to: date }).strict(),
  "settlement.adjust": z.object({ settlementId: uuid, amountCop: z.string().regex(/^-?\d{1,12}$/), reason }).strict(),
  "settlement.approve": z.object({ settlementId: uuid, amountCop: cop, reason }).strict(),
  "settlement.void": z.object({ settlementId: uuid, reason }).strict(),
  payment: z.object({ settlementId: uuid, amountCop: cop, kind: z.enum(["advance", "payment"]), reference: z.string().trim().min(3).max(120), method: z.enum(["efectivo", "transferencia", "nequi", "daviplata", "tarjeta", "otro"]) }).strict(),
  "payment.reverse": z.object({ settlementId: uuid, paymentId: uuid, reason }).strict(),
};
export type AttendanceAction = keyof typeof attendanceActions;
export function validateCommand(input: unknown) {
  const envelope = z.object({ action: z.string(), data: z.unknown(), requestKey: uuid }).strict().parse(input);
  if (!Object.prototype.hasOwnProperty.call(attendanceActions, envelope.action)) throw new Error("attendance_unknown_action");
  const action = envelope.action as AttendanceAction;
  return { action, data: attendanceActions[action].parse(envelope.data), requestKey: envelope.requestKey };
}

export function validateJpeg(bytes: Uint8Array, mime: string) {
  if (mime !== "image/jpeg" || bytes.length < 4 || bytes.length > 524288 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw new Error("attendance_invalid_photo");
  }
}

export function workedSeconds(start: string, end: string, lunchStart: string | null, lunchEnd: string | null, paidLunch: boolean): bigint {
  const elapsed = BigInt(Math.floor((Date.parse(end) - Date.parse(start)) / 1000));
  if (elapsed < BigInt(0) || Boolean(lunchStart) !== Boolean(lunchEnd)) throw new Error("attendance_invalid_times");
  const lunch = lunchStart && lunchEnd ? BigInt(Math.floor((Date.parse(lunchEnd) - Date.parse(lunchStart)) / 1000)) : BigInt(0);
  if (lunch < BigInt(0) || lunch > elapsed || (lunchStart && Date.parse(lunchStart) < Date.parse(start)) || (lunchEnd && Date.parse(lunchEnd) > Date.parse(end))) throw new Error("attendance_invalid_times");
  return elapsed - (paidLunch ? BigInt(0) : lunch);
}

/** Misma regla SQL: pesos enteros, redondeo por turno al peso más cercano, .5 hacia arriba. */
export function calculateShiftCop(amountCop: bigint, seconds: bigint, modality: "hourly" | "per_shift"): bigint {
  if (amountCop < BigInt(0) || seconds < BigInt(0)) throw new Error("attendance_invalid_amount");
  return modality === "per_shift" ? amountCop : (amountCop * seconds + BigInt(1800)) / BigInt(3600);
}

const MESSAGES: Record<string, string> = {
  attendance_disabled: "Asistencia está desactivada. Un administrador puede activarla en Configuración.",
  attendance_permission_denied: "No tienes permiso para esta operación.",
  attendance_shift_already_open: "Ya tienes un turno abierto. Actualiza la ficha.",
  attendance_version_conflict: "El turno cambió desde otro dispositivo. Actualiza antes de guardar.",
  attendance_shift_closed: "Este turno ya está cerrado.",
  attendance_lunch_already_started: "El almuerzo ya fue registrado.",
  attendance_lunch_not_open: "No hay un almuerzo abierto.",
  attendance_lunch_not_closed: "Registra el fin del almuerzo antes de salir.",
  attendance_evidence_required: "Captura una selfie nueva antes de iniciar el turno.",
  attendance_rate_missing: "Un turno no tiene tarifa. Asígnala mediante una corrección auditada antes de liquidar.",
  attendance_rate_snapshot_frozen: "La tarifa histórica de ese turno ya está fijada.",
  attendance_no_closed_shifts: "No hay turnos cerrados sin liquidar en ese período.",
  attendance_shift_already_settled: "El turno pertenece a una liquidación. Solo se pueden liberar borradores sin pagos.",
  attendance_payment_exceeds_balance: "El importe supera el saldo disponible o no es positivo.",
  attendance_settlement_frozen: "La liquidación ya está aprobada y no admite cambios.",
  attendance_idempotency_conflict: "La clave de reintento corresponde a otra operación.",
  attendance_login_required: "Confirma tu contraseña para iniciar el turno. Si ya la escribiste, vuelve a intentarlo.",
  attendance_invalid_photo: "La foto debe ser JPEG válido de máximo 512 KB.",
};
export function attendanceError(message: string) {
  return Object.entries(MESSAGES).find(([code]) => message.includes(code))?.[1] ?? "No se pudo guardar. Revisa los datos, actualiza y vuelve a intentar. Si persiste, contacta al administrador.";
}
