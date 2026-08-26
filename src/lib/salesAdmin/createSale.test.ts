import { test } from "node:test";
import assert from "node:assert/strict";
import { createSaleAdmin } from "./createSale";
import { RepositoryError } from "../repositories/errors";
import type { ProductsRepository } from "../repositories/products.repository";
import type { NewSaleItemRow, NewSaleRow, SalesRepository, SaleWithItemsResult } from "../repositories/sales.repository";
import type { Product } from "../../types/product";

const USER_ID = "admin-1";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "10000000-0000-0000-0000-000000000001",
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

function createFakeProductsRepo(products: Product[]): { repo: ProductsRepository; products: Map<string, Product> } {
  const byId = new Map(products.map((p) => [p.id, p]));
  return {
    products: byId,
    repo: {
      async findById(id) {
        return byId.get(id) ?? null;
      },
      async findManyByIds(ids) {
        return ids.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
      },
      async findPersonalizerCandidates() {
        return [...byId.values()];
      },
      async search() {
        return [...byId.values()];
      },
    },
  };
}

interface FakeSalesRepoState {
  createCalls: number;
}

function createFakeSalesRepo(opts?: { throwUniqueViolationOnce?: boolean }): {
  repo: SalesRepository;
  state: FakeSalesRepoState;
} {
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

  const repo: SalesRepository = {
    async createWithItems(sale, items) {
      state.createCalls += 1;
      if (opts?.throwUniqueViolationOnce && !violationAlreadyThrown) {
        violationAlreadyThrown = true;
        // Simula que otra request concurrente ya insertó la venta con esta idempotencyKey.
        const raced = buildSale(sale, items);
        sales.set(raced.id, raced);
        byIdempotency.set(sale.idempotencyKey, raced);
        throw new RepositoryError("insert de sales falló", { code: "23505" });
      }
      const created = buildSale(sale, items);
      sales.set(created.id, created);
      byIdempotency.set(sale.idempotencyKey, created);
      return created;
    },
    async findById(id) {
      return sales.get(id) ?? null;
    },
    async findByIdempotencyKey(key) {
      return byIdempotency.get(key) ?? null;
    },
    async list() {
      return { items: [...sales.values()], total: sales.size };
    },
  };

  return { repo, state };
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

test("createSaleAdmin: multi-producto + descuento -> recalcula totales server-side", async () => {
  const { repo: productsRepo } = createFakeProductsRepo([
    makeProduct({ id: "10000000-0000-0000-0000-000000000001", price: 465000 }),
    makeProduct({ id: "10000000-0000-0000-0000-000000000002", price: 100000, title: "Mouse" }),
  ]);
  const { repo: salesRepo } = createFakeSalesRepo();

  const result = await createSaleAdmin(
    {
      ...BASE_INPUT,
      items: [
        { itemType: "catalog", productId: "10000000-0000-0000-0000-000000000001", unitPriceCop: 465000, quantity: 1 },
        { itemType: "catalog", productId: "10000000-0000-0000-0000-000000000002", unitPriceCop: 100000, quantity: 2 },
      ],
      discountCop: 65000,
      idempotencyKey: "11111111-1111-1111-1111-111111111111",
    },
    USER_ID,
    { salesRepo, productsRepo }
  );

  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.data.subtotalCop, 665000);
    assert.equal(result.data.discountCop, 65000);
    assert.equal(result.data.totalCop, 600000);
    assert.equal(result.data.items.length, 2);
  }
});

test("createSaleAdmin: ítem manual queda marcado item_type=manual sin product_id", async () => {
  const { repo: productsRepo } = createFakeProductsRepo([]);
  const { repo: salesRepo } = createFakeSalesRepo();

  const result = await createSaleAdmin(
    {
      ...BASE_INPUT,
      items: [{ itemType: "manual", description: "Mouse inalámbrico", unitPriceCop: 35000, quantity: 1 }],
      idempotencyKey: "22222222-2222-2222-2222-222222222222",
    },
    USER_ID,
    { salesRepo, productsRepo }
  );

  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.data.items[0].itemType, "manual");
    assert.equal(result.data.items[0].productId, null);
  }
});

test("createSaleAdmin: producto eliminado del catálogo antes de confirmar -> VALIDATION_ERROR", async () => {
  const { repo: productsRepo } = createFakeProductsRepo([]); // catálogo vacío: el producto ya no existe
  const { repo: salesRepo, state } = createFakeSalesRepo();

  const result = await createSaleAdmin(
    {
      ...BASE_INPUT,
      items: [{ itemType: "catalog", productId: "10000000-0000-0000-0000-000000000001", unitPriceCop: 465000, quantity: 1 }],
      idempotencyKey: "33333333-3333-3333-3333-333333333333",
    },
    USER_ID,
    { salesRepo, productsRepo }
  );

  assert.equal(result.ok, false);
  assert.equal(state.createCalls, 0); // nunca llega a intentar crear la venta
});

test("createSaleAdmin: snapshot inmutable — cambiar el precio del catálogo después no afecta la venta ya guardada", async () => {
  const { repo: productsRepo, products } = createFakeProductsRepo([makeProduct({ id: "10000000-0000-0000-0000-000000000001", price: 465000 })]);
  const { repo: salesRepo } = createFakeSalesRepo();

  const result = await createSaleAdmin(
    {
      ...BASE_INPUT,
      items: [{ itemType: "catalog", productId: "10000000-0000-0000-0000-000000000001", unitPriceCop: 465000, quantity: 1 }],
      idempotencyKey: "44444444-4444-4444-4444-444444444444",
    },
    USER_ID,
    { salesRepo, productsRepo }
  );
  assert.ok(result.ok);

  // El precio del catálogo sube DESPUÉS de la venta.
  products.set("10000000-0000-0000-0000-000000000001", { ...products.get("10000000-0000-0000-0000-000000000001")!, price: 520000 });

  const reread = await salesRepo.findById(result.ok ? result.data.id : "");
  assert.equal(reread?.items[0].unitPriceCop, 465000);
  assert.equal(reread?.items[0].originalUnitPriceCop, 465000);
});

test("createSaleAdmin: doble submit con la misma idempotencyKey -> no crea una segunda venta", async () => {
  const { repo: productsRepo } = createFakeProductsRepo([makeProduct({ id: "10000000-0000-0000-0000-000000000001" })]);
  const { repo: salesRepo, state } = createFakeSalesRepo();

  const input = {
    ...BASE_INPUT,
    items: [{ itemType: "catalog" as const, productId: "10000000-0000-0000-0000-000000000001", unitPriceCop: 465000, quantity: 1 }],
    idempotencyKey: "55555555-5555-5555-5555-555555555555",
  };

  const first = await createSaleAdmin(input, USER_ID, { salesRepo, productsRepo });
  const second = await createSaleAdmin(input, USER_ID, { salesRepo, productsRepo });

  assert.ok(first.ok && second.ok);
  if (first.ok && second.ok) assert.equal(first.data.id, second.data.id);
  assert.equal(state.createCalls, 1);
});

test("createSaleAdmin: colisión de unique (doble clic casi simultáneo) -> relee la venta ya creada, no falla", async () => {
  const { repo: productsRepo } = createFakeProductsRepo([makeProduct({ id: "10000000-0000-0000-0000-000000000001" })]);
  const { repo: salesRepo } = createFakeSalesRepo({ throwUniqueViolationOnce: true });

  const result = await createSaleAdmin(
    {
      ...BASE_INPUT,
      items: [{ itemType: "catalog", productId: "10000000-0000-0000-0000-000000000001", unitPriceCop: 465000, quantity: 1 }],
      idempotencyKey: "66666666-6666-6666-6666-666666666666",
    },
    USER_ID,
    { salesRepo, productsRepo }
  );

  assert.ok(result.ok);
});

test("createSaleAdmin: caracteres especiales/HTML en el nombre -> VALIDATION_ERROR", async () => {
  const { repo: productsRepo } = createFakeProductsRepo([makeProduct({ id: "10000000-0000-0000-0000-000000000001" })]);
  const { repo: salesRepo } = createFakeSalesRepo();

  const result = await createSaleAdmin(
    {
      ...BASE_INPUT,
      customerName: "<img src=x onerror=alert(1)>",
      items: [{ itemType: "catalog", productId: "10000000-0000-0000-0000-000000000001", unitPriceCop: 465000, quantity: 1 }],
      idempotencyKey: "77777777-7777-7777-7777-777777777777",
    },
    USER_ID,
    { salesRepo, productsRepo }
  );

  assert.equal(result.ok, false);
});
