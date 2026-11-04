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
      // QR = STU: la unidad nace con el mismo código impreso, sin un segundo identificador.
      assert.match(qr, /^STU-\d{6,}$/);
      assert.equal((await unit(db, computer)).unit_code, qr);
      assert.equal((await db.query("select count(distinct code) from public.workshop_qr_labels where batch_id=(select batch_id from public.workshop_qr_labels where code=$1)", [qr])).rows[0].count, "4");
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
    await t.test("corregir la unidad: solo administrador, con motivo, y queda el antes y el después", async () => {
      const fixes = { costCop: "320000", condition: "fair", serial: `SN-FIX-${suffix}`, brand: "MarcaFix", model: "ModeloFix" };
      await assert.rejects(command(b, "correct_unit", { unitId: computer, version: await version(db, computer), reason: "Sin permiso", ...fixes }), /permission_denied/);
      await assert.rejects(command(a, "correct_unit", { unitId: computer, version: await version(db, computer), reason: "  ", ...fixes }), /reason_required/);
      const before = await unit(db, computer);
      await command(a, "correct_unit", { unitId: computer, version: await version(db, computer), reason: "Se digitó mal al recibir", ...fixes });
      const after = await unit(db, computer);
      assert.equal(String(after.acquisition_cost_cop), "320000"); assert.equal(after.preliminary_condition, "fair"); assert.equal(after.serial_number, `SN-FIX-${suffix}`);
      const event = (await db.query("select before_data,after_data,reason from workshop_events where unit_id=$1 and event_type='correct_unit'", [computer])).rows[0];
      assert.equal(event.reason, "Se digitó mal al recibir"); assert.equal(event.before_data.serial_number, before.serial_number); assert.equal(event.after_data.serial_number, `SN-FIX-${suffix}`);
      const latest = (await db.query("select snapshot from workshop_receipts where unit_id=$1 order by created_at desc, id desc limit 1", [computer])).rows[0].snapshot;
      assert.equal(latest.brand, "MarcaFix"); assert.equal(latest.model, "ModeloFix");
    });
    await t.test("cada tipo de pieza tiene su código corto y las que llegan con el equipo reciben su QR", async () => {
      const own = await command(a, "qr_batch", { count: 1 });
      const got = await command(a, "receive", { qrCode: own.labels[0].code, locationId: locationA, condition: "good", costCop: "0", snapshot: { ...snapshot(), components: [{ kind: "battery", notes: "6 celdas" }, { kind: "screen", notes: "14 pulgadas" }, { kind: "storage", capacityGb: 256 }] } });
      const parts = (await db.query("select id,asset_kind,display_code,unit_code from product_units where installed_in_unit_id=$1 order by asset_kind", [got.unitId])).rows;
      const code = k => parts.find(p => p.asset_kind === k).display_code;
      assert.match(code("battery"), /^B-\d{4}$/); assert.match(code("screen"), /^P-\d{4}$/); assert.match(code("storage"), /^D-\d{4}$/);
      assert.equal((await unit(db, got.unitId)).display_code, null);
      const labels = (await db.query("select code,state,unit_id from workshop_qr_labels where unit_id = any($1)", [parts.map(p => p.id)])).rows;
      assert.equal(labels.length, 3); assert.ok(labels.every(l => l.state === "assigned" && parts.some(p => p.unit_code === l.code)));
      const mouse = await command(a, "component_receive", { kind: "mouse", locationId: locationA, costCop: "15000", componentCondition: "functional", snapshot: { kind: "mouse", notes: "inalámbrico" } });
      const mouseRow = (await db.query("select display_code from product_units where id=$1", [mouse.unitId])).rows[0];
      assert.match(mouseRow.display_code, /^R-\d{4}$/);
      assert.equal((await db.query("select count(*)::int n from workshop_qr_labels where unit_id=$1", [mouse.unitId])).rows[0].n, 1);
      const second = await command(a, "component_receive", { kind: "mouse", locationId: locationA, componentCondition: "untested", snapshot: { kind: "mouse" } });
      assert.notEqual((await db.query("select display_code from product_units where id=$1", [second.unitId])).rows[0].display_code, mouseRow.display_code);
      await assert.rejects(db.query("update product_units set display_code='X-0001' where id=$1", [mouse.unitId]), /display_code_immutable/);
    });
    await t.test("arreglo adicional: nombre y valor libres, suma al costo, solo el administrador lo anula", async () => {
      const extra = { unitId: computer, name: "Soldadura de bisagra", amountCop: "35000" };
      await assert.rejects(command(a, "extra_work", { ...extra, version: await version(db, computer), amountCop: "0" }), /extra_amount_invalid/);
      await assert.rejects(command(a, "extra_work", { ...extra, version: await version(db, computer), name: "ab" }), /extra_name_required/);
      await command(b, "extra_work", { ...extra, version: await version(db, computer) });
      await command(a, "extra_work", { ...extra, name: "Pegante y tornillos", amountCop: "5000", version: await version(db, computer) });
      const sum = async () => Number((await db.query("select coalesce(sum(amount_cop),0) s from cost_entries where product_unit_id=$1 and reference_type='workshop_extra'", [computer])).rows[0].s);
      assert.equal(await sum(), 40000);
      const list = (await a.query("select erp_workshop_extras($1) r", [computer])).rows[0].r;
      assert.equal(list.length, 2); assert.equal(list[0].reversed, false);
      await assert.rejects(command(b, "extra_work_reverse", { unitId: computer, version: await version(db, computer), costEntryId: list[0].id, reason: "Sin permiso" }), /permission_denied/);
      await command(a, "extra_work_reverse", { unitId: computer, version: await version(db, computer), costEntryId: list[0].id, reason: "Se cargó dos veces" });
      assert.equal(await sum(), 5000);
      await assert.rejects(command(a, "extra_work_reverse", { unitId: computer, version: await version(db, computer), costEntryId: list[0].id, reason: "Otra vez" }), /extra_already_reversed/);
      assert.equal((await a.query("select erp_workshop_extras($1) r", [computer])).rows[0].r[0].reversed, true);
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
