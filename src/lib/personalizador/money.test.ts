import { test } from "node:test";
import assert from "node:assert/strict";
import { assertIntegerMoney, sumMoney, calculateBudgetToleranceLimit } from "./money";

test("assertIntegerMoney: acepta enteros", () => {
  assert.doesNotThrow(() => assertIntegerMoney(620000, "precio"));
});

test("assertIntegerMoney: rechaza fraccionarios", () => {
  assert.throws(() => assertIntegerMoney(620000.5, "precio"), /debe ser un entero/);
});

test("sumMoney: suma exacta de varios valores enteros", () => {
  assert.equal(sumMoney([620000, 70000, 90000]), 780000);
});

test("sumMoney: rechaza si cualquier valor no es entero", () => {
  assert.throws(() => sumMoney([620000, 70000.25]));
});

// Escenario 9: exactamente +15%
test("calculateBudgetToleranceLimit: 800.000 -> límite exacto 920.000 (escenario 9)", () => {
  assert.equal(calculateBudgetToleranceLimit(800000), 920000);
});

// Escenario 10 (frontera): un peso por encima del límite
test("calculateBudgetToleranceLimit: el límite es una frontera exacta en pesos, sin arrastre de coma flotante", () => {
  const limit = calculateBudgetToleranceLimit(750000); // 750000*1.15 = 862500 exacto
  assert.equal(limit, 862500);
  assert.equal(Number.isInteger(limit), true);
});

test("calculateBudgetToleranceLimit: valores que en punto flotante directo (*1.15) darían error, aquí no", () => {
  // 733333 * 1.15 en JS puro puede arrastrar imprecisión binaria; con
  // aritmética entera (*115/100 + floor) el resultado es siempre limpio.
  const limit = calculateBudgetToleranceLimit(733333);
  assert.equal(Number.isInteger(limit), true);
  assert.equal(limit, Math.floor((733333 * 115) / 100));
});
