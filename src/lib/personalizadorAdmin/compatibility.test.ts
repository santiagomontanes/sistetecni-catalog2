import { test } from "node:test";
import assert from "node:assert/strict";
import { setProductCompatibilityAdmin, copyProductCompatibilityAdmin } from "./compatibility";
import { createProductUpgradeOptionsRepository } from "../repositories/productUpgradeOptions.repository";
import { makeStatefulFakeClient } from "../repositories/fakeClient";

interface PUORow {
  id: string;
  product_id: string;
  upgrade_option_id: string;
  note: string | null;
  active: boolean;
  upgrade_options: {
    id: string;
    category: string;
    label: string;
    value: number;
    interface: string | null;
    extra_cost: number;
    component_cost: number | null;
    install_cost: number | null;
    active: boolean;
    created_at: string | null;
  };
}

const P1 = "10000000-0000-0000-0000-000000000001";
const P2 = "10000000-0000-0000-0000-000000000002";
const RAM16 = "20000000-0000-0000-0000-000000000001";
const RAM32 = "20000000-0000-0000-0000-000000000002";

function upgradeOption(id: string, extra: number) {
  return {
    id,
    category: "ram",
    label: "RAM",
    value: 16,
    interface: null,
    extra_cost: extra,
    component_cost: null,
    install_cost: null,
    active: true,
    created_at: null,
  };
}

// compatibilidad
test("setProductCompatibilityAdmin: input válido -> reemplaza el conjunto de compatibilidad del producto", async () => {
  const { client, rows } = makeStatefulFakeClient<PUORow>([]);
  const repo = createProductUpgradeOptionsRepository(client);

  const result = await setProductCompatibilityAdmin({ productId: P1, upgradeOptionIds: [RAM16, RAM32] }, repo);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.data.count, 2);
  assert.equal(rows.filter((r) => r.product_id === P1).length, 2);
});

test("setProductCompatibilityAdmin: productId no es UUID -> VALIDATION_ERROR", async () => {
  const { client, rows } = makeStatefulFakeClient<PUORow>([]);
  const repo = createProductUpgradeOptionsRepository(client);

  const result = await setProductCompatibilityAdmin({ productId: "no-es-un-uuid", upgradeOptionIds: [] }, repo);
  assert.equal(result.ok, false);
  assert.equal(rows.length, 0); // nunca llegó a tocar la tabla
});

test("setProductCompatibilityAdmin: upgradeOptionIds con un valor que no es UUID -> VALIDATION_ERROR", async () => {
  const { client } = makeStatefulFakeClient<PUORow>([]);
  const repo = createProductUpgradeOptionsRepository(client);

  const result = await setProductCompatibilityAdmin({ productId: P1, upgradeOptionIds: ["no-es-uuid"] }, repo);
  assert.equal(result.ok, false);
});

// producto sin compatibilidad — caso válido, no un error
test("setProductCompatibilityAdmin: lista vacía -> deja al producto sin ningún upgrade compatible (caso válido)", async () => {
  const { client, rows } = makeStatefulFakeClient<PUORow>([
    {
      id: "r1",
      product_id: P1,
      upgrade_option_id: RAM16,
      note: null,
      active: true,
      upgrade_options: upgradeOption(RAM16, 70000),
    },
  ]);
  const repo = createProductUpgradeOptionsRepository(client);

  const result = await setProductCompatibilityAdmin({ productId: P1, upgradeOptionIds: [] }, repo);
  assert.ok(result.ok);
  const compatible = await repo.findCompatibleUpgradesForProduct(P1);
  assert.deepEqual(compatible, []);
  assert.equal(rows.length, 1); // la fila sigue existiendo, solo desactivada
  assert.equal(rows[0].active, false);
});

// copiar compatibilidad (D3)
test("copyProductCompatibilityAdmin: copia el conjunto activo del producto origen al destino", async () => {
  const { client, rows } = makeStatefulFakeClient<PUORow>([
    {
      id: "r1",
      product_id: P1,
      upgrade_option_id: RAM16,
      note: null,
      active: true,
      upgrade_options: upgradeOption(RAM16, 70000),
    },
    {
      id: "r2",
      product_id: P1,
      upgrade_option_id: RAM32,
      note: null,
      active: true,
      upgrade_options: upgradeOption(RAM32, 150000),
    },
  ]);
  const repo = createProductUpgradeOptionsRepository(client);

  const result = await copyProductCompatibilityAdmin({ sourceProductId: P1, targetProductId: P2 }, repo);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.data.copiedCount, 2);

  const targetRows = rows.filter((r) => r.product_id === P2);
  assert.equal(targetRows.length, 2);
  // Relaciones NUEVAS e independientes — no las mismas filas que el origen.
  const sourceIds = rows.filter((r) => r.product_id === P1).map((r) => r.id);
  for (const row of targetRows) assert.ok(!sourceIds.includes(row.id));
});

test("copyProductCompatibilityAdmin: modificar el destino después NO afecta al origen (relaciones independientes, no referencias dinámicas)", async () => {
  const { client, rows } = makeStatefulFakeClient<PUORow>([
    {
      id: "r1",
      product_id: P1,
      upgrade_option_id: RAM16,
      note: null,
      active: true,
      upgrade_options: upgradeOption(RAM16, 70000),
    },
  ]);
  const repo = createProductUpgradeOptionsRepository(client);

  await copyProductCompatibilityAdmin({ sourceProductId: P1, targetProductId: P2 }, repo);
  // Modifico el destino quitando todo.
  await repo.setCompatibility(P2, []);

  // El origen conserva su compatibilidad intacta.
  const sourceCompatible = await repo.findCompatibleUpgradesForProduct(P1);
  assert.equal(sourceCompatible.length, 1);
  assert.equal(rows.find((r) => r.product_id === P1 && r.upgrade_option_id === RAM16)?.active, true);
});

test("copyProductCompatibilityAdmin: source === target -> VALIDATION_ERROR (no tiene sentido copiarse a sí mismo)", async () => {
  const { client } = makeStatefulFakeClient<PUORow>([]);
  const repo = createProductUpgradeOptionsRepository(client);

  const result = await copyProductCompatibilityAdmin({ sourceProductId: P1, targetProductId: P1 }, repo);
  assert.equal(result.ok, false);
});

test("copyProductCompatibilityAdmin: producto origen sin compatibilidad -> copia 0, no falla", async () => {
  const { client } = makeStatefulFakeClient<PUORow>([]);
  const repo = createProductUpgradeOptionsRepository(client);

  const result = await copyProductCompatibilityAdmin({ sourceProductId: P1, targetProductId: P2 }, repo);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.data.copiedCount, 0);
});
