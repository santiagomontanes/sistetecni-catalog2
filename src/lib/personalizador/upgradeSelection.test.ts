import { test } from "node:test";
import assert from "node:assert/strict";
import { selectCheapestSatisfyingUpgrade } from "./upgradeSelection";
import { UPGRADE_RAM_16, UPGRADE_RAM_32 } from "./fixtures";
import type { CompatibleUpgrade } from "../../types/upgrade";

function compat(id: string, overrides: Partial<CompatibleUpgrade["option"]>): CompatibleUpgrade {
  return {
    compatibilityId: id,
    note: null,
    option: { ...UPGRADE_RAM_16, id, ...overrides },
  };
}

// Escenario 13: upgrade inactivo
test("13. un upgrade inactivo nunca se selecciona, aunque cumpla el mínimo y sea el más barato", () => {
  const options = [
    compat("inactivo-barato", { value: 16, extraCost: 10, active: false }),
    compat("activo-caro", { value: 16, extraCost: 90000, active: true }),
  ];
  const result = selectCheapestSatisfyingUpgrade(options, 16);
  assert.equal(result?.compatibilityId, "activo-caro");
});

// Escenario 14: compatibilidad duplicada
test("14. compatibilidad duplicada (misma opción dos veces) no rompe la selección ni la duplica", () => {
  const options = [compat("dup-1", { id: "opt-x", value: 16, extraCost: 70000 }), compat("dup-2", { id: "opt-x", value: 16, extraCost: 70000 })];
  const result = selectCheapestSatisfyingUpgrade(options, 16);
  assert.ok(result);
  assert.equal(result.option.id, "opt-x");
});

// Escenario 15: varias opciones RAM -> menor costo
test("15. varias opciones que satisfacen el mínimo -> se elige la de menor costo, no la de menor capacidad", () => {
  const options: CompatibleUpgrade[] = [
    { compatibilityId: "c16", note: null, option: UPGRADE_RAM_16 }, // value 16, cost 70000
    { compatibilityId: "c32", note: null, option: UPGRADE_RAM_32 }, // value 32, cost 150000
  ];
  const result = selectCheapestSatisfyingUpgrade(options, 16);
  assert.equal(result?.option.value, 16);
  assert.equal(result?.option.extraCost, 70000);
});

// Escenario 16: mismo criterio para storage
test("16. mismo criterio de menor costo aplica igual a la categoría storage", () => {
  const options = [
    compat("s256", { category: "storage", value: 256, extraCost: 60000 }),
    compat("s500", { category: "storage", value: 500, extraCost: 90000 }),
  ];
  const result = selectCheapestSatisfyingUpgrade(options, 256);
  assert.equal(result?.option.value, 256);
});

// Escenario 17: upgrade más grande pero más barato
test("17. si la opción de MAYOR capacidad es más barata, se elige esa (nunca se asume capacidad~costo)", () => {
  const options = [
    compat("pequena-cara", { value: 16, extraCost: 200000 }),
    compat("grande-barata", { value: 32, extraCost: 50000 }),
  ];
  const result = selectCheapestSatisfyingUpgrade(options, 16);
  assert.equal(result?.compatibilityId, "grande-barata");
  assert.equal(result?.option.value, 32);
});

test("empate exacto en costo y capacidad -> desempate determinista por id (mismo resultado siempre)", () => {
  const options = [
    compat("b-id", { id: "zzz", value: 16, extraCost: 70000 }),
    compat("a-id", { id: "aaa", value: 16, extraCost: 70000 }),
  ];
  const result1 = selectCheapestSatisfyingUpgrade(options, 16);
  const result2 = selectCheapestSatisfyingUpgrade([...options].reverse(), 16);
  assert.equal(result1?.option.id, "aaa");
  assert.equal(result2?.option.id, "aaa"); // mismo resultado sin importar el orden de entrada
});

test("ninguna opción alcanza el mínimo -> null (nunca se asume compatibilidad no confirmada)", () => {
  const options = [compat("insuficiente", { value: 8, extraCost: 10000 })];
  assert.equal(selectCheapestSatisfyingUpgrade(options, 16), null);
});

test("lista vacía -> null", () => {
  assert.equal(selectCheapestSatisfyingUpgrade([], 16), null);
});
