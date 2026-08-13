import { test } from "node:test";
import assert from "node:assert/strict";
import { makeFakeClient } from "./fakeClient";
import { RepositoryError } from "./errors";
import { createProductsRepository } from "./products.repository";
import { createUpgradeOptionsRepository } from "./upgradeOptions.repository";
import { createProductUpgradeOptionsRepository } from "./productUpgradeOptions.repository";

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

test("ProductUpgradeOptionsRepository.isCompatible: true cuando existe la fila, false cuando no (sin lanzar en ninguno de los dos casos)", async () => {
  const compatible = makeFakeClient({ data: { id: "x" }, error: null });
  const incompatible = makeFakeClient({ data: null, error: null });

  const repoCompatible = createProductUpgradeOptionsRepository(compatible);
  const repoIncompatible = createProductUpgradeOptionsRepository(incompatible);

  assert.equal(await repoCompatible.isCompatible("p", "u"), true);
  assert.equal(await repoIncompatible.isCompatible("p", "u"), false);
});
