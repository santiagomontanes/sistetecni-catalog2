import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateShiftCop, validateCommand, validateJpeg, workedSeconds } from "./validation";
describe("asistencia: cálculos operativos exactos", () => {
  it("descuenta almuerzo y admite turnos que cruzan medianoche", () => {
    const seconds = workedSeconds("2026-10-20T22:00:00-05:00", "2026-10-21T06:00:00-05:00", "2026-10-21T01:00:00-05:00", "2026-10-21T01:30:00-05:00", false);
    assert.equal(seconds, BigInt(27000)); assert.equal(calculateShiftCop(BigInt(10000), seconds, "hourly"), BigInt(75000));
    assert.equal(calculateShiftCop(BigInt(75000), seconds, "per_shift"), BigInt(75000));
  });
  it("almuerzo remunerado y redondeo al peso sin floats monetarios", () => {
    assert.equal(workedSeconds("2026-10-20T08:00:00Z", "2026-10-20T10:00:00Z", "2026-10-20T09:00:00Z", "2026-10-20T09:30:00Z", true), BigInt(7200));
    assert.equal(calculateShiftCop(BigInt(3601), BigInt(1800), "hourly"), BigInt(1801));
    assert.equal(calculateShiftCop(BigInt(999999999999), BigInt(3600), "hourly"), BigInt(999999999999));
    assert.equal(calculateShiftCop(BigInt("999999999999"), BigInt(3600000000), "hourly"), BigInt("999999999999000000"));
  });
  it("rechaza cronología inconsistente y almuerzo incompleto", () => {
    assert.throws(() => workedSeconds("2026-10-20T10:00:00Z", "2026-10-20T08:00:00Z", null, null, false));
    assert.throws(() => workedSeconds("2026-10-20T08:00:00Z", "2026-10-20T10:00:00Z", "2026-10-20T09:00:00Z", null, false));
  });
});
describe("asistencia: contrato y evidencia", () => {
  it("solo permite acciones documentadas y montos enteros", () => {
    const envelope = { action: "payment", requestKey: "00000000-0000-4000-8000-000000000001", data: { settlementId: "00000000-0000-4000-8000-000000000002", amountCop: "9000", kind: "payment", method: "efectivo", reference: "PRUEBA-001" } };
    assert.equal(validateCommand(envelope).action, "payment");
    assert.throws(() => validateCommand({ ...envelope, data: { ...envelope.data, amountCop: "9000.1" } }));
    assert.throws(() => validateCommand({ ...envelope, action: "evidence.reserve" }));
    assert.throws(() => validateCommand({ ...envelope, action: "toString" }));
  });
  it("valida tamaño, MIME y firma JPEG", () => {
    validateJpeg(Uint8Array.from([255, 216, 255, 217]), "image/jpeg");
    assert.throws(() => validateJpeg(Uint8Array.from([1, 2, 3, 4]), "image/jpeg"));
    assert.throws(() => validateJpeg(new Uint8Array(524289), "image/jpeg"));
    assert.throws(() => validateJpeg(Uint8Array.from([255, 216, 255, 217]), "image/png"));
  });
});
