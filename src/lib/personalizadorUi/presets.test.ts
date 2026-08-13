import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequirementsFromAyudame, USE_CASE_OPTIONS, USE_CASE_PRESETS } from "./presets";
import type { UseCaseKey } from "./presets";

// Un test por preset (punto 3 del pedido: "quiero tests para cada preset")
for (const option of USE_CASE_OPTIONS) {
  test(`preset "${option.key}": produce requisitos técnicos válidos (RAM/storage positivos, budget respetado, GPU/touch válidos)`, () => {
    const requirements = buildRequirementsFromAyudame(option.key, 800000, "sin_preferencia");
    assert.equal(requirements.budgetMax, 800000);
    assert.ok(requirements.ramMinGb > 0);
    assert.ok(requirements.storageMinGb > 0);
    assert.ok(["cualquiera", "integrada", "dedicada"].includes(requirements.gpu));
    assert.ok(["cualquiera", "si", "no"].includes(requirements.touch));
    if (requirements.cpuGenerationMin !== undefined) {
      assert.ok(requirements.cpuGenerationMin > 0);
    }
  });
}

test("presets con GPU dedicada exigida: diseño, edición y gaming ligero (los únicos 3 usos donde se nota)", () => {
  const dedicatedGpu: UseCaseKey[] = ["diseno", "edicion", "gaming_ligero"];
  for (const key of dedicatedGpu) {
    assert.equal(USE_CASE_PRESETS[key].gpu, "dedicada", `${key} debería exigir GPU dedicada`);
  }
  const anyGpu: UseCaseKey[] = ["estudio", "oficina", "programacion", "profesional", "otro"];
  for (const key of anyGpu) {
    assert.equal(USE_CASE_PRESETS[key].gpu, "cualquiera", `${key} no debería exigir GPU dedicada`);
  }
});

test("es determinista: mismo input siempre produce el mismo resultado (sin aleatoriedad, sin IA)", () => {
  const a = buildRequirementsFromAyudame("programacion", 900000, "rendimiento");
  const b = buildRequirementsFromAyudame("programacion", 900000, "rendimiento");
  assert.deepEqual(a, b);
});

// preferencia "rendimiento": bump determinista de RAM
test('preferencia "rendimiento": sube la RAM del preset a 16 (si era menor) o a 32 (si ya era 16+)', () => {
  const estudioBase = buildRequirementsFromAyudame("estudio", 800000, "sin_preferencia"); // ramMinGb: 8
  const estudioRendimiento = buildRequirementsFromAyudame("estudio", 800000, "rendimiento");
  assert.equal(estudioBase.ramMinGb, 8);
  assert.equal(estudioRendimiento.ramMinGb, 16);

  const disenoBase = buildRequirementsFromAyudame("diseno", 800000, "sin_preferencia"); // ramMinGb: 16
  const disenoRendimiento = buildRequirementsFromAyudame("diseno", 800000, "rendimiento");
  assert.equal(disenoBase.ramMinGb, 16);
  assert.equal(disenoRendimiento.ramMinGb, 32);
});

// preferencia "almacenamiento": bump determinista de storage
test('preferencia "almacenamiento": sube el almacenamiento del preset a 500 (si era menor) o a 1000 (si ya era 500+)', () => {
  const estudioBase = buildRequirementsFromAyudame("estudio", 800000, "sin_preferencia"); // storageMinGb: 256
  const estudioMasAlmacenamiento = buildRequirementsFromAyudame("estudio", 800000, "almacenamiento");
  assert.equal(estudioBase.storageMinGb, 256);
  assert.equal(estudioMasAlmacenamiento.storageMinGb, 500);

  const disenoBase = buildRequirementsFromAyudame("diseno", 800000, "sin_preferencia"); // storageMinGb: 500
  const disenoMasAlmacenamiento = buildRequirementsFromAyudame("diseno", 800000, "almacenamiento");
  assert.equal(disenoBase.storageMinGb, 500);
  assert.equal(disenoMasAlmacenamiento.storageMinGb, 1000);
});

test('preferencia "liviano": agrega screenSize.maxInches=14, sin tocar RAM/almacenamiento', () => {
  const req = buildRequirementsFromAyudame("oficina", 800000, "liviano");
  assert.deepEqual(req.screenSize, { maxInches: 14 });
  assert.equal(req.ramMinGb, USE_CASE_PRESETS.oficina.ramMinGb);
});

test('preferencia "pantalla_grande": agrega screenSize.minInches=15', () => {
  const req = buildRequirementsFromAyudame("oficina", 800000, "pantalla_grande");
  assert.deepEqual(req.screenSize, { minInches: 15 });
});

test('preferencia "sin_preferencia": no modifica el preset base', () => {
  const base = USE_CASE_PRESETS.programacion;
  const req = buildRequirementsFromAyudame("programacion", 700000, "sin_preferencia");
  assert.equal(req.ramMinGb, base.ramMinGb);
  assert.equal(req.storageMinGb, base.storageMinGb);
  assert.equal(req.screenSize, undefined);
});
