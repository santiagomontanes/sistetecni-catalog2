import { test } from "node:test";
import assert from "node:assert/strict";
import { listSalesAdmin } from "./listSales";
import { getSaleDetailAdmin } from "./getSale";
import type { SalesRepository, SaleWithItemsResult } from "../repositories/sales.repository";

function seedSale(overrides: Partial<SaleWithItemsResult> = {}): SaleWithItemsResult {
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

function fakeRepo(sales: SaleWithItemsResult[]): SalesRepository {
  return {
    async createWithItems() {
      throw new Error("no usado en este test");
    },
    async findById(id) {
      return sales.find((s) => s.id === id) ?? null;
    },
    async findByIdempotencyKey() {
      return null;
    },
    async list(filter) {
      const filtered = filter.search
        ? sales.filter((s) => s.saleNumber.includes(filter.search!) || s.customerName.includes(filter.search!))
        : sales;
      return { items: filtered, total: filtered.length };
    },
  };
}

test("listSalesAdmin: sin filtro devuelve todas mapeadas al DTO de listado", async () => {
  const repo = fakeRepo([seedSale({ id: "s1" }), seedSale({ id: "s2", saleNumber: "SV-2026-000002" })]);
  const result = await listSalesAdmin({}, repo);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.data.items.length, 2);
});

test("listSalesAdmin: filtro inválido (extra field, .strict()) -> VALIDATION_ERROR", async () => {
  const repo = fakeRepo([]);
  const result = await listSalesAdmin({ status: "pagado" }, repo);
  assert.equal(result.ok, false);
});

test("getSaleDetailAdmin: id inexistente -> NOT_FOUND", async () => {
  const repo = fakeRepo([]);
  const result = await getSaleDetailAdmin("11111111-1111-1111-1111-111111111111", repo);
  assert.deepEqual(result, { ok: false, error: "NOT_FOUND" });
});

test("getSaleDetailAdmin: id con formato inválido -> VALIDATION_ERROR, ni siquiera consulta", async () => {
  const repo = fakeRepo([]);
  const result = await getSaleDetailAdmin("no-es-un-uuid", repo);
  assert.equal(result.ok, false);
});

test("getSaleDetailAdmin: devuelve el detalle completo con sus ítems", async () => {
  const repo = fakeRepo([seedSale({ id: "11111111-1111-1111-1111-111111111111" })]);
  const result = await getSaleDetailAdmin("11111111-1111-1111-1111-111111111111", repo);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.data.saleNumber, "SV-2026-000001");
});
