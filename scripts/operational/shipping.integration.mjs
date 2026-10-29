import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";

const database = process.env.ERP_TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/erp_test";
const parsed = new URL(database);
if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test")) throw new Error("Sólo una BD local de pruebas *_test está permitida.");
const connections = [];
async function connect(actor, role = "authenticated") {
  const client = new pg.Client({ connectionString: database }); await client.connect(); connections.push(client);
  if (actor) await client.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await client.query(`set role ${role === "authenticated" ? "authenticated" : role === "service_role" ? "service_role" : "postgres"}`);
  return client;
}
const key = () => randomUUID();
async function command(client, action, args = {}, request = key()) {
  const r = await client.query("select public.erp_shipping_command($1,$2::jsonb,$3::uuid) as result", [action, JSON.stringify(args), request]);
  return r.rows[0].result;
}

test("envíos y recaudos: persistencia, concurrencia, permisos y regresión ventas/caja", async (t) => {
  const adminId = key(), cashierId = key(), viewerId = key(), sellerId = key();
  const db = await connect(null, "postgres");
  try {
    for (const [id, role] of [[adminId, "admin"], [cashierId, "caja"], [viewerId, "viewer"], [sellerId, "vendedor"]]) {
      await db.query("insert into auth.users(id,email) values($1,$2)", [id, `shipping-${id}@example.invalid`]);
      await db.query("insert into public.profiles(id,email,is_admin,erp_role,active) values($1,$2,$3,$4,true) on conflict(id) do update set erp_role=$4,is_admin=$3,active=true", [id, `shipping-${id}@example.invalid`, role === "admin", role]);
    }
    const admin = await connect(adminId), cashier = await connect(cashierId), viewer = await connect(viewerId), seller = await connect(sellerId);
    const admin2 = await connect(adminId);
    const product = (await db.query("insert into public.products(title,price,stock,erp_stock_enabled) values('Equipo FICTICIO prueba envíos',100000,0,true) returning id")).rows[0].id;
    async function fixtureSale(amount = "100000", paid = false) {
      const unit = (await db.query("insert into public.product_units(product_id,unit_code,status,acquisition_cost_cop) values($1,$2,'available',40000) returning id", [product, `SHIP-TEST-${key()}`])).rows[0].id;
      const args = [{ itemType: "catalog", productId: product, productUnitId: unit, unitPriceCop: amount, quantity: 1 }];
      const sale = (await admin.query("select public.erp_create_sale_with_units(null,'Destinatario FICTICIO','00000001','3000000000',null,$1::jsonb,0,'transferencia',$2,6,'Prueba local', $3) as id", [JSON.stringify(args), paid ? "pagado" : "pendiente", key()])).rows[0].id;
      return { sale, unit, amount };
    }
    async function fixtureShipment(amount = "100000", paid = false) {
      const sale = await fixtureSale(amount, paid);
      const args = { saleId: sale.sale, name: "Destinatario FICTICIO", document: "00000001", phone: "3000000000", city: "Ciudad Prueba", department: "Departamento Prueba", officePickup: false, address: "Dirección FICTICIA", carrier: `Transportadora Prueba ${adminId}`, paymentMode: paid ? "prepaid" : "cod", collectCop: paid ? "0" : amount };
      return { ...(await command(admin, "create", args)), fixture: sale, createArgs: args };
    }
    async function deliver(shipment, freight = "10000") {
      let s = await command(admin, "guide", { id: shipment.id, version: shipment.version, guide: `000${key()}`, freightCop: freight, deductionsCop: "0" });
      s = await command(admin, "dispatch", { id: s.id, version: s.version });
      return command(admin, "deliver", { id: s.id, version: s.version, deliveredAt: new Date().toISOString(), expectedNetCop: (BigInt(s.collect_cop) - BigInt(freight)).toString(), evidence: "Entrega simulada, sólo BD local" });
    }
    await t.test("activación gradual, permisos SQL efectivos y RLS", async () => {
      await command(admin, "configure", { enabled: false });
      const sale = await fixtureSale();
      await assert.rejects(command(admin, "create", { saleId: sale.sale }), /shipping_disabled/);
      await assert.rejects(command(viewer, "list"), /permission_denied/);
      await assert.rejects(command(seller, "deposits"), /permission_denied/);
      await assert.rejects(command(cashier, "create", {}), /permission_denied/);
      await assert.rejects(viewer.query("insert into public.erp_shipments(sale_id) values($1)", [sale.sale]), /permission denied/);
      assert.equal((await viewer.query("select count(*)::int as n from public.erp_shipments")).rows[0].n, 0);
      await command(admin, "configure", { enabled: true, reminderHour: 0, recipientIds: [adminId] });
    });
    let first;
    await t.test("venta real por unidad, creación web/RPC idempotente y guía conserva ceros", async () => {
      first = await fixtureShipment();
      assert.equal(first.units.length, 1);
      assert.equal(first.units[0].id, first.fixture.unit);
      const replayKey = key(); const secondSale = await fixtureSale();
      const args = { ...first.createArgs, saleId: secondSale.sale };
      const replies = await Promise.all([command(admin, "create", args, replayKey), command(admin2, "create", args, replayKey)]);
      assert.equal(replies[0].id, replies[1].id);
      assert.equal(replies.filter((r) => r.duplicate).length, 1);
      await assert.rejects(command(admin, "create", { ...args, city: "Cambio" }, replayKey), /idempotency_conflict/);
      const cash = await db.query("select count(*)::int as n from public.cash_movements where sale_id=$1", [first.sale_id]);
      assert.equal(cash.rows[0].n, 0);
      await assert.rejects(command(admin, "guide", { id: first.id, version: first.version, guide: "000-FALLA", freightCop: "10000", deductionsCop: "1000" }), /deduction_reason_required/);
      await assert.rejects(command(admin, "guide", { id: first.id, version: first.version, guide: "000-FALLA", freightCop: "100001", deductionsCop: "0" }), /deductions_exceed_collection/);
      first = await command(admin, "guide", { id: first.id, version: first.version, guide: `000-${key()}`, freightCop: "10000", deductionsCop: "1000", deductionReason: "Seguro de prueba" });
      assert.ok(first.guide.startsWith("000-"));
      assert.equal(first.freight_cop, "10000");
      await assert.rejects(command(admin, "dispatch", { id: first.id, version: 1 }), /version_conflict/);
    });
    await t.test("consulta lista/ficha, filtros y permisos de columnas financieras", async () => {
      const result = await command(seller, "list", { limit: 30, carrier: first.carrier });
      assert.ok(result.items.some((row) => row.id === first.id));
      const detail = await command(seller, "detail", { id: first.id });
      assert.equal(detail.document_type, "internal_receipt");
      assert.equal(detail.fiscal_invoice_issued, false);
      assert.ok(detail.history.length >= 2);
    });
    await t.test("tres días Bogotá; jobs persistentes idempotentes sin confirmar entrega", async () => {
      const date = (await db.query("select public.erp_shipping_business_due('2026-10-23 20:00:00-05',3) as due")).rows[0].due;
      assert.equal(date.toISOString(), "2026-10-29T01:00:00.000Z");
      await db.query("select public.erp_shipping_prepare_jobs()"); await db.query("select public.erp_shipping_prepare_jobs()");
      const count = (await db.query("select count(*)::int as n from public.erp_shipping_jobs where dedupe_key=$1", [`guide:${first.id}`])).rows[0].n;
      assert.equal(count, 1);
      await db.query("update public.erp_shipping_jobs set due_at=now()-interval '1 minute' where shipment_id=$1", [first.id]);
      const jobs = (await db.query("select public.erp_shipping_claim_jobs(50) as jobs")).rows[0].jobs;
      const job = jobs.find((j) => j.shipment_id === first.id); assert.ok(job);
      assert.equal((await command(admin, "detail", { id: first.id })).status, "ready");
      assert.equal((await db.query("select public.erp_shipping_complete_job($1,$2,false,'test_retry') as ok", [job.id, job.lease_token])).rows[0].ok, true);
      assert.equal((await db.query("select public.erp_shipping_complete_job($1,$2,true,null) as ok", [job.id, job.lease_token])).rows[0].ok, false);
      assert.equal((await db.query("select attempts from public.erp_shipping_jobs where id=$1", [job.id])).rows[0].attempts, 1);
      await db.query("update public.erp_shipping_jobs set due_at=now()-interval '1 minute' where id=$1", [job.id]);
      const claimedAgain = (await db.query("select public.erp_shipping_claim_jobs(50) as jobs")).rows[0].jobs.find((j) => j.id === job.id);
      assert.ok(claimedAgain); assert.equal(claimedAgain.attempts, 2);
      await db.query("update public.erp_shipping_jobs set lease_until=now()-interval '1 second' where id=$1", [job.id]);
      const recovered = (await db.query("select public.erp_shipping_claim_jobs(50) as jobs")).rows[0].jobs.find((j) => j.id === job.id);
      assert.ok(recovered); assert.equal(recovered.attempts, 3); assert.notEqual(recovered.lease_token, claimedAgain.lease_token);
      assert.equal((await db.query("select public.erp_shipping_complete_job($1,$2,true,null) as ok", [job.id, claimedAgain.lease_token])).rows[0].ok, false);
      assert.equal((await db.query("select public.erp_shipping_complete_job($1,$2,true,null) as ok", [job.id, recovered.lease_token])).rows[0].ok, true);
      assert.equal((await command(admin, "detail", { id: first.id })).status, "ready");
      await db.query("update public.erp_shipments set guide_registered_at=now()-interval '7 days' where id=$1", [first.id]);
      assert.ok((await command(cashier, "metrics")).verifyDue >= 1, "Enviar el aviso no elimina el pendiente operativo de verificación");
    });
    await t.test("entrega confirma neto separado y conserva comprobante único", async () => {
      first = await command(admin, "dispatch", { id: first.id, version: first.version });
      await assert.rejects(command(admin, "deliver", { id: first.id, version: first.version, deliveredAt: new Date().toISOString(), expectedNetCop: "90000", evidence: "Prueba" }), /expected_net_mismatch/);
      first = await command(admin, "deliver", { id: first.id, version: first.version, deliveredAt: new Date().toISOString(), expectedNetCop: "89000", evidence: "Prueba entrega" });
      assert.equal(first.collection_status, "pending");
      assert.equal(first.received_cop, "0");
      assert.equal((await db.query("select count(*)::int as n from public.sales where id=$1", [first.sale_id])).rows[0].n, 1);
      assert.equal((await db.query("select dian_status from public.sales where id=$1", [first.sale_id])).rows[0].dian_status, "no_aplica");
    });
    let partialDeposit;
    await t.test("conciliación requiere confirmar, admite parcial y caja una sola vez", async () => {
      const args = { amountCop: "40000", depositedOn: new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date()), account: "Cuenta FICTICIA", reference: key(), evidence: "Prueba local", confirmed: true, allocations: [{ shipmentId: first.id, amountCop: "40000", version: first.version }] };
      await assert.rejects(command(cashier, "reconcile", { ...args, confirmed: false }), /confirmation_required/);
      const request = key(); partialDeposit = await command(cashier, "reconcile", args, request);
      assert.equal((await command(cashier, "reconcile", args, request)).duplicate, true);
      first = await command(admin, "detail", { id: first.id });
      assert.equal(first.collection_status, "partial"); assert.equal(first.balance_cop, "49000");
      assert.equal((await db.query("select sum(amount_cop)::text as sum from public.cash_movements where metadata->>'shippingDepositId'=$1", [partialDeposit.depositId])).rows[0].sum, "40000");
      assert.equal((await db.query("select payment_status from public.sales where id=$1", [first.sale_id])).rows[0].payment_status, "parcial");
      await assert.rejects(command(admin, "return", { id: first.id, version: first.version, reason: "Prueba" }), /reverse_collection_before_return/);
      await assert.rejects(cashier.query("select public.erp_reverse_cash_movement($1,'Prueba evasión')", [partialDeposit.cashMovementId]), /reverse_deposit_through_shipping/);
    });
    let finalDeposit;
    await t.test("dos sesiones compiten por el mismo saldo: sólo una gana", async () => {
      const args = { amountCop: "49000", depositedOn: new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date()), account: "Cuenta FICTICIA", reference: key(), confirmed: true, allocations: [{ shipmentId: first.id, amountCop: "49000", version: first.version }] };
      const results = await Promise.allSettled([command(admin, "reconcile", args), command(admin2, "reconcile", { ...args, reference: key() })]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      finalDeposit = results.find((r) => r.status === "fulfilled").value;
      first = await command(admin, "detail", { id: first.id });
      assert.equal(first.received_cop, "89000"); assert.equal(first.collection_status, "reconciled");
      assert.equal((await db.query("select payment_status from public.sales where id=$1", [first.sale_id])).rows[0].payment_status, "pagado");
      assert.equal((await db.query("select count(*)::int as n from public.cash_movements where sale_id=$1", [first.sale_id])).rows[0].n, 0);
      assert.equal((await command(cashier, "pending_collections", { limit: 101 })).items.some((s) => s.id === first.id), false);
    });
    await t.test("reversos auditados reabren saldo y nunca borran movimientos", async () => {
      const request = key(); const args = { id: finalDeposit.depositId, reason: "Reverso FICTICIO", confirmed: true };
      await command(cashier, "reverse_deposit", args, request);
      assert.equal((await command(cashier, "reverse_deposit", args, request)).duplicate, true);
      await assert.rejects(command(cashier, "reverse_deposit", args), /deposit_not_active/);
      first = await command(admin, "detail", { id: first.id }); assert.equal(first.balance_cop, "49000");
      await command(cashier, "reverse_deposit", { id: partialDeposit.depositId, reason: "Reverso de prueba", confirmed: true });
      first = await command(admin, "detail", { id: first.id }); assert.equal(first.received_cop, "0");
      const sum = (await db.query("select sum(cm.amount_cop)::text as sum from public.cash_movements cm where cm.id in (select cash_movement_id from public.erp_shipping_deposits where id=any($1::uuid[])) or cm.reversal_of_id in (select cash_movement_id from public.erp_shipping_deposits where id=any($1::uuid[]))", [[partialDeposit.depositId, finalDeposit.depositId]])).rows[0].sum;
      assert.equal(sum, "0");
    });
    await t.test("cancelación preserva venta/stock; devolución queda pendiente hasta confirmar reingreso; no devuelve dinero", async () => {
      const cancelled = await fixtureShipment();
      await command(admin, "cancel", { id: cancelled.id, version: cancelled.version, reason: "Transportadora cancelada" });
      assert.equal((await db.query("select status from public.product_units where id=$1", [cancelled.fixture.unit])).rows[0].status, "sold");
      const returned = await command(admin, "return", { id: first.id, version: first.version, reason: "Devolución física FICTICIA" });
      assert.equal(returned.status, "return_pending"); assert.equal(returned.collection_status, "not_due");
      // En devolución: las unidades siguen vendidas y no hay movimiento de inventario hasta confirmar el reingreso.
      assert.equal((await db.query("select status from public.product_units where id=$1", [first.units[0].id])).rows[0].status, "sold");
      assert.equal((await db.query("select count(*)::int as n from public.inventory_movements where reference_type='shipment' and reference_id=$1 and movement_type='return'", [first.id])).rows[0].n, 0);
      await assert.rejects(command(admin, "return_confirm", { id: returned.id, version: returned.version, reason: "Llegó al local", guide: "GUIA-EQUIVOCADA" }), /shipping_return_guide_mismatch/);
      const confirmed = await command(admin, "return_confirm", { id: returned.id, version: returned.version, reason: "Llegó al local FICTICIO", guide: returned.guide });
      assert.equal(confirmed.status, "returned");
      assert.equal((await db.query("select status from public.product_units where id=$1", [first.units[0].id])).rows[0].status, "available");
      assert.equal((await db.query("select count(*)::int as n from public.inventory_movements where reference_type='shipment' and reference_id=$1 and movement_type='return'", [first.id])).rows[0].n, 1);
      await assert.rejects(command(admin, "return_confirm", { id: confirmed.id, version: confirmed.version, reason: "Otra vez", guide: returned.guide }), /shipping_invalid_return_confirm_state/);
    });
    await t.test("referencia de depósito duplicada falla y revierte toda la transacción", async () => {
      const a = await deliver(await fixtureShipment()), b = await deliver(await fixtureShipment());
      const base = { amountCop: "90000", depositedOn: new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date()), account: "Cuenta DUP", reference: key(), confirmed: true };
      await command(cashier, "reconcile", { ...base, allocations: [{ shipmentId: a.id, amountCop: "90000", version: a.version }] });
      const before = (await db.query("select count(*)::int as n from public.cash_movements")).rows[0].n;
      await assert.rejects(command(cashier, "reconcile", { ...base, allocations: [{ shipmentId: b.id, amountCop: "90000", version: b.version }] }), /duplicate key/);
      assert.equal((await db.query("select count(*)::int as n from public.cash_movements")).rows[0].n, before);
      assert.equal((await command(admin, "detail", { id: b.id })).received_cop, "0");
    });
    await t.test("servicio bot comparte transacción y exige operador vinculado + confirmación", async () => {
      const service = await connect(null, "service_role");
      const hash = createHash("sha256").update(`test-operator-${adminId}`).digest("hex");
      await service.query("select public.erp_agent_upsert_operator($1,$2,'Prueba local',true)", [sellerId, hash]);
      const s = await fixtureShipment(); const request = key(); const confirmationHash = createHash("sha256").update(`${request}:123456`).digest("hex");
      const messageId = `test-message-${key()}`;
      const args = { id: s.id, version: s.version, guide: `000${key()}`, freightCop: "12000", deductionsCop: "0" };
      const submit = await service.query("select public.erp_shipping_agent_submit($1,$2,$3,'shipping.guide',$4::jsonb,$5) as result", [hash, messageId, request, JSON.stringify(args), confirmationHash]);
      assert.equal(submit.rows[0].result.status, "pending_confirmation");
      await assert.rejects(service.query("select public.erp_shipping_agent_submit($1,$2,$3,'shipping.guide',$4::jsonb,$5)", [hash, messageId, request, JSON.stringify({ ...args, freightCop: "13000" }), confirmationHash]), /idempotency_conflict/);
      assert.equal((await command(admin, "detail", { id: s.id })).status, "pending_guide");
      const confirm = (await service.query("select public.erp_agent_confirm_request($1,$2,$3) as result", [hash, request, confirmationHash])).rows[0].result;
      assert.equal(confirm.status, "executed", JSON.stringify(confirm));
      assert.equal(confirm.result.status, "ready");
      const replay = (await service.query("select public.erp_agent_confirm_request($1,$2,$3) as result", [hash, request, confirmationHash])).rows[0].result;
      assert.equal(replay.status, "executed");
      await assert.rejects(service.query("select public.erp_agent_submit_request($1,$2,$3,'shipping.list','{}',$4)", ["a".repeat(64), key(), key(), confirmationHash]), /operator_not_authorized/);
    });
    await t.test("venta pagada anterior y caja siguen funcionando, sin duplicar comprobantes", async () => {
      const prepaid = await fixtureShipment("70000", true);
      assert.equal(prepaid.collect_cop, "0");
      const movements = (await db.query("select amount_cop::text from public.cash_movements where sale_id=$1 and movement_type='sale'", [prepaid.sale_id])).rows;
      assert.deepEqual(movements, [{ amount_cop: "70000" }]);
      let s = await command(admin, "guide", { id: prepaid.id, version: prepaid.version, guide: `000${key()}`, freightCop: "10000", deductionsCop: "0" });
      s = await command(admin, "dispatch", { id: s.id, version: s.version });
      s = await command(admin, "deliver", { id: s.id, version: s.version, deliveredAt: new Date().toISOString(), expectedNetCop: "0", evidence: "Prueba prepagado" });
      assert.equal(s.collection_status, "reconciled");
      s = await command(admin, "return", { id: s.id, version: s.version, reason: "Devolución prueba prepagado" });
      assert.equal(s.status, "return_pending");
      assert.equal((await db.query("select payment_status from public.sales where id=$1", [prepaid.sale_id])).rows[0].payment_status, "pagado");
      assert.equal((await db.query("select sum(amount_cop)::text as total from public.cash_movements where sale_id=$1", [prepaid.sale_id])).rows[0].total, "70000");
      assert.ok((await command(cashier, "metrics")).pendingGuide >= 0);
      assert.ok((await command(cashier, "deposits")).items.length > 0);
    });
  } finally { await Promise.all(connections.map((client) => client.end())); }
});
