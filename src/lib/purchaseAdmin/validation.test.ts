import { test } from "node:test";
import assert from "node:assert/strict";
import { createSupplierSchema, receivePurchaseBatchSchema } from "./validation";

const SUPPLIER_ID = "11111111-1111-1111-1111-111111111111";
const PRODUCT_ID = "22222222-2222-2222-2222-222222222222";

test("createSupplierSchema acepta proveedor válido", () => {
  assert.equal(createSupplierSchema.safeParse({ name: "Proveedor prueba", documentType: "NIT", documentNumber: "900123456" }).success, true);
});

test("createSupplierSchema rechaza nombre vacío y campos extra", () => {
  assert.equal(createSupplierSchema.safeParse({ name: "x" }).success, false);
  assert.equal(createSupplierSchema.safeParse({ name: "Proveedor prueba", fake: true }).success, false);
});

test("receivePurchaseBatchSchema acepta lote serializado", () => {
  const result = receivePurchaseBatchSchema.safeParse({
    supplierId: SUPPLIER_ID,
    purchaseDate: "2026-08-29",
    sharedCostsCop: 30000,
    units: [
      { productId: PRODUCT_ID, serialNumber: "SER-001", baseCostCop: 500000 },
      { productId: PRODUCT_ID, serialNumber: "SER-002", baseCostCop: 510000, ramGb: 16, storageGb: 512, storageType: "SSD" },
    ],
  });
  assert.equal(result.success, true);
});

test("receivePurchaseBatchSchema rechaza serial duplicado en el mismo lote", () => {
  const result = receivePurchaseBatchSchema.safeParse({
    supplierId: SUPPLIER_ID,
    purchaseDate: "2026-08-29",
    sharedCostsCop: 0,
    units: [
      { productId: PRODUCT_ID, serialNumber: "SER-001", baseCostCop: 500000 },
      { productId: PRODUCT_ID, serialNumber: "ser-001", baseCostCop: 500000 },
    ],
  });
  assert.equal(result.success, false);
});

test("receivePurchaseBatchSchema exige costo entero no negativo y máximo 100 unidades", () => {
  assert.equal(receivePurchaseBatchSchema.safeParse({ supplierId: SUPPLIER_ID, purchaseDate: "2026-08-29", sharedCostsCop: 0, units: [{ productId: PRODUCT_ID, baseCostCop: -1 }] }).success, false);
  assert.equal(receivePurchaseBatchSchema.safeParse({ supplierId: SUPPLIER_ID, purchaseDate: "2026-08-29", sharedCostsCop: 0, units: Array.from({ length: 101 }, (_, i) => ({ productId: PRODUCT_ID, serialNumber: `S-${i}`, baseCostCop: 1 })) }).success, false);
});
