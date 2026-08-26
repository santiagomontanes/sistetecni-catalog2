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
  const result = customerNameSchema.parse("  Juan    Pérez  ");
  assert.equal(result, "Juan Pérez");
});

test("customerNameSchema: rechaza < y > (inyección básica de markup)", () => {
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

test("customerPhoneSchema: acepta formatos razonables con espacios/+/paréntesis", () => {
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

test("createSaleSchema: acepta un payload válido mínimo", () => {
  const result = createSaleSchema.safeParse(VALID_SALE_INPUT);
  assert.equal(result.success, true);
});

test("createSaleSchema: rechaza sin ítems", () => {
  const result = createSaleSchema.safeParse({ ...VALID_SALE_INPUT, items: [] });
  assert.equal(result.success, false);
});

test("createSaleSchema: rechaza campos extra (.strict())", () => {
  const result = createSaleSchema.safeParse({ ...VALID_SALE_INPUT, totalCop: 999999 });
  assert.equal(result.success, false);
});

test("createSaleSchema: rechaza método de pago fuera de la lista aprobada", () => {
  const result = createSaleSchema.safeParse({ ...VALID_SALE_INPUT, paymentMethod: "bitcoin" });
  assert.equal(result.success, false);
});

test("createSaleSchema: ítem manual sin descripción -> inválido", () => {
  const result = createSaleSchema.safeParse({
    ...VALID_SALE_INPUT,
    items: [{ itemType: "manual", description: "", unitPriceCop: 100000, quantity: 1 }],
  });
  assert.equal(result.success, false);
});

test("createSaleSchema: ítem manual válido", () => {
  const result = createSaleSchema.safeParse({
    ...VALID_SALE_INPUT,
    items: [{ itemType: "manual", description: "Mouse inalámbrico", unitPriceCop: 35000, quantity: 2 }],
  });
  assert.equal(result.success, true);
});

test("createSaleSchema: cantidad 0 o negativa -> inválido", () => {
  const result = createSaleSchema.safeParse({
    ...VALID_SALE_INPUT,
    items: [{ ...VALID_ITEM, quantity: 0 }],
  });
  assert.equal(result.success, false);
});
