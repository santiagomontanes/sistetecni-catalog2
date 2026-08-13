import { test } from "node:test";
import assert from "node:assert/strict";
import {
  customerRequirementsSchema,
  personalizadorRequestSchema,
  isHoneypotTriggered,
  HONEYPOT_FIELD_NAME,
} from "./schemas";

const validInput = {
  budgetMax: 800000,
  ramMinGb: 16,
  storageMinGb: 500,
  cpuGenerationMin: 8,
  gpu: "cualquiera" as const,
  touch: "cualquiera" as const,
};

test("acepta un payload válido completo", () => {
  const result = customerRequirementsSchema.safeParse(validInput);
  assert.equal(result.success, true);
});

test("acepta sin cpuGenerationMin ni screenSize (ambos opcionales)", () => {
  const rest: Partial<typeof validInput> = { ...validInput };
  delete rest.cpuGenerationMin;
  const result = customerRequirementsSchema.safeParse(rest);
  assert.equal(result.success, true);
});

// Escenario 23: presupuesto/RAM/storage inválidos
test("23. rechaza presupuesto <= 0", () => {
  assert.equal(customerRequirementsSchema.safeParse({ ...validInput, budgetMax: 0 }).success, false);
  assert.equal(customerRequirementsSchema.safeParse({ ...validInput, budgetMax: -100 }).success, false);
});

test("23b. rechaza RAM/almacenamiento no positivos o fuera de rango razonable", () => {
  assert.equal(customerRequirementsSchema.safeParse({ ...validInput, ramMinGb: 0 }).success, false);
  assert.equal(customerRequirementsSchema.safeParse({ ...validInput, ramMinGb: -8 }).success, false);
  assert.equal(customerRequirementsSchema.safeParse({ ...validInput, storageMinGb: 999999 }).success, false);
});

test("23c. rechaza generación de CPU inválida", () => {
  assert.equal(customerRequirementsSchema.safeParse({ ...validInput, cpuGenerationMin: -1 }).success, false);
  assert.equal(customerRequirementsSchema.safeParse({ ...validInput, cpuGenerationMin: 1.5 }).success, false);
});

test("23d. rechaza tamaño de pantalla fuera de rango razonable", () => {
  const result = customerRequirementsSchema.safeParse({ ...validInput, screenSize: { minInches: 50 } });
  assert.equal(result.success, false);
});

test("23e. rechaza enums inválidos de GPU/touch", () => {
  assert.equal(customerRequirementsSchema.safeParse({ ...validInput, gpu: "muy-rapida" }).success, false);
  assert.equal(customerRequirementsSchema.safeParse({ ...validInput, touch: "tal-vez" }).success, false);
});

test("23f. rechaza tipos incorrectos (string donde se espera number)", () => {
  assert.equal(customerRequirementsSchema.safeParse({ ...validInput, budgetMax: "800000" }).success, false);
});

test("23g. rechaza payloads con campos extra/enormes (defensa estructural vía .strict())", () => {
  const huge = "x".repeat(1_000_000);
  const result = customerRequirementsSchema.safeParse({ ...validInput, campoBasura: huge });
  assert.equal(result.success, false);
});

// Escenario 27: intento de pasar características fijas como upgrades
test("27. no existe forma de expresar 'upgrade de GPU/CPU/pantalla/touch' — cualquier intento se rechaza", () => {
  const result = customerRequirementsSchema.safeParse({
    ...validInput,
    gpuUpgrade: "dedicada",
    cpuUpgrade: 12,
    touchUpgrade: true,
  });
  assert.equal(result.success, false);
});

// Escenario 28: honeypot
test("28. isHoneypotTriggered: true cuando el campo oculto viene relleno (comportamiento de bot)", () => {
  assert.equal(isHoneypotTriggered({ [HONEYPOT_FIELD_NAME]: "http://spam.example" }), true);
});

test("28b. isHoneypotTriggered: false cuando el campo está vacío o ausente (comportamiento humano esperado)", () => {
  assert.equal(isHoneypotTriggered({ [HONEYPOT_FIELD_NAME]: "" }), false);
  assert.equal(isHoneypotTriggered({}), false);
});

test("el esquema de formulario (con honeypot) sigue aceptando un payload humano válido", () => {
  const result = personalizadorRequestSchema.safeParse({ ...validInput, [HONEYPOT_FIELD_NAME]: "" });
  assert.equal(result.success, true);
});
