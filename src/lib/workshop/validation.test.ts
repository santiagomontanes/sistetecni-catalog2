import test from "node:test";
import assert from "node:assert/strict";
import { parseQr, partCodePattern, receiptSchema, validateWorkshopCommand } from "./validation";
import { kindPrefixes, partKinds } from "./partKinds";
test("QR admite texto o URL sin extraer datos sensibles", () => {
  assert.equal(parseQr("STU-000123"), "STU-000123");
  assert.equal(parseQr("https://erp.invalid/admin/taller?qr=STU-000123"), "STU-000123");
  assert.equal(parseQr("javascript:alert(1)"), null);
  assert.equal(parseQr("83"), "STU-000083");
  assert.equal(parseQr("stu 93"), "STU-000093");
  assert.equal(parseQr("STU-123"), "STU-000123");
  assert.equal(parseQr("STU-"), null);
  assert.equal(parseQr("abc"), null);
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

test("la recepción exige costo de adquisición salvo al enlazar una unidad existente", () => {
  const base = { qrCode: "STU-000001", locationId: "00000000-0000-4000-8000-000000000001", condition: "good", snapshot: { physical: "unknown", screenType: "unknown", powersOn: "unchecked", video: "unchecked", chargerReceived: "unchecked", components: [] } };
  assert.throws(() => validateWorkshopCommand("receive", base));
  assert.ok(validateWorkshopCommand("receive", { ...base, costCop: "0" }));
  assert.ok(validateWorkshopCommand("receive", { ...base, existingUnitId: "STU-000002" }));
});
test("código por tipo de pieza: el QR de un disco, una memoria o un USB se reconoce y se completa a 4 dígitos", () => {
  assert.equal(parseQr("STUD-0001"), "STUD-0001");
  assert.equal(parseQr("stum 12"), "STUM-0012");
  assert.equal(parseQr("STUSB-7"), "STUSB-0007");
  assert.equal(parseQr("stubt0003"), "STUBT-0003");
  assert.equal(parseQr("https://erp.invalid/admin/taller?qr=STUC-0004"), "STUC-0004");
  assert.equal(parseQr("STUX-0001"), null);
  for (const k of partKinds) assert.match(`${kindPrefixes[k]}-0001`, partCodePattern, k);
  assert.ok(validateWorkshopCommand("component_receive", { qrCode: "STUD-0001", kind: "storage", locationId: "00000000-0000-4000-8000-000000000001", componentCondition: "untested", snapshot: { kind: "storage" } }));
});
