/**
 * A diferencia de repositories.unit.test.ts (que usa makeStatefulFakeClient
 * de fakeClient.ts, pensado para UNA tabla), SalesRepository necesita dos
 * tablas relacionadas (sales/sale_items) más .or()/.delete()/.range() —
 * de ahí este fake local, propio de este archivo, en vez de extender el
 * fake compartido para un caso de uso que hoy solo tiene un consumidor.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSalesRepository } from "./sales.repository";
import { RepositoryError } from "./errors";

interface FakeTable {
  rows: Record<string, unknown>[];
  failNextInsert?: boolean;
}

let idCounter = 0;
let saleNumberCounter = 0;

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown; count?: number }> {
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private mode: "select" | "insert" | "delete" = "select";
  private insertRows: Record<string, unknown>[] = [];
  private selectCols = "*";
  private wantCount = false;
  private rangeFrom?: number;
  private rangeTo?: number;

  constructor(private tables: Record<string, FakeTable>, private tableName: string) {}

  select(cols: string, opts?: { count?: string }) {
    this.selectCols = cols;
    if (opts?.count) this.wantCount = true;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((row) => row[col] === val);
    return this;
  }
  or(expr: string) {
    const conditions = expr.split(",").map((c) => {
      const [col, op, val] = c.split(".");
      return { col, op, val };
    });
    this.filters.push((row) =>
      conditions.some((c) => {
        if (c.op !== "ilike") return false;
        const needle = c.val.replace(/%/g, "").toLowerCase();
        return String(row[c.col] ?? "").toLowerCase().includes(needle);
      })
    );
    return this;
  }
  order() {
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
    this.mode = "insert";
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  returns() {
    return this;
  }
  async single() {
    const { data, error } = await this.exec();
    const row = Array.isArray(data) ? data[0] : data;
    return { data: row ?? null, error: row ? null : (error ?? { message: "not found" }) };
  }
  async maybeSingle() {
    const { data, error } = await this.exec();
    const row = Array.isArray(data) ? data[0] : data;
    return { data: row ?? null, error };
  }
  then<TResult1, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }

  private async exec(): Promise<{ data: unknown; error: unknown; count?: number }> {
    const table = this.tables[this.tableName];

    if (this.mode === "insert") {
      if (table.failNextInsert) {
        table.failNextInsert = false;
        return { data: null, error: { message: "simulated insert failure", code: "XXFAIL" } };
      }
      const created = this.insertRows.map((r) => {
        idCounter += 1;
        const row: Record<string, unknown> = { id: `${this.tableName}-${idCounter}`, created_at: "2026-08-26T00:00:00.000Z", ...r };
        if (this.tableName === "sales" && !row.sale_number) {
          saleNumberCounter += 1;
          row.sale_number = `SV-2026-${String(saleNumberCounter).padStart(6, "0")}`;
        }
        return row;
      });
      table.rows.push(...created);
      return { data: created, error: null };
    }

    if (this.mode === "delete") {
      const matching = table.rows.filter((r) => this.filters.every((f) => f(r)));
      table.rows = table.rows.filter((r) => !matching.includes(r));
      return { data: matching, error: null };
    }

    let matching = table.rows.filter((r) => this.filters.every((f) => f(r)));
    const total = matching.length;
    if (this.rangeFrom !== undefined) {
      matching = matching.slice(this.rangeFrom, (this.rangeTo ?? matching.length) + 1);
    }
    if (this.selectCols.includes("sale_items(*)")) {
      matching = matching.map((r) => ({
        ...r,
        sale_items: this.tables.sale_items.rows.filter((i) => i.sale_id === r.id),
      }));
    }
    return { data: matching, error: null, count: this.wantCount ? total : undefined };
  }
}

function createFakeClient(): { client: SupabaseClient; tables: Record<string, FakeTable> } {
  const tables: Record<string, FakeTable> = { sales: { rows: [] }, sale_items: { rows: [] } };
  const client = {
    from: (table: string) => new FakeQuery(tables, table),
  } as unknown as SupabaseClient;
  return { client, tables };
}

const SALE_ROW = {
  customerName: "Juan Pérez",
  customerDocument: "123456789",
  customerPhone: "3001234567",
  customerEmail: null,
  subtotalCop: 465000,
  discountCop: 0,
  totalCop: 465000,
  paymentMethod: "efectivo",
  paymentStatus: "pagado",
  warrantyMonths: 6,
  notes: null,
  idempotencyKey: "11111111-1111-1111-1111-111111111111",
  createdBy: null,
};

const ITEM_ROW = {
  itemType: "catalog" as const,
  productId: "p1",
  productName: 'Acer 14"',
  productDescription: null,
  productImage: null,
  productSpecs: null,
  originalUnitPriceCop: 465000,
  unitPriceCop: 465000,
  quantity: 1,
  subtotalCop: 465000,
  sortOrder: 0,
};

test("createWithItems: crea la venta y sus ítems, ordenados por sortOrder", async () => {
  const { client, tables } = createFakeClient();
  const repo = createSalesRepository(client);

  const created = await repo.createWithItems(SALE_ROW, [
    { ...ITEM_ROW, productName: "Segundo", sortOrder: 1 },
    { ...ITEM_ROW, productName: "Primero", sortOrder: 0 },
  ]);

  assert.equal(created.items.length, 2);
  assert.equal(created.items[0].productName, "Primero");
  assert.equal(created.items[1].productName, "Segundo");
  assert.equal(tables.sales.rows.length, 1);
  assert.equal(tables.sale_items.rows.length, 2);
});

test("createWithItems: si el insert de sale_items falla, borra (compensa) la venta ya creada", async () => {
  const { client, tables } = createFakeClient();
  tables.sale_items.failNextInsert = true;
  const repo = createSalesRepository(client);

  await assert.rejects(() => repo.createWithItems(SALE_ROW, [ITEM_ROW]), RepositoryError);
  assert.equal(tables.sales.rows.length, 0, "la venta huérfana debe haberse borrado");
});

test("findById: trae la venta con sus ítems embebidos (join sale_items)", async () => {
  const { client } = createFakeClient();
  const repo = createSalesRepository(client);
  const created = await repo.createWithItems(SALE_ROW, [ITEM_ROW]);

  const found = await repo.findById(created.id);
  assert.ok(found);
  assert.equal(found?.items.length, 1);
  assert.equal(found?.customerName, "Juan Pérez");
});

test("findById: id inexistente -> null", async () => {
  const { client } = createFakeClient();
  const repo = createSalesRepository(client);
  const found = await repo.findById("no-existe");
  assert.equal(found, null);
});

test("findByIdempotencyKey: clave inexistente -> null", async () => {
  const { client } = createFakeClient();
  const repo = createSalesRepository(client);
  const found = await repo.findByIdempotencyKey("no-existe");
  assert.equal(found, null);
});

test("list: búsqueda unificada encuentra por número, nombre, documento o celular", async () => {
  const { client } = createFakeClient();
  const repo = createSalesRepository(client);
  await repo.createWithItems({ ...SALE_ROW, idempotencyKey: "a" }, [ITEM_ROW]);
  await repo.createWithItems({ ...SALE_ROW, idempotencyKey: "b", customerName: "María Gómez" }, [ITEM_ROW]);

  const byName = await repo.list({ search: "María" });
  assert.equal(byName.items.length, 1);
  assert.equal(byName.items[0].customerName, "María Gómez");

  const byDocument = await repo.list({ search: "123456789" });
  assert.equal(byDocument.items.length, 2);
});

test("list: orden más reciente primero y total refleja el universo sin paginar", async () => {
  const { client } = createFakeClient();
  const repo = createSalesRepository(client);
  await repo.createWithItems({ ...SALE_ROW, idempotencyKey: "a" }, [ITEM_ROW]);
  await repo.createWithItems({ ...SALE_ROW, idempotencyKey: "b" }, [ITEM_ROW]);

  const page = await repo.list({ pageSize: 1, offset: 0 });
  assert.equal(page.items.length, 1);
  assert.equal(page.total, 2);
});
