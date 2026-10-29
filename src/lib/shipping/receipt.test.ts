import test from "node:test";
import assert from "node:assert/strict";
import type { AdminSaleDetailDTO } from "../salesAdmin/types";
import { shippingReceiptSale } from "./receipt";

const item = { id: "i1", itemType: "catalog", productId: "p1", productUnitId: "u1", unitCodeSnapshot: "STU-000027", serialNumberSnapshot: "S1", unitSpecOverridesSnapshot: null, productName: "Portátil X", productDescription: null, productImage: null, productSpecs: null, originalUnitPriceCop: 450000, unitPriceCop: 450000, quantity: 1, subtotalCop: 450000 };
const sale = { id: "s1", saleNumber: "V-1", createdAt: null, customerName: "Ana", customerDocument: "1", customerPhone: "3", customerEmail: null, subtotalCop: 450000, discountCop: 0, totalCop: 450000, paymentMethod: "transferencia", paymentStatus: "pagado", warrantyMonths: 3, notes: null, items: [item] } as unknown as AdminSaleDetailDTO;
const settled = { status: "delivered", received_cop: "390000", balance_cop: "0", guide: "G123", carrier: "Interrapidísimo" };

test("comprobante de envío: equipo por el valor consignado y el resto como costo de envío", () => {
  const receipt = shippingReceiptSale(sale, settled);
  assert.equal(receipt.items.length, 2);
  assert.equal(receipt.items[0].subtotalCop, 390000);
  assert.match(receipt.items[0].productName, /STU-000027 — valor real consignado/);
  assert.equal(receipt.items[1].subtotalCop, 60000);
  assert.match(receipt.items[1].productName, /Costo de envío y comisión de Interrapidísimo/);
  assert.equal(receipt.items[1].unitCodeSnapshot, null);
  assert.equal(receipt.totalCop, 450000);
  assert.equal(receipt.items.reduce((sum, i) => sum + i.subtotalCop, 0), receipt.totalCop);
  assert.match(receipt.notes ?? "", /no es factura electrónica DIAN/);
  assert.equal(sale.items.length, 1, "no modifica la venta original");
});
test("sin descuento de la transportadora no agrega línea de envío", () => {
  assert.equal(shippingReceiptSale(sale, { ...settled, received_cop: "450000" }).items.length, 1);
});
test("rechaza envíos con saldo, sin consignar o con consignación mayor a la venta", () => {
  assert.throws(() => shippingReceiptSale(sale, { ...settled, balance_cop: "1000" }), /not_settled/);
  assert.throws(() => shippingReceiptSale(sale, { ...settled, received_cop: "0" }), /not_settled/);
  assert.throws(() => shippingReceiptSale(sale, { ...settled, status: "dispatched" }), /not_settled/);
  assert.throws(() => shippingReceiptSale(sale, { ...settled, received_cop: "500000" }), /inconsistent/);
});
