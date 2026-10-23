// Persistencia y concurrencia reales. ÚNICAMENTE PostgreSQL local desechable; nunca lee .env.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const connectionString = "postgresql://postgres@127.0.0.1:55432/erp_test";
async function client(actor) {
  const c = new pg.Client({ connectionString }); await c.connect();
  if (actor) { await c.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]); await c.query("set role authenticated"); }
  return c;
}
async function command(c, action, payload, key = randomUUID()) {
  return (await c.query("select public.erp_workshop_command($1,$2::jsonb,$3::uuid) as result", [action, JSON.stringify(payload), key])).rows[0].result;
}
async function unit(c, id) { return (await c.query("select * from public.product_units where id=$1", [id])).rows[0]; }
async function version(c, id) { return Number((await unit(c, id)).row_version); }
const snapshot = (components = [{ kind: "ram", capacityGb: 1, generation: "DDR3", formFactor: "SO-DIMM" }]) => ({ brand: "PRUEBA SIN CLIENTE REAL", model: "Banco local", physical: "good", powersOn: "unchecked", video: "unchecked", screenType: "unknown", chargerReceived: "unchecked", apparentBattery: "Sin probar", components });

test("taller: recorrido persistente, concurrencia, reversos, permisos y controles", async t => {
  const db = await client(); const actor = randomUUID(); const technician = randomUUID(); const viewer = randomUUID();
  await db.query("insert into public.profiles(id,is_admin,erp_role,active) values($1,true,'admin',true),($2,false,'tecnico',true),($3,false,'viewer',true)", [actor, technician, viewer]);
  const a = await client(actor); const b = await client(technician); const denied = await client(viewer);
  try {
    await command(a, "configure", { enabled: true });
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const locationA = (await command(a, "location", { code: `T-${suffix}-A`, name: "Recepción de prueba" })).id;
    const locationB = (await command(a, "location", { code: `T-${suffix}-B`, name: "Estante pruebas", parentId: locationA })).id;
    const batch = await command(a, "qr_batch", { count: 4 });
    const qr = batch.labels[0].code;
    let computer;
    await t.test("QR libre asignado atómicamente: solo una sesión gana", async () => {
      const payload = { qrCode: qr, locationId: locationA, condition: "good", costCop: "100000", snapshot: snapshot() };
      const outcomes = await Promise.allSettled([command(a, "receive", payload), command(b, "receive", payload)]);
      assert.equal(outcomes.filter(x => x.status === "fulfilled").length, 1);
      const win = outcomes.find(x => x.status === "fulfilled"); computer = win.value.unitId;
      assert.equal((await db.query("select count(*) from public.workshop_qr_labels where code=$1 and unit_id=$2", [qr, computer])).rows[0].count, "1");
      assert.equal((await unit(db, computer)).spec_overrides.ramGb, 1);
      assert.equal((await db.query("select count(*) from public.product_units where installed_in_unit_id=$1", [computer])).rows[0].count, "1");
    });
    await t.test("recepción es inmutable; dos lecturas autorizadas recuperan el mismo STU", async () => {
      const [left, right] = await Promise.all([a.query("select erp_workshop_read($1) as d", [computer]), b.query("select erp_workshop_read($1) as d", [computer])]);
      assert.equal(left.rows[0].d.unit.id, right.rows[0].d.unit.id);
      await assert.rejects(db.query("update public.workshop_receipts set snapshot='{}' where unit_id=$1", [computer]), /append_only/);
      const receipt = (await db.query("select snapshot from public.workshop_receipts where unit_id=$1", [computer])).rows[0].snapshot;
      assert.equal(receipt.components[0].capacityGb, 1);
    });
    await t.test("movimiento con origen y destino y rechazo de edición obsoleta", async () => {
      const oldVersion = await version(db, computer);
      await command(a, "move", { unitId: computer, version: oldVersion, locationId: locationB, reason: "Paso a banco técnico" });
      await assert.rejects(command(b, "move", { unitId: computer, version: oldVersion, locationId: locationA, reason: "Edición obsoleta" }), /version_conflict/);
      const event = (await db.query("select * from workshop_events where unit_id=$1 and event_type='move' order by created_at desc limit 1", [computer])).rows[0];
      assert.equal(event.before_data.location_id, locationA); assert.equal(event.after_data.location_id, locationB);
    });
    const receivedRam = (await db.query("select id from product_units where installed_in_unit_id=$1", [computer])).rows[0].id;
    await t.test("retiro 1 GB e instalación 2 × 4 GB: sin doble disponibilidad", async () => {
      await command(a, "component_move", { unitId: computer, version: await version(db, computer), componentId: receivedRam, componentVersion: await version(db, receivedRam), direction: "remove", locationId: locationA, condition: "functional", reason: "Ampliación a 8 GB" });
      assert.equal((await unit(db, receivedRam)).installed_in_unit_id, null);
      assert.equal((await unit(db, receivedRam)).acquisition_cost_cop, "0");
      for (let i = 0; i < 2; i++) {
        const part = await command(a, "component_receive", { kind: "ram", locationId: locationA, costCop: "20000", componentCondition: "functional", snapshot: { kind: "ram", capacityGb: 4, generation: "DDR3" } });
        const payload = { unitId: computer, version: await version(db, computer), componentId: part.unitId, componentVersion: await version(db, part.unitId), direction: "install", reason: "Instalación módulo probado" };
        const key = randomUUID(); const first = await command(a, "component_move", payload, key); const second = await command(a, "component_move", payload, key);
        assert.deepEqual(first, second);
        assert.equal((await db.query("select count(*) from inventory_movements where unit_id=$1 and movement_type='adjustment'", [part.unitId])).rows[0].count, "1");
      }
      assert.equal((await unit(db, computer)).spec_overrides.ramGb, 8);
      assert.equal((await db.query("select sum(amount_cop) total from cost_entries where product_unit_id=$1", [computer])).rows[0].total, "40000");
      assert.equal((await db.query("select snapshot->'components'->0->>'capacityGb' original from workshop_receipts where unit_id=$1", [computer])).rows[0].original, "1");
    });
    await t.test("último componente concurrente y conservación de costos con retiro/reverso", async () => {
      const second = (await command(a, "receive", { qrCode: batch.labels[1].code, locationId: locationA, condition: "bad", snapshot: snapshot([]) })).unitId;
      assert.equal((await unit(db, second)).workshop_phase, "warehouse");
      assert.equal((await unit(db, second)).status, "received");
      const last = (await command(a, "component_receive", { kind: "ram", locationId: locationA, costCop: "7000", componentCondition: "functional", snapshot: { kind: "ram", capacityGb: 2, generation: "DDR3" } })).unitId;
      const partVersion = await version(db, last);
      const outcomes = await Promise.allSettled([command(a, "component_move", { unitId: computer, version: await version(db, computer), componentId: last, componentVersion: partVersion, direction: "install", reason: "Competencia sesión A" }), command(b, "component_move", { unitId: second, version: await version(db, second), componentId: last, componentVersion: partVersion, direction: "install", reason: "Competencia sesión B" })]);
      assert.equal(outcomes.filter(x => x.status === "fulfilled").length, 1);
      const winner = (await unit(db, last)).installed_in_unit_id;
      assert.ok([computer, second].includes(winner));
      const move = (await db.query("select id from workshop_events where event_type='component_move' and after_data->>'componentId'=$1 order by created_at desc limit 1", [last])).rows[0].id;
      await command(a, "component_move", { unitId: winner, version: await version(db, winner), componentId: last, componentVersion: await version(db, last), direction: "remove", locationId: locationA, condition: "functional", reason: "Reverso de prueba", reversalOf: move });
      assert.equal((await db.query("select sum(amount_cop) total from cost_entries where reference_id=$1", [last])).rows[0].total, "0");
      assert.equal((await unit(db, last)).acquisition_cost_cop, "7000");
      assert.equal((await unit(db, last)).installed_in_unit_id, null);
    });
    await t.test("controles obligatorios, instalación separada de prueba y stock comercial real", async () => {
      const product = (await db.query("insert into products(title,price,stock,erp_stock_enabled) values('TEST taller local',800000,0,true) returning id")).rows[0].id;
      await db.query("update product_units set product_id=$1 where id=$2", [product, computer]);
      await assert.rejects(command(a, "phase", { unitId: computer, version: await version(db, computer), phase: "ready" }), /required_checks_missing/);
      await command(a, "software", { unitId: computer, version: await version(db, computer), name: "Driver Booster", installed: true, tested: false });
      await assert.rejects(command(a, "phase", { unitId: computer, version: await version(db, computer), phase: "ready" }), /required_checks_missing/);
      const defs = (await db.query("select code from workshop_check_definitions where active and required")).rows;
      for (const d of defs) await command(a, "check", { unitId: computer, version: await version(db, computer), code: d.code, result: "passed", note: "Probado en entorno sintético" });
      await command(a, "phase", { unitId: computer, version: await version(db, computer), phase: "ready" });
      assert.equal((await unit(db, computer)).status, "available");
      assert.equal((await db.query("select stock from products where id=$1", [product])).rows[0].stock, 1);
      assert.equal((await unit(db, computer)).final_battery.result, "passed");
      assert.equal((await db.query("select snapshot->>'apparentBattery' battery from workshop_receipts where unit_id=$1", [computer])).rows[0].battery, "Sin probar");
    });
    await t.test("nuevo control obligatorio invalida disponibles y bloquea reserva/venta sin controles", async () => {
      await db.query("update product_units set status='reserved' where id=$1", [computer]);
      const control = `control_${suffix.toLowerCase()}`;
      await command(a, "check_definition", { code: control, label: "Control adicional prueba", required: true, active: true });
      await assert.rejects(db.query("update product_units set status='sold',sold_at=now() where id=$1", [computer]), /required_checks_missing/);
      await db.query("update product_units set status='inspection' where id=$1", [computer]);
      await assert.rejects(db.query("update product_units set status='reserved' where id=$1", [computer]), /required_checks_missing/);
      await command(a, "check", { unitId: computer, version: await version(db, computer), code: control, result: "passed", note: "Control nuevo aprobado" });
      await command(a, "phase", { unitId: computer, version: await version(db, computer), phase: "ready" });
      await command(a, "check_definition", { code: control, label: "Control adicional prueba", required: true, active: true });
      assert.equal((await unit(db, computer)).status, "inspection");
      assert.equal((await unit(db, computer)).workshop_phase, "final_check");
      await command(a, "check_definition", { code: control, label: "Control adicional prueba", required: false, active: false });
    });
    await t.test("corrección auditada preserva snapshot original y exige administrador", async () => {
      await assert.rejects(command(b, "correct_receipt", { unitId: computer, version: await version(db, computer), reason: "Dato de prueba", snapshot: snapshot() }), /permission_denied/);
      await command(a, "correct_receipt", { unitId: computer, version: await version(db, computer), reason: "Serial observado después", snapshot: { ...snapshot(), serial: "LOCAL-TEST" } });
      const receipts = (await db.query("select snapshot,correction_of,reason from workshop_receipts where unit_id=$1 order by created_at", [computer])).rows;
      assert.equal(receipts.length, 2); assert.equal(receipts[0].snapshot.serial, undefined); assert.equal(receipts[1].snapshot.serial, "LOCAL-TEST"); assert.ok(receipts[1].correction_of);
    });
    await t.test("QR anulado, RLS, escrituras directas, ubicaciones ocupadas y desactivación", async () => {
      await command(a, "qr_void", { code: batch.labels[2].code, reason: "Etiqueta dañada" });
      await assert.rejects(command(a, "receive", { qrCode: batch.labels[2].code, locationId: locationA, condition: "good", snapshot: snapshot() }), /qr_not_free/);
      await assert.rejects(command(denied, "qr_batch", { count: 1 }), /permission_denied/);
      await assert.rejects(denied.query("select erp_workshop_read($1)", [computer]), /permission_denied/);
      assert.equal((await denied.query("select count(*) from workshop_receipts")).rows[0].count, "0");
      await assert.rejects(a.query("update product_units set location_id=$1 where id=$2", [locationA, computer]), /workshop_use_command/);
      await assert.rejects(a.query("delete from workshop_locations where id=$1", [locationB]), /permission denied/);
      await assert.rejects(db.query("delete from workshop_locations where id=$1", [locationB]), /foreign key/);
      await command(a, "configure", { enabled: false });
      await assert.rejects(command(a, "qr_batch", { count: 1 }), /workshop_disabled/);
      assert.equal((await a.query("select erp_workshop_read($1) d", [computer])).rows[0].d.unit.id, computer);
      await command(a, "configure", { enabled: true });
    });
  } finally { await Promise.all([a.end(), b.end(), denied.end(), db.end()]); }
});
