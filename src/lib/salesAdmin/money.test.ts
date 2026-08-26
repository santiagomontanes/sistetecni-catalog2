import { test } from "node:test";
import assert from "node:assert/strict";
import { computeItemSubtotalCop, computeSaleTotalsCop, NonIntegerMoneyError } from "./money";

test("computeItemSubtotalCop: multiplica precio unitario por cantidad, enteros", () => {
  assert.equal(computeItemSubtotalCop(465000, 2), 930000);
});

test("computeItemSubtotalCop: rechaza precio con decimales (COP no usa floats)", () => {
  assert.throws(() => computeItemSubtotalCop(465000.5, 1), NonIntegerMoneyError);
});

test("computeItemSubtotalCop: rechaza cantidad con decimales", () => {
  assert.throws(() => computeItemSubtotalCop(465000, 1.5), NonIntegerMoneyError);
});

test("computeSaleTotalsCop: múltiples productos suman correctamente", () => {
  const totals = computeSaleTotalsCop(
    [
      { unitPriceCop: 465000, quantity: 1 },
      { unitPriceCop: 100000, quantity: 2 },
    ],
    0
  );
  assert.deepEqual(totals, { subtotalCop: 665000, discountCop: 0, totalCop: 665000 });
});

test("computeSaleTotalsCop: descuento se resta del subtotal", () => {
  const totals = computeSaleTotalsCop([{ unitPriceCop: 500000, quantity: 1 }], 50000);
  assert.deepEqual(totals, { subtotalCop: 500000, discountCop: 50000, totalCop: 450000 });
});

test("computeSaleTotalsCop: descuento mayor al subtotal se recorta — nunca da total negativo", () => {
  const totals = computeSaleTotalsCop([{ unitPriceCop: 100000, quantity: 1 }], 999999999);
  assert.deepEqual(totals, { subtotalCop: 100000, discountCop: 100000, totalCop: 0 });
});

test("computeSaleTotalsCop: sin ítems -> subtotal y total en 0", () => {
  const totals = computeSaleTotalsCop([], 0);
  assert.deepEqual(totals, { subtotalCop: 0, discountCop: 0, totalCop: 0 });
});
