import { test } from "node:test";
import assert from "node:assert/strict";
import { createSupplierSchema } from "./validation";


test("createSupplierSchema acepta proveedor válido", () => {
  assert.equal(createSupplierSchema.safeParse({ name: "Proveedor prueba", documentType: "NIT", documentNumber: "900123456" }).success, true);
});

test("createSupplierSchema rechaza nombre vacío y campos extra", () => {
  assert.equal(createSupplierSchema.safeParse({ name: "x" }).success, false);
  assert.equal(createSupplierSchema.safeParse({ name: "Proveedor prueba", fake: true }).success, false);
});
