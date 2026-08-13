import { test } from "node:test";
import assert from "node:assert/strict";
import { validateManualForm, DEFAULT_MANUAL_FORM } from "./manualForm";
import type { ManualFormValues } from "./manualForm";

function values(overrides: Partial<ManualFormValues> = {}): ManualFormValues {
  return { ...DEFAULT_MANUAL_FORM, ...overrides };
}

// presupuesto
test("presupuesto: null -> inválido con mensaje", () => {
  const result = validateManualForm(values({ budgetMax: null }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.some((e) => e.includes("presupuesto")));
});

test("presupuesto: 0 o negativo -> inválido", () => {
  assert.equal(validateManualForm(values({ budgetMax: 0 })).ok, false);
  assert.equal(validateManualForm(values({ budgetMax: -100 })).ok, false);
});

test("presupuesto: no entero -> inválido", () => {
  assert.equal(validateManualForm(values({ budgetMax: 800000.5 })).ok, false);
});

test("presupuesto: por encima del máximo permitido -> inválido", () => {
  assert.equal(validateManualForm(values({ budgetMax: 200_000_000 })).ok, false);
});

test("presupuesto: valor válido -> ok, se refleja igual en requirements.budgetMax", () => {
  const result = validateManualForm(values({ budgetMax: 800000 }));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.requirements.budgetMax, 800000);
});

// RAM/almacenamiento
test("RAM/almacenamiento: valores dentro de las listas cerradas -> ok", () => {
  const result = validateManualForm(values({ budgetMax: 800000, ramMinGb: 16, storageMinGb: 500 }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.requirements.ramMinGb, 16);
    assert.equal(result.requirements.storageMinGb, 500);
  }
});

test("acumula todos los errores a la vez (presupuesto Y RAM/storage fuera de la lista cerrada, en un solo intento)", () => {
  const result = validateManualForm({
    budgetMax: null,
    ramMinGb: 12 as ManualFormValues["ramMinGb"], // fuera de RAM_OPTIONS_GB a propósito
    storageMinGb: 300 as ManualFormValues["storageMinGb"], // fuera de STORAGE_OPTIONS_GB a propósito
    cpuGenerationMin: null,
    gpu: "cualquiera",
    touch: "cualquiera",
    screenPreference: "cualquiera",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errors.length, 3); // presupuesto + RAM + storage, los 3 a la vez
  }
});

test("cpuGenerationMin null (\"cualquiera\") -> requirements.cpuGenerationMin queda undefined, nunca un valor inventado", () => {
  const result = validateManualForm(values({ budgetMax: 800000, cpuGenerationMin: null }));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.requirements.cpuGenerationMin, undefined);
});

test("preferencia de pantalla: 'liviano'/'grande' producen el mismo screenSize que los presets de Ayúdame a elegir", () => {
  const liviano = validateManualForm(values({ budgetMax: 800000, screenPreference: "liviano" }));
  const grande = validateManualForm(values({ budgetMax: 800000, screenPreference: "grande" }));
  assert.ok(liviano.ok && grande.ok);
  if (liviano.ok) assert.deepEqual(liviano.requirements.screenSize, { maxInches: 14 });
  if (grande.ok) assert.deepEqual(grande.requirements.screenSize, { minInches: 15 });
});

test("GPU/touch: no existe ningún campo para 'upgrade de CPU/GPU/pantalla' — son características base, no upgradeables (mismo principio de B3)", () => {
  const result = validateManualForm(values({ budgetMax: 800000, gpu: "dedicada", touch: "si" }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.requirements.gpu, "dedicada");
    assert.equal(result.requirements.touch, "si");
    assert.ok(!("gpuUpgrade" in result.requirements));
    assert.ok(!("cpuUpgrade" in result.requirements));
  }
});
