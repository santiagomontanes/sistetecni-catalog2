import { test } from "node:test";
import assert from "node:assert/strict";
import { productStockModeSchema, transitionProductUnitSchema } from "./validation";

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const UNIT_ID = "33333333-3333-3333-3333-333333333333";

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

test("transitionProductUnitSchema: reserva exige nombre de cliente", () => {
  assert.equal(transitionProductUnitSchema.safeParse({ unitId: UNIT_ID, toStatus: "reserved" }).success, false);
  assert.equal(transitionProductUnitSchema.safeParse({
    unitId: UNIT_ID,
    toStatus: "reserved",
    reservationCustomerName: "María Pérez",
    reservationCustomerPhone: "3001234567",
    reservationExpiresAt: "2026-08-30T15:00:00.000Z",
    reason: "Separado por WhatsApp",
  }).success, true);
});

test("transitionProductUnitSchema: reparación/garantía/devolución/retiro exigen motivo", () => {
  for (const toStatus of ["repair", "warranty", "returned", "retired"] as const) {
    assert.equal(transitionProductUnitSchema.safeParse({ unitId: UNIT_ID, toStatus }).success, false);
    assert.equal(transitionProductUnitSchema.safeParse({ unitId: UNIT_ID, toStatus, reason: "Motivo de prueba" }).success, true);
  }
});

test("transitionProductUnitSchema: datos de reserva no se aceptan para otro estado", () => {
  assert.equal(transitionProductUnitSchema.safeParse({
    unitId: UNIT_ID,
    toStatus: "available",
    reservationCustomerName: "No debe pasar",
  }).success, false);
});

test("transitionProductUnitSchema: rechaza estados arbitrarios y campos extra", () => {
  assert.equal(transitionProductUnitSchema.safeParse({ unitId: UNIT_ID, toStatus: "lost" }).success, false);
  assert.equal(transitionProductUnitSchema.safeParse({ unitId: UNIT_ID, toStatus: "available", force: true }).success, false);
});
