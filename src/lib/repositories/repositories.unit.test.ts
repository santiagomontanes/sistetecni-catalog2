import { test } from "node:test";
import assert from "node:assert/strict";
import { makeFakeClient, makeStatefulFakeClient } from "./fakeClient";
import { RepositoryError } from "./errors";
import { createProductsRepository } from "./products.repository";
import { createUpgradeOptionsRepository } from "./upgradeOptions.repository";
import { createProductUpgradeOptionsRepository } from "./productUpgradeOptions.repository";
import { createQuoteRequestsRepository } from "./quoteRequests.repository";

// ─── Propagación de errores (nunca se tragan en silencio) ──────────────────

test("ProductsRepository.findById: un error de Supabase se propaga como RepositoryError, no como null silencioso", async () => {
  const client = makeFakeClient({ data: null, error: { message: "conexión rechazada" } });
  const repo = createProductsRepository(client);

  await assert.rejects(() => repo.findById("cualquier-id"), (err: unknown) => {
    assert.ok(err instanceof RepositoryError);
    assert.ok((err as RepositoryError).message.includes("findById"));
    return true;
  });
});

test("ProductsRepository.findById: producto inexistente (sin error) devuelve null, no lanza", async () => {
  const client = makeFakeClient({ data: null, error: null });
  const repo = createProductsRepository(client);

  const result = await repo.findById("00000000-0000-0000-0000-000000000000");
  assert.equal(result, null);
});

test("ProductsRepository.findById: mapea correctamente una fila real, incluidas las columnas del personalizador", async () => {
  const client = makeFakeClient({
    data: {
      id: "abc",
      title: "Equipo de prueba",
      brand: "Dell",
      model: "X",
      cpu: "i5",
      ram: 16,
      storage: "512 GB SSD",
      screen: "14\"",
      price: 700000,
      condition: "Usado",
      stock: 1,
      images: [],
      featured: false,
      visible_web: true,
      created_at: "2026-01-01T00:00:00Z",
      cpu_generation: 8,
      gpu_type: "integrada",
      gpu_model: null,
      touch_screen: false,
      screen_size_inches: 14.0,
      storage_gb: 512,
    },
    error: null,
  });
  const repo = createProductsRepository(client);

  const result = await repo.findById("abc");
  assert.ok(result);
  assert.equal(result.cpuGeneration, 8);
  assert.equal(result.storageGb, 512);
  assert.equal(result.visibleWeb, true);
});

test("ProductsRepository.findPersonalizerCandidates: mapea múltiples filas (visible_web=true o null, filtrado en la query)", async () => {
  const client = makeFakeClient({
    data: [
      {
        id: "a",
        title: "[SEED] visible",
        brand: "HP",
        model: "X",
        cpu: "i5",
        ram: 8,
        storage: "256 GB SSD",
        screen: "14\"",
        price: 500000,
        condition: "Usado",
        stock: 1,
        images: [],
        featured: false,
        visible_web: true,
        created_at: "2026-01-01T00:00:00Z",
        cpu_generation: 8,
        gpu_type: "integrada",
        gpu_model: null,
        touch_screen: false,
        screen_size_inches: 14.0,
        storage_gb: 256,
      },
    ],
    error: null,
  });
  const repo = createProductsRepository(client);

  const result = await repo.findPersonalizerCandidates();
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "a");
});

test("ProductsRepository.findPersonalizerCandidates: sin filas devuelve array vacío, no lanza", async () => {
  const client = makeFakeClient({ data: [], error: null });
  const repo = createProductsRepository(client);

  const result = await repo.findPersonalizerCandidates();
  assert.deepEqual(result, []);
});

test("ProductsRepository.findPersonalizerCandidates: un error de Supabase se propaga como RepositoryError", async () => {
  const client = makeFakeClient({ data: null, error: { message: "timeout" } });
  const repo = createProductsRepository(client);

  await assert.rejects(() => repo.findPersonalizerCandidates(), (err: unknown) => {
    assert.ok(err instanceof RepositoryError);
    return true;
  });
});

test("UpgradeOptionsRepository.create: mapea la fila creada, incluidos los campos internos", async () => {
  const client = makeFakeClient({
    data: {
      id: "u1",
      category: "ram",
      label: "16 GB RAM",
      value: 16,
      interface: null,
      extra_cost: 70000,
      component_cost: 40000,
      install_cost: 5000,
      active: true,
      created_at: "2026-08-14T00:00:00Z",
    },
    error: null,
  });
  const repo = createUpgradeOptionsRepository(client);

  const created = await repo.create({
    category: "ram",
    label: "16 GB RAM",
    value: 16,
    interface: null,
    extraCost: 70000,
    componentCost: 40000,
    installCost: 5000,
    active: true,
  });
  assert.equal(created.extraCost, 70000);
  assert.equal(created.componentCost, 40000);
});

test("UpgradeOptionsRepository.create: un error de Supabase se propaga como RepositoryError", async () => {
  const client = makeFakeClient({ data: null, error: { message: "constraint violada" } });
  const repo = createUpgradeOptionsRepository(client);

  await assert.rejects(
    () =>
      repo.create({
        category: "ram",
        label: "x",
        value: 16,
        interface: null,
        extraCost: 1,
        componentCost: null,
        installCost: null,
        active: true,
      }),
    (err: unknown) => err instanceof RepositoryError
  );
});

test("UpgradeOptionsRepository.update: actualización parcial (solo extra_cost) mapea el resultado", async () => {
  const client = makeFakeClient({
    data: {
      id: "u1",
      category: "ram",
      label: "16 GB RAM",
      value: 16,
      interface: null,
      extra_cost: 85000,
      component_cost: null,
      install_cost: null,
      active: true,
      created_at: null,
    },
    error: null,
  });
  const repo = createUpgradeOptionsRepository(client);

  const updated = await repo.update("u1", { extraCost: 85000 });
  assert.equal(updated.extraCost, 85000);
});

test("UpgradeOptionsRepository.setActive: refleja el nuevo estado (D14 — nunca DELETE)", async () => {
  const client = makeFakeClient({
    data: {
      id: "u1",
      category: "ram",
      label: "16 GB RAM",
      value: 16,
      interface: null,
      extra_cost: 70000,
      component_cost: null,
      install_cost: null,
      active: false,
      created_at: null,
    },
    error: null,
  });
  const repo = createUpgradeOptionsRepository(client);

  const result = await repo.setActive("u1", false);
  assert.equal(result.active, false);
});

test("UpgradeOptionsRepository.findAll: incluye activas e inactivas (a diferencia de findActive)", async () => {
  const client = makeFakeClient({
    data: [
      { id: "u1", category: "ram", label: "16GB", value: 16, interface: null, extra_cost: 70000, component_cost: null, install_cost: null, active: true, created_at: null },
      { id: "u2", category: "ram", label: "32GB", value: 32, interface: null, extra_cost: 150000, component_cost: null, install_cost: null, active: false, created_at: null },
    ],
    error: null,
  });
  const repo = createUpgradeOptionsRepository(client);

  const all = await repo.findAll();
  assert.equal(all.length, 2);
  assert.ok(all.some((u) => u.active === false));
});

test("UpgradeOptionsRepository.findActive: un error de Supabase se propaga como RepositoryError", async () => {
  const client = makeFakeClient({ data: null, error: { message: "timeout" } });
  const repo = createUpgradeOptionsRepository(client);

  await assert.rejects(() => repo.findActive(), (err: unknown) => {
    assert.ok(err instanceof RepositoryError);
    return true;
  });
});

test("ProductUpgradeOptionsRepository.findCompatibleUpgradesForProduct: sin filas devuelve array vacío (producto sin upgrades, caso válido)", async () => {
  const client = makeFakeClient({ data: [], error: null });
  const repo = createProductUpgradeOptionsRepository(client);

  const result = await repo.findCompatibleUpgradesForProduct("producto-sin-upgrades");
  assert.deepEqual(result, []);
});

test("ProductUpgradeOptionsRepository.findCompatibleUpgradesForProduct: un error de Supabase se propaga como RepositoryError", async () => {
  const client = makeFakeClient({ data: null, error: { message: "permiso denegado" } });
  const repo = createProductUpgradeOptionsRepository(client);

  await assert.rejects(
    () => repo.findCompatibleUpgradesForProduct("cualquiera"),
    (err: unknown) => {
      assert.ok(err instanceof RepositoryError);
      assert.ok((err as RepositoryError).cause);
      return true;
    }
  );
});

test("ProductUpgradeOptionsRepository.findCompatibleUpgradesForProducts: agrupa varias filas por product_id en una sola query", async () => {
  const upgradeOption = {
    id: "u1",
    category: "ram",
    label: "16GB",
    value: 16,
    interface: null,
    extra_cost: 70000,
    component_cost: null,
    install_cost: null,
    active: true,
    created_at: null,
  };
  const client = makeFakeClient({
    data: [
      { id: "c1", product_id: "p1", note: null, upgrade_options: upgradeOption },
      { id: "c2", product_id: "p1", note: null, upgrade_options: { ...upgradeOption, id: "u2" } },
      { id: "c3", product_id: "p2", note: null, upgrade_options: upgradeOption },
    ],
    error: null,
  });
  const repo = createProductUpgradeOptionsRepository(client);

  const result = await repo.findCompatibleUpgradesForProducts(["p1", "p2", "p3"]);
  assert.equal(result.get("p1")?.length, 2);
  assert.equal(result.get("p2")?.length, 1);
  assert.equal(result.has("p3"), false); // sin compatibilidades -> sin key, no [] fabricado
});

test("ProductUpgradeOptionsRepository.findCompatibleUpgradesForProducts: lista de ids vacía -> Map vacío, sin consultar", async () => {
  const client = makeFakeClient({ data: null, error: { message: "no debería llegar aquí" } });
  const repo = createProductUpgradeOptionsRepository(client);

  const result = await repo.findCompatibleUpgradesForProducts([]);
  assert.equal(result.size, 0);
});

// ─── setCompatibility (B6) — diffing sin duplicar relaciones ───────────────

interface PUORow {
  id: string;
  product_id: string;
  upgrade_option_id: string;
  active: boolean;
  note: string | null;
}

test("setCompatibility: producto sin filas previas -> inserta cada id como fila activa nueva", async () => {
  const { client, rows } = makeStatefulFakeClient<PUORow>([]);
  const repo = createProductUpgradeOptionsRepository(client);

  await repo.setCompatibility("p1", ["u1", "u2"]);

  const forP1 = rows.filter((r) => r.product_id === "p1");
  assert.equal(forP1.length, 2);
  assert.ok(forP1.every((r) => r.active === true));
});

test("setCompatibility: una fila activa que ya NO está en el nuevo conjunto se DESACTIVA, nunca se borra", async () => {
  const { client, rows } = makeStatefulFakeClient<PUORow>([
    { id: "r1", product_id: "p1", upgrade_option_id: "u1", active: true, note: null },
  ]);
  const repo = createProductUpgradeOptionsRepository(client);

  await repo.setCompatibility("p1", []); // el nuevo conjunto no incluye u1

  assert.equal(rows.length, 1); // la fila sigue existiendo — nunca DELETE
  assert.equal(rows[0].active, false);
});

test("setCompatibility: una fila INACTIVA que SÍ está en el nuevo conjunto se REACTIVA, nunca se duplica", async () => {
  const { client, rows } = makeStatefulFakeClient<PUORow>([
    { id: "r1", product_id: "p1", upgrade_option_id: "u1", active: false, note: null },
  ]);
  const repo = createProductUpgradeOptionsRepository(client);

  await repo.setCompatibility("p1", ["u1"]);

  const forU1 = rows.filter((r) => r.product_id === "p1" && r.upgrade_option_id === "u1");
  assert.equal(forU1.length, 1); // sigue siendo UNA sola fila — no duplicada
  assert.equal(forU1[0].active, true);
});

test("setCompatibility: caso mixto — mantiene, agrega y desactiva en la misma llamada, sin duplicar nada", async () => {
  const { client, rows } = makeStatefulFakeClient<PUORow>([
    { id: "r1", product_id: "p1", upgrade_option_id: "u1", active: true, note: null }, // se mantiene
    { id: "r2", product_id: "p1", upgrade_option_id: "u2", active: true, note: null }, // se desactiva
    { id: "r3", product_id: "p1", upgrade_option_id: "u3", active: false, note: null }, // se reactiva
  ]);
  const repo = createProductUpgradeOptionsRepository(client);

  await repo.setCompatibility("p1", ["u1", "u3", "u4"]); // u4 es nueva

  const byOption = new Map(rows.map((r) => [r.upgrade_option_id, r]));
  assert.equal(byOption.get("u1")?.active, true);
  assert.equal(byOption.get("u2")?.active, false); // desactivada, no borrada
  assert.equal(byOption.get("u3")?.active, true); // reactivada
  assert.equal(byOption.get("u4")?.active, true); // insertada
  assert.equal(rows.length, 4); // 3 originales + 1 nueva — nunca duplicados

  // Ninguna combinación (product_id, upgrade_option_id) aparece más de una vez.
  const keys = rows.map((r) => `${r.product_id}:${r.upgrade_option_id}`);
  assert.equal(new Set(keys).size, keys.length);
});

test("setCompatibility: un error de Supabase al leer el estado actual se propaga como RepositoryError", async () => {
  const client = makeFakeClient({ data: null, error: { message: "timeout" } });
  const repo = createProductUpgradeOptionsRepository(client);

  await assert.rejects(() => repo.setCompatibility("p1", ["u1"]), (err: unknown) => err instanceof RepositoryError);
});

// ─── QuoteRequestsRepository.list / updateStatus (B6) ───────────────────────

interface QRRow {
  id: string;
  code: string;
  product_id: string | null;
  is_special_request: boolean;
  base_price_snapshot: number | null;
  base_config_snapshot: null;
  requested_config: Record<string, unknown>;
  selected_upgrades_snapshot: unknown[];
  estimated_price: number | null;
  customer_budget: number | null;
  customer_city: string | null;
  customer_note: string | null;
  status: string;
  channel: string;
  created_at: string | null;
  updated_at: string | null;
  expires_at: string | null;
}

function makeQuoteRow(overrides: Partial<QRRow> & { id: string; code: string }): QRRow {
  return {
    product_id: null,
    is_special_request: false,
    base_price_snapshot: null,
    base_config_snapshot: null,
    requested_config: {},
    selected_upgrades_snapshot: [],
    estimated_price: null,
    customer_budget: null,
    customer_city: null,
    customer_note: null,
    status: "nueva",
    channel: "web_personalizador",
    created_at: null,
    updated_at: null,
    expires_at: null,
    ...overrides,
  };
}

test("QuoteRequestsRepository.list: filtra por status cuando se pide", async () => {
  const { client } = makeStatefulFakeClient<QRRow>([
    makeQuoteRow({ id: "1", code: "COT-A", status: "nueva" }),
    makeQuoteRow({ id: "2", code: "COT-B", status: "cotizada" }),
  ]);
  const repo = createQuoteRequestsRepository(client);

  const result = await repo.list({ status: "cotizada" });
  assert.equal(result.length, 1);
  assert.equal(result[0].code, "COT-B");
});

test("QuoteRequestsRepository.list: búsqueda parcial por código, insensible a mayúsculas", async () => {
  const { client } = makeStatefulFakeClient<QRRow>([
    makeQuoteRow({ id: "1", code: "COT-ABCDEFGHJ" }),
    makeQuoteRow({ id: "2", code: "COT-ZZZZZZZZZ" }),
  ]);
  const repo = createQuoteRequestsRepository(client);

  const result = await repo.list({ codeSearch: "abcdef" });
  assert.equal(result.length, 1);
  assert.equal(result[0].code, "COT-ABCDEFGHJ");
});

test("QuoteRequestsRepository.list: sin filtro devuelve todas", async () => {
  const { client } = makeStatefulFakeClient<QRRow>([
    makeQuoteRow({ id: "1", code: "COT-A" }),
    makeQuoteRow({ id: "2", code: "COT-B" }),
  ]);
  const repo = createQuoteRequestsRepository(client);

  const result = await repo.list();
  assert.equal(result.length, 2);
});

test("QuoteRequestsRepository.updateStatus: cambia el status y devuelve la fila mapeada", async () => {
  const { client } = makeStatefulFakeClient<QRRow>([makeQuoteRow({ id: "1", code: "COT-A", status: "nueva" })]);
  const repo = createQuoteRequestsRepository(client);

  const updated = await repo.updateStatus("1", "contactada");
  assert.equal(updated.status, "contactada");
});

test("QuoteRequestsRepository.list: un error de Supabase se propaga como RepositoryError", async () => {
  const client = makeFakeClient({ data: null, error: { message: "timeout" } });
  const repo = createQuoteRequestsRepository(client);

  await assert.rejects(() => repo.list(), (err: unknown) => err instanceof RepositoryError);
});

test("ProductUpgradeOptionsRepository.isCompatible: true cuando existe la fila, false cuando no (sin lanzar en ninguno de los dos casos)", async () => {
  const compatible = makeFakeClient({ data: { id: "x" }, error: null });
  const incompatible = makeFakeClient({ data: null, error: null });

  const repoCompatible = createProductUpgradeOptionsRepository(compatible);
  const repoIncompatible = createProductUpgradeOptionsRepository(incompatible);

  assert.equal(await repoCompatible.isCompatible("p", "u"), true);
  assert.equal(await repoIncompatible.isCompatible("p", "u"), false);
});
