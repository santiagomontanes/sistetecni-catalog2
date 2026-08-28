import { test } from "node:test";
import assert from "node:assert/strict";
import { productStockModeSchema } from "./validation";

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";

test("productStockModeSchema: acepta activación ERP explícita", () => {
  const result = productStockModeSchema.safeParse({ productId: PRODUCT_ID, enabled: true });
  assert.equal(result.success, true);
});

test("productStockModeSchema: acepta volver explícitamente a stock manual", () => {
  const result = productStockModeSchema.safeParse({ productId: PRODUCT_ID, enabled: false });
  assert.equal(result.success, true);
});

test("productStockModeSchema: rechaza productId inválido", () => {
  const result = productStockModeSchema.safeParse({ productId: "no-es-uuid", enabled: true });
  assert.equal(result.success, false);
});

test("productStockModeSchema: no acepta truthy strings ni campos extra", () => {
  assert.equal(productStockModeSchema.safeParse({ productId: PRODUCT_ID, enabled: "true" }).success, false);
  assert.equal(productStockModeSchema.safeParse({ productId: PRODUCT_ID, enabled: true, stock: 999 }).success, false);
});
