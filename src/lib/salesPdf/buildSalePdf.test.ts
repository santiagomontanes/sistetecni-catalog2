import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSalePdfBytes } from "./buildSalePdf";
import type { AdminSaleDetailDTO } from "../salesAdmin/types";

function seedSale(overrides: Partial<AdminSaleDetailDTO> = {}): AdminSaleDetailDTO {
  return {
    id: "s1",
    saleNumber: "SV-2026-000001",
    createdAt: "2026-08-26T00:00:00.000Z",
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
    items: [
      {
        id: "i1",
        itemType: "catalog",
        productId: "p1",
        productName: 'Acer 14" Intel / 8 GB RAM / 500 GB',
        productDescription: null,
        productImage: null,
        productSpecs: null,
        originalUnitPriceCop: 465000,
        unitPriceCop: 465000,
        quantity: 1,
        subtotalCop: 465000,
      },
    ],
    ...overrides,
  };
}

function assertIsPdf(bytes: Uint8Array): void {
  const header = Buffer.from(bytes.slice(0, 5)).toString("ascii");
  assert.equal(header, "%PDF-");
}

test("buildSalePdfBytes: genera un PDF válido con un solo ítem", async () => {
  const bytes = await buildSalePdfBytes(seedSale());
  assertIsPdf(bytes);
});

test("buildSalePdfBytes: no lanza con descuento y varios ítems", async () => {
  const bytes = await buildSalePdfBytes(
    seedSale({
      discountCop: 50000,
      totalCop: 415000,
      items: [
        {
          id: "i1",
          itemType: "catalog",
          productId: "p1",
          productName: "Portátil A",
          productDescription: null,
          productImage: null,
          productSpecs: null,
          originalUnitPriceCop: 300000,
          unitPriceCop: 300000,
          quantity: 1,
          subtotalCop: 300000,
        },
        {
          id: "i2",
          itemType: "manual",
          productId: null,
          productName: "Mouse inalámbrico",
          productDescription: null,
          productImage: null,
          productSpecs: null,
          originalUnitPriceCop: null,
          unitPriceCop: 165000,
          quantity: 1,
          subtotalCop: 165000,
        },
      ],
    })
  );
  assertIsPdf(bytes);
});

test("buildSalePdfBytes: no lanza con muchos ítems (fuerza paginación a una segunda hoja)", async () => {
  const items: AdminSaleDetailDTO["items"] = Array.from({ length: 40 }, (_, i) => ({
    id: `i${i}`,
    itemType: "manual" as const,
    productId: null,
    productName: `Accesorio número ${i} con una descripción bastante larga para forzar el ajuste de línea`,
    productDescription: null,
    productImage: null,
    productSpecs: null,
    originalUnitPriceCop: null,
    unitPriceCop: 10000,
    quantity: 1,
    subtotalCop: 10000,
  }));
  const bytes = await buildSalePdfBytes(seedSale({ items, subtotalCop: 400000, totalCop: 400000 }));
  assertIsPdf(bytes);
});

test("buildSalePdfBytes: no lanza con tildes/ñ y nombre de cliente largo", async () => {
  const bytes = await buildSalePdfBytes(
    seedSale({
      customerName: "María José Peñaloza Núñez de la Cruz y Restrepo Bermúdez",
      notes: "Cliente pidió envío a Bogotá, contactar por WhatsApp — garantía según política interna.",
    })
  );
  assertIsPdf(bytes);
});

test("buildSalePdfBytes: no lanza sin imagen en ningún ítem (nunca las necesita)", async () => {
  const bytes = await buildSalePdfBytes(seedSale());
  assertIsPdf(bytes);
});
