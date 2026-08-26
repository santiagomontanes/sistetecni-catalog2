import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSaleNumber, isValidSaleNumberFormat } from "./saleNumber";

test("formatSaleNumber: rellena con ceros a la izquierda hasta 6 dígitos", () => {
  assert.equal(formatSaleNumber(2026, 1), "SV-2026-000001");
  assert.equal(formatSaleNumber(2026, 42), "SV-2026-000042");
  assert.equal(formatSaleNumber(2026, 123456), "SV-2026-123456");
});

test("isValidSaleNumberFormat: acepta el formato correcto", () => {
  assert.equal(isValidSaleNumberFormat("SV-2026-000001"), true);
});

test("isValidSaleNumberFormat: rechaza formatos incorrectos", () => {
  assert.equal(isValidSaleNumberFormat("SV-26-000001"), false);
  assert.equal(isValidSaleNumberFormat("COT-000001"), false);
  assert.equal(isValidSaleNumberFormat("SV-2026-1"), false);
});
