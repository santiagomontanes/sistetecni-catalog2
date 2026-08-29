import { test } from "node:test";
import assert from "node:assert/strict";
import {
  customerNameSchema,
  customerDocumentSchema,
  customerPhoneSchema,
  customerEmailSchema,
  createSaleSchema,
} from "./validation";

test("customerNameSchema: normaliza espacios internos repetidos y recorta extremos", () => {
  assert.equal(customerNameSchema.parse("  Juan    Pérez  "), "Juan Pérez");
});

test("customerNameSchema: rechaza < y >", () => {
  assert.throws(() => customerNameSchema.parse("<script>alert(1)</script>"));
});

test("customerNameSchema: rechaza nombres demasiado cortos o largos", () => {
  assert.throws(() => customerNameSchema.parse("A"));
  assert.throws(() => customerNameSchema.parse("A".repeat(200)));
});

test("customerDocumentSchema: acepta dígitos, puntos y guiones; rechaza otros símbolos", () => {
  assert.equal(customerDocumentSchema.parse("1.234.567-8"), "1.234.567-8");
  assert.throws(() => customerDocumentSchema.parse("123; DROP TABLE sales;"));
});

test("customerPhoneSchema: acepta formatos razonables", () => {
  assert.equal(customerPhoneSchema.parse("300 123 4567"), "300 123 4567");
  assert.equal(customerPhoneSchema.parse("+57 (300) 123-4567"), "+57 (300) 123-4567");
});

test("customerPhoneSchema: rechaza un valor sin suficientes dígitos", () => {
  assert.throws(() => customerPhoneSchema.parse("abc"));
  assert.throws(() => customerPhoneSchema.parse("123"));
});

test("customerEmailSchema: normaliza a minúsculas y valida formato", () => {
  assert.equal(customerEmailSchema.parse("Cliente@Correo.COM"), "cliente@correo.com");
  assert.throws(() => customerEmailSchema.parse("no-es-correo"));
});

const VALID_ITEM = {
  itemType: "catalog" as const,
  productId: "11111111-1111-1111-1111-111111111111",
  productUnitId: "33333333-3333-3333-3333-333333333333",
  unitPriceCop: 465000,
  quantity: 1,
};

const VALID_SALE_INPUT = {
  customerName: "Juan Pérez",
  customerDocument: "123456789",
  customerPhone: "3001234567",
  items: [VALID_ITEM],
  discountCop: 0,
  paymentMethod: "efectivo",
  paymentStatus: "pagado",
  warrantyMonths: 6,
  idempotencyKey: "22222222-2222-2222-2222-222222222222",
};

test("createSaleSchema: acepta computador con productUnitId y cantidad 1", () => {
  assert.equal(createSaleSchema.safeParse(VALID_SALE_INPUT).success, true);
});

test("createSaleSchema: rechaza computador sin unidad física", () => {
  const withoutUnit = {
    itemType: VALID_ITEM.itemType,
    productId: VALID_ITEM.productId,
    unitPriceCop: VALID_ITEM.unitPriceCop,
    quantity: VALID_ITEM.quantity,
  };
  assert.equal(createSaleSchema.safeParse({ ...VALID_SALE_INPUT, items: [withoutUnit] }).success, false);
});

test("createSaleSchema: rechaza cantidad >1 para un computador físico", () => {
  assert.equal(createSaleSchema.safeParse({ ...VALID_SALE_INPUT, items: [{ ...VALID_ITEM, quantity: 2 }] }).success, false);
});

test("createSaleSchema: rechaza la misma unidad repetida", () => {
  assert.equal(createSaleSchema.safeParse({ ...VALID_SALE_INPUT, items: [VALID_ITEM, { ...VALID_ITEM }] }).success, false);
});

test("createSaleSchema: rechaza sin ítems", () => {
  assert.equal(createSaleSchema.safeParse({ ...VALID_SALE_INPUT, items: [] }).success, false);
});

test("createSaleSchema: rechaza campos extra (.strict())", () => {
  assert.equal(createSaleSchema.safeParse({ ...VALID_SALE_INPUT, totalCop: 999999 }).success, false);
});

test("createSaleSchema: rechaza método de pago fuera de la lista aprobada", () => {
  assert.equal(createSaleSchema.safeParse({ ...VALID_SALE_INPUT, paymentMethod: "bitcoin" }).success, false);
});

test("createSaleSchema: ítem manual sin descripción -> inválido", () => {
  assert.equal(createSaleSchema.safeParse({ ...VALID_SALE_INPUT, items: [{ itemType: "manual", description: "", unitPriceCop: 100000, quantity: 1 }] }).success, false);
});

test("createSaleSchema: ítem manual válido y permite cantidad >1", () => {
  assert.equal(createSaleSchema.safeParse({ ...VALID_SALE_INPUT, items: [{ itemType: "manual", description: "Mouse inalámbrico", unitPriceCop: 35000, quantity: 2 }] }).success, true);
});
