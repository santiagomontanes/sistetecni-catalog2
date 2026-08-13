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

test("ProductUpgradeOptionsRepository.isCompatible: true cuando existe la fila, false cuando no (sin lanzar en ninguno de los dos casos)", async () => {
  const compatible = makeFakeClient({ data: { id: "x" }, error: null });
  const incompatible = makeFakeClient({ data: null, error: null });

  const repoCompatible = createProductUpgradeOptionsRepository(compatible);
  const repoIncompatible = createProductUpgradeOptionsRepository(incompatible);

  assert.equal(await repoCompatible.isCompatible("p", "u"), true);
  assert.equal(await repoIncompatible.isCompatible("p", "u"), false);
});
