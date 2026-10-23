import test from "node:test";
import assert from "node:assert/strict";
import { parseQr, receiptSchema, validateWorkshopCommand } from "./validation";
test("QR admite texto o URL sin extraer datos sensibles", () => {
  assert.equal(parseQr("STQ-A01234567890"), "STQ-A01234567890");
  assert.equal(parseQr("https://erp.invalid/admin/taller?qr=STQ-A01234567890"), "STQ-A01234567890");
  assert.equal(parseQr("javascript:alert(1)"), null);
  assert.equal(parseQr("STU-123"), null);
});
test("recepción admite desconocidos; disco M.2 no implica NVMe", () => {
  const value = receiptSchema.parse({ physical: "unknown", screenType: "unknown", powersOn: "unchecked", video: "unchecked", chargerReceived: "unchecked", components: [{ kind: "storage", formFactor: "M.2" }, { kind: "ram", capacityGb: null }] });
  assert.equal(value.components[0].interface, undefined);
  assert.equal(value.components[1].capacityGb, null);
});
test("rechaza costo decimal, prueba sin instalación y omisión sin motivo", () => {
  assert.throws(() => validateWorkshopCommand("component_receive", { kind: "ram", locationId: "00000000-0000-4000-8000-000000000001", costCop: "12.5", componentCondition: "functional", snapshot: { kind: "ram" } }));
  const unit = { unitId: "00000000-0000-4000-8000-000000000001", version: 1 };
  assert.throws(() => validateWorkshopCommand("software", { ...unit, name: "Windows", installed: false, tested: true }));
  assert.throws(() => validateWorkshopCommand("check", { ...unit, code: "battery", result: "not_applicable" }));
  assert.throws(() => validateWorkshopCommand("component_move", { ...unit, componentId: unit.unitId, componentVersion: 1, direction: "remove", reason: "Ampliación" }));
});
