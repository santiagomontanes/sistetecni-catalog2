import { test } from "node:test";
import assert from "node:assert/strict";
import { toAdminSaleListItemDTO, toAdminSaleDetailDTO } from "./dto";
import type { SaleWithItems } from "../../types/sale";

function seedSale(overrides: Partial<SaleWithItems> = {}): SaleWithItems {
  return {
    id: "s1",
    saleNumber: "SV-2026-000001",
    customerName: "Juan Pérez",
    customerDocument: "123456789",
    customerPhone: "3001234578",
    customerEmail: null,
    subtotalCop: 465000,
    discountCop: 0,
    totalCop: 465000,
    paymentMethod: "efectivo",
    paymentStatus: "pagado",
    warrantyMonths: 6,
    notes: null,
    dianStatus: "no_aplica",
    idempotencyKey: "k1",
    createdBy: null,
    createdAt: new Date("2026-08-26T00:00:00.000Z"),
    items: [],
    ...overrides,
  };
}

test("toAdminSaleListItemDTO: enmascara el celular del cliente", () => {
  const dto = toAdminSaleListItemDTO(seedSale());
  assert.equal(dto.customerPhoneMasked, "300*****78");
  assert.equal(dto.saleNumber, "SV-2026-000001");
});

test("toAdminSaleDetailDTO: expone el celular completo (ya pasó por requireAdmin) y los ítems", () => {
  const dto = toAdminSaleDetailDTO(
    seedSale({
      items: [
        {
          id: "i1",
          saleId: "s1",
          itemType: "catalog",
          productId: "p1",
          productName: "Acer 14\"",
          productDescription: "Intel / 8GB / 500GB",
          productImage: null,
          productSpecs: null,
          originalUnitPriceCop: 465000,
          unitPriceCop: 465000,
          quantity: 1,
          subtotalCop: 465000,
          sortOrder: 0,
          createdAt: null,
        },
      ],
    })
  );
  assert.equal(dto.customerPhone, "3001234578");
  assert.equal(dto.items.length, 1);
  assert.equal(dto.items[0].productName, "Acer 14\"");
});
