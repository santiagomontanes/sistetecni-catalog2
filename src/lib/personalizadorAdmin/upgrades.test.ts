import { test } from "node:test";
import assert from "node:assert/strict";
import { createUpgradeAdmin, updateUpgradeAdmin, toggleUpgradeAdmin, listUpgradesAdmin } from "./upgrades";
import { createUpgradeOptionsRepository } from "../repositories/upgradeOptions.repository";
import { makeStatefulFakeClient } from "../repositories/fakeClient";

interface UORow {
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
}

function seedRow(overrides: Partial<UORow> & { id: string }): UORow {
  return {
    category: "ram",
    label: "16 GB RAM",
    value: 16,
    interface: null,
    extra_cost: 70000,
    component_cost: null,
    install_cost: null,
    active: true,
    created_at: null,
    ...overrides,
  };
}

const VALID_CREATE_INPUT = {
  category: "ram" as const,
  label: "16 GB RAM",
  value: 16,
  interface: null,
  extraCost: 70000,
  componentCost: null,
  installCost: null,
  active: true,
};

// crear upgrade
test("createUpgradeAdmin: input válido -> crea y devuelve la opción mapeada", async () => {
  const { client } = makeStatefulFakeClient<UORow>([]);
  const repo = createUpgradeOptionsRepository(client);

  const result = await createUpgradeAdmin(VALID_CREATE_INPUT, repo);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.data.label, "16 GB RAM");
    assert.equal(result.data.extraCost, 70000);
  }
});

test("createUpgradeAdmin: label vacío -> VALIDATION_ERROR, no llega a crear nada", async () => {
  const { client, rows } = makeStatefulFakeClient<UORow>([]);
  const repo = createUpgradeOptionsRepository(client);

  const result = await createUpgradeAdmin({ ...VALID_CREATE_INPUT, label: "" }, repo);
  assert.equal(result.ok, false);
  assert.equal(rows.length, 0);
});

test("createUpgradeAdmin: extraCost negativo -> VALIDATION_ERROR (precios enteros COP, nunca negativos)", async () => {
  const { client } = makeStatefulFakeClient<UORow>([]);
  const repo = createUpgradeOptionsRepository(client);

  const result = await createUpgradeAdmin({ ...VALID_CREATE_INPUT, extraCost: -1 }, repo);
  assert.equal(result.ok, false);
});

test("createUpgradeAdmin: extraCost no entero -> VALIDATION_ERROR", async () => {
  const { client } = makeStatefulFakeClient<UORow>([]);
  const repo = createUpgradeOptionsRepository(client);

  const result = await createUpgradeAdmin({ ...VALID_CREATE_INPUT, extraCost: 70000.5 }, repo);
  assert.equal(result.ok, false);
});

test("createUpgradeAdmin: category fuera de ram/storage -> VALIDATION_ERROR", async () => {
  const { client } = makeStatefulFakeClient<UORow>([]);
  const repo = createUpgradeOptionsRepository(client);

  const result = await createUpgradeAdmin({ ...VALID_CREATE_INPUT, category: "gpu" }, repo);
  assert.equal(result.ok, false);
});

test("createUpgradeAdmin: campo desconocido en el payload -> VALIDATION_ERROR (.strict())", async () => {
  const { client } = makeStatefulFakeClient<UORow>([]);
  const repo = createUpgradeOptionsRepository(client);

  const result = await createUpgradeAdmin({ ...VALID_CREATE_INPUT, notes: "esto no existe en upgrade_options" }, repo);
  assert.equal(result.ok, false);
});

// editar precio
test("updateUpgradeAdmin: edita solo extraCost -> el resto de campos no cambia en el payload enviado a la DB", async () => {
  const { client, rows } = makeStatefulFakeClient<UORow>([seedRow({ id: "u1", extra_cost: 70000 })]);
  const repo = createUpgradeOptionsRepository(client);

  const result = await updateUpgradeAdmin("u1", { extraCost: 85000 }, repo);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.data.extraCost, 85000);
  assert.equal(rows[0].label, "16 GB RAM"); // no tocado
});

test("updateUpgradeAdmin: id vacío -> VALIDATION_ERROR", async () => {
  const { client } = makeStatefulFakeClient<UORow>([seedRow({ id: "u1" })]);
  const repo = createUpgradeOptionsRepository(client);

  const result = await updateUpgradeAdmin("", { extraCost: 1 }, repo);
  assert.equal(result.ok, false);
});

// activar/desactivar
test("toggleUpgradeAdmin: desactiva (D14 — nunca DELETE, la fila sigue existiendo)", async () => {
  const { client, rows } = makeStatefulFakeClient<UORow>([seedRow({ id: "u1", active: true })]);
  const repo = createUpgradeOptionsRepository(client);

  const result = await toggleUpgradeAdmin("u1", false, repo);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.data.active, false);
  assert.equal(rows.length, 1);
});

test("toggleUpgradeAdmin: reactiva una opción previamente desactivada", async () => {
  const { client } = makeStatefulFakeClient<UORow>([seedRow({ id: "u1", active: false })]);
  const repo = createUpgradeOptionsRepository(client);

  const result = await toggleUpgradeAdmin("u1", true, repo);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.data.active, true);
});

test("toggleUpgradeAdmin: active no booleano -> VALIDATION_ERROR", async () => {
  const { client } = makeStatefulFakeClient<UORow>([seedRow({ id: "u1" })]);
  const repo = createUpgradeOptionsRepository(client);

  const result = await toggleUpgradeAdmin("u1", "sí" as unknown as boolean, repo);
  assert.equal(result.ok, false);
});

test("listUpgradesAdmin: incluye activas e inactivas, para que el admin pueda reactivar", async () => {
  const { client } = makeStatefulFakeClient<UORow>([
    seedRow({ id: "u1", active: true }),
    seedRow({ id: "u2", active: false }),
  ]);
  const repo = createUpgradeOptionsRepository(client);

  const result = await listUpgradesAdmin(repo);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.data.length, 2);
});
