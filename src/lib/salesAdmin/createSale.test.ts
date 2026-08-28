import { test } from "node:test";
import assert from "node:assert/strict";
import { createSaleAdmin } from "./createSale";
import { RepositoryError } from "../repositories/errors";
import type { ProductsRepository } from "../repositories/products.repository";
import type { ProductUnitsRepository } from "../repositories/productUnits.repository";
import type { CustomersRepository } from "../repositories/customers.repository";
import type { NewSaleItemRow, NewSaleRow, SalesRepository, SaleWithItemsResult } from "../repositories/sales.repository";
import type { Product } from "../../types/product";
import type { ProductUnit } from "../../types/erp";

const USER_ID = "admin-1";
const PRODUCT_1 = "10000000-0000-0000-0000-000000000001";
const PRODUCT_2 = "10000000-0000-0000-0000-000000000002";
const UNIT_1 = "30000000-0000-0000-0000-000000000001";
const UNIT_2 = "30000000-0000-0000-0000-000000000002";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: PRODUCT_1,
    title: 'Acer 14"',
    brand: "Acer",
    model: "A314",
    cpu: "Intel Core i5",
    ram: 8,
    storage: "500 GB SSD",
    screen: '14"',
    price: 465000,
    condition: "Usado",
    stock: 3,
    images: ["https://example.com/acer.jpg"],
    featured: false,
    visibleWeb: true,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeUnit(id: string, productId: string, status: ProductUnit["status"] = "available"): ProductUnit {
  return {
    id,
    productId,
    unitCode: id === UNIT_1 ? "STU-000001" : "STU-000002",
    serialNumber: id === UNIT_1 ? "SERIAL-001" : "SERIAL-002",
    status,
    acquisitionCostCop: 300000,
    batteryHealthPercent: 90,
    storageHealthPercent: 95,
    specOverrides: {},
    images: [],
    notes: null,
    receivedAt: new Date("2026-08-28T00:00:00.000Z"),
    soldAt: null,
    createdBy: USER_ID,
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
  };
}

function createFakeProductsRepo(products: Product[]): { repo: ProductsRepository; products: Map<string, Product> } {
  const byId = new Map(products.map((p) => [p.id, p]));
  return {
    products: byId,
    repo: {
      async findById(id) { return byId.get(id) ?? null; },
      async findManyByIds(ids) { return ids.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p)); },
      async findPersonalizerCandidates() { return [...byId.values()]; },
      async search() { return [...byId.values()]; },
    },
  };
}

function createFakeUnitsRepo(units: ProductUnit[]): ProductUnitsRepository {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  return {
    async receive() { throw new Error("not used"); },
    async create() { throw new Error("not used"); },
    async findById(id) { return byId.get(id) ?? null; },
    async findBySerial(serial) { return [...byId.values()].find((u) => u.serialNumber === serial) ?? null; },
    async findByUnitCode(code) { return [...byId.values()].find((u) => u.unitCode === code) ?? null; },
    async listByProduct(productId) { return [...byId.values()].filter((u) => u.productId === productId); },
    async listByStatus(status) { return [...byId.values()].filter((u) => u.status === status); },
    async listAvailableByProduct(productId) { return [...byId.values()].filter((u) => u.productId === productId && u.status === "available"); },
    async markAvailable(id) {
      const unit = byId.get(id);
      if (!unit) throw new Error("not found");
      const updated = { ...unit, status: "available" as const };
      byId.set(id, updated);
      return updated;
    },
    async listRecent() { return [...byId.values()]; },
  };
}

function createFakeCustomersRepo(): CustomersRepository {
  return {
    async create() { throw new Error("not used"); },
    async findById() { return null; },
    async findByDocument() { return null; },
    async search() { return []; },
  };
}

interface FakeSalesRepoState { createCalls: number; }

function createFakeSalesRepo(opts?: { throwUniqueViolationOnce?: boolean }): { repo: SalesRepository; state: FakeSalesRepoState } {
  const state: FakeSalesRepoState = { createCalls: 0 };
  const sales = new Map<string, SaleWithItemsResult>();
  const byIdempotency = new Map<string, SaleWithItemsResult>();
  let seq = 0;
  let violationAlreadyThrown = false;

  function buildSale(sale: NewSaleRow, items: NewSaleItemRow[]): SaleWithItemsResult {
    seq += 1;
    const id = `sale-${seq}`;
    return {
      id,
      saleNumber: `SV-2026-${String(seq).padStart(6, "0")}`,
      customerId: sale.customerId ?? null,
      customerName: sale.customerName,
      customerDocument: sale.customerDocument,
      customerPhone: sale.customerPhone,
      customerEmail: sale.customerEmail,
      subtotalCop: sale.subtotalCop,
      discountCop: sale.discountCop,
      totalCop: sale.totalCop,
      paymentMethod: sale.paymentMethod as SaleWithItemsResult["paymentMethod"],
      paymentStatus: sale.paymentStatus as SaleWithItemsResult["paymentStatus"],
      warrantyMonths: sale.warrantyMonths,
      notes: sale.notes,
      dianStatus: "no_aplica",
      idempotencyKey: sale.idempotencyKey,
      createdBy: sale.createdBy,
      createdAt: new Date("2026-08-26T00:00:00.000Z"),
      items: items.map((item, idx) => ({ id: `item-${seq}-${idx}`, saleId: id, createdAt: null, ...item })),
    };
  }

  async function create(sale: NewSaleRow, items: NewSaleItemRow[]) {
    state.createCalls += 1;
    if (opts?.throwUniqueViolationOnce && !violationAlreadyThrown) {
      violationAlreadyThrown = true;
      const raced = buildSale(sale, items);
      sales.set(raced.id, raced);
      byIdempotency.set(sale.idempotencyKey, raced);
      throw new RepositoryError("insert falló", { code: "23505" });
    }
    const created = buildSale(sale, items);
    sales.set(created.id, created);
    byIdempotency.set(sale.idempotencyKey, created);
    return created;
  }

  return {
    state,
    repo: {
      createWithUnits: create,
      createWithItems: create,
      async findById(id) { return sales.get(id) ?? null; },
      async findByIdempotencyKey(key) { return byIdempotency.get(key) ?? null; },
      async list() { return { items: [...sales.values()], total: sales.size }; },
    },
  };
}

function deps(products: Product[], units: ProductUnit[], salesOpts?: { throwUniqueViolationOnce?: boolean }) {
  const productsFake = createFakeProductsRepo(products);
  const salesFake = createFakeSalesRepo(salesOpts);
  return {
    productsFake,
    salesFake,
    value: {
      salesRepo: salesFake.repo,
      productsRepo: productsFake.repo,
      productUnitsRepo: createFakeUnitsRepo(units),
      customersRepo: createFakeCustomersRepo(),
    },
  };
}

const BASE_INPUT = {
  customerName: "Juan Pérez",
  customerDocument: "123456789",
  customerPhone: "3001234567",
  paymentMethod: "efectivo",
  paymentStatus: "pagado",
  warrantyMonths: 6,
  discountCop: 0,
};

const CATALOG_ITEM_1 = { itemType: "catalog" as const, productId: PRODUCT_1, productUnitId: UNIT_1, unitPriceCop: 465000, quantity: 1 as const };

test("createSaleAdmin: dos computadores físicos distintos + descuento recalculan total", async () => {
  const setup = deps(
    [makeProduct({ id: PRODUCT_1, price: 465000 }), makeProduct({ id: PRODUCT_2, price: 100000, title: "Segundo equipo" })],
    [makeUnit(UNIT_1, PRODUCT_1), makeUnit(UNIT_2, PRODUCT_2)]
  );
  const result = await createSaleAdmin({
    ...BASE_INPUT,
    items: [CATALOG_ITEM_1, { itemType: "catalog", productId: PRODUCT_2, productUnitId: UNIT_2, unitPriceCop: 100000, quantity: 1 }],
    discountCop: 65000,
    idempotencyKey: "11111111-1111-1111-1111-111111111111",
  }, USER_ID, setup.value);

  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.data.subtotalCop, 565000);
    assert.equal(result.data.totalCop, 500000);
    assert.equal(result.data.items.length, 2);
  }
});

test("createSaleAdmin: ítem manual conserva cantidades múltiples", async () => {
  const setup = deps([], []);
  const result = await createSaleAdmin({
    ...BASE_INPUT,
    items: [{ itemType: "manual", description: "Mouse inalámbrico", unitPriceCop: 35000, quantity: 2 }],
    idempotencyKey: "22222222-2222-2222-2222-222222222222",
  }, USER_ID, setup.value);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.data.items[0].quantity, 2);
});

test("createSaleAdmin: unidad no disponible -> VALIDATION_ERROR y no crea venta", async () => {
  const setup = deps([makeProduct()], [makeUnit(UNIT_1, PRODUCT_1, "sold")]);
  const result = await createSaleAdmin({ ...BASE_INPUT, items: [CATALOG_ITEM_1], idempotencyKey: "33333333-3333-3333-3333-333333333333" }, USER_ID, setup.value);
  assert.equal(result.ok, false);
  assert.equal(setup.salesFake.state.createCalls, 0);
});

test("createSaleAdmin: unidad de otro producto -> VALIDATION_ERROR", async () => {
  const setup = deps([makeProduct()], [makeUnit(UNIT_1, PRODUCT_2)]);
  const result = await createSaleAdmin({ ...BASE_INPUT, items: [CATALOG_ITEM_1], idempotencyKey: "34333333-3333-3333-3333-333333333333" }, USER_ID, setup.value);
  assert.equal(result.ok, false);
});

test("createSaleAdmin: producto eliminado antes de confirmar -> VALIDATION_ERROR", async () => {
  const setup = deps([], [makeUnit(UNIT_1, PRODUCT_1)]);
  const result = await createSaleAdmin({ ...BASE_INPUT, items: [CATALOG_ITEM_1], idempotencyKey: "35333333-3333-3333-3333-333333333333" }, USER_ID, setup.value);
  assert.equal(result.ok, false);
  assert.equal(setup.salesFake.state.createCalls, 0);
});

test("createSaleAdmin: snapshot de precio queda congelado", async () => {
  const setup = deps([makeProduct({ price: 465000 })], [makeUnit(UNIT_1, PRODUCT_1)]);
  const result = await createSaleAdmin({ ...BASE_INPUT, items: [CATALOG_ITEM_1], idempotencyKey: "44444444-4444-4444-4444-444444444444" }, USER_ID, setup.value);
  assert.ok(result.ok);
  setup.productsFake.products.set(PRODUCT_1, { ...setup.productsFake.products.get(PRODUCT_1)!, price: 520000 });
  const reread = await setup.salesFake.repo.findById(result.ok ? result.data.id : "");
  assert.equal(reread?.items[0].originalUnitPriceCop, 465000);
});

test("createSaleAdmin: doble submit con misma idempotencyKey crea una sola venta", async () => {
  const setup = deps([makeProduct()], [makeUnit(UNIT_1, PRODUCT_1)]);
  const input = { ...BASE_INPUT, items: [CATALOG_ITEM_1], idempotencyKey: "55555555-5555-5555-5555-555555555555" };
  const first = await createSaleAdmin(input, USER_ID, setup.value);
  const second = await createSaleAdmin(input, USER_ID, setup.value);
  assert.ok(first.ok && second.ok);
  if (first.ok && second.ok) assert.equal(first.data.id, second.data.id);
  assert.equal(setup.salesFake.state.createCalls, 1);
});

test("createSaleAdmin: colisión unique de idempotencia relee la venta", async () => {
  const setup = deps([makeProduct()], [makeUnit(UNIT_1, PRODUCT_1)], { throwUniqueViolationOnce: true });
  const result = await createSaleAdmin({ ...BASE_INPUT, items: [CATALOG_ITEM_1], idempotencyKey: "66666666-6666-6666-6666-666666666666" }, USER_ID, setup.value);
  assert.ok(result.ok);
});

test("createSaleAdmin: HTML en nombre -> VALIDATION_ERROR", async () => {
  const setup = deps([makeProduct()], [makeUnit(UNIT_1, PRODUCT_1)]);
  const result = await createSaleAdmin({ ...BASE_INPUT, customerName: "<img src=x onerror=alert(1)>", items: [CATALOG_ITEM_1], idempotencyKey: "77777777-7777-7777-7777-777777777777" }, USER_ID, setup.value);
  assert.equal(result.ok, false);
});
