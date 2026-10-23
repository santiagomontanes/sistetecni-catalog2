// Dos conexiones reales: prueba bloqueos, idempotencia y saldo; solo PostgreSQL Docker local.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
const connectionString = process.env.OPERATIONAL_TEST_DATABASE_URL || 'postgresql://postgres@127.0.0.1:55432/erp_test';
const url = new URL(connectionString);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432' || url.pathname !== '/erp_test') throw new Error('Se exige PostgreSQL local efímero de pruebas en puerto 55432/erp_test.');
const admin = new pg.Client({ connectionString });
const first = new pg.Client({ connectionString });
const second = new pg.Client({ connectionString });
const actor = randomUUID(); const worker = randomUUID(); const evidence = randomUUID();
await Promise.all([admin.connect(), first.connect(), second.connect()]);
const ids = [];
let changedSettings = false;
async function rpc(client, user, action, data, key = randomUUID(), hold = false) {
  await client.query('begin');
  try {
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
    const result = await client.query('select public.attendance_command($1,$2::jsonb,$3) as value', [action, JSON.stringify(data), key]);
    if (!hold) await client.query('commit');
    return result.rows[0].value;
  } catch (error) { await client.query('rollback'); throw error; }
}
try {
  const settings = await admin.query('select enabled from public.attendance_settings where singleton');
  assert.equal(settings.rows[0].enabled, false, 'Prueba exige flag apagado inicialmente para restaurarlo');
  await admin.query('insert into auth.users(id,email) values ($1,$2),($3,$4)', [actor, `attendance-${actor}@example.invalid`, worker, `attendance-${worker}@example.invalid`]);
  await admin.query("insert into public.profiles(id,erp_role,active,is_admin) values($1,'admin',true,true),($2,'tecnico',true,false) on conflict(id) do update set erp_role=excluded.erp_role,active=true,is_admin=excluded.is_admin", [actor, worker]);
  await rpc(admin, actor, 'settings', { enabled: true, reason: 'Prueba concurrente local' });
  changedSettings = true;
  await rpc(admin, actor, 'rate', { employeeId: worker, effectiveFrom: '2019-01-01T00:00:00Z', amountCop: '10000', modality: 'hourly', paidLunch: false, reason: 'Prueba concurrente' });
  await admin.query("insert into public.attendance_evidence(id,employee_id,storage_path,mime_type,bytes,status,expires_at) values($1,$2,$3,'image/jpeg',100,'ready',now()+interval '1 day')", [evidence, worker, `${worker}/${evidence}.jpg`]);

  const shift = await rpc(first, worker, 'start', { evidenceId: evidence }, randomUUID(), true);
  const losingEntry = rpc(second, worker, 'start', { evidenceId: evidence }).then(value => ({ value }), error => ({ error }));
  // La segunda sesión compite mientras la primera mantiene el lock sin commit.
  await first.query('commit');
  const loser = await losingEntry;
  assert.match(loser.error?.message || '', /attendance_shift_already_open/);
  const count = await admin.query('select count(*)::int as n from public.attendance_shifts where employee_id=$1', [worker]);
  assert.equal(count.rows[0].n, 1);
  console.log('PASS dos sesiones simultáneas: un solo turno');

  await rpc(admin, actor, 'correct', { shiftId: shift.id, version: 1, startedAt: '2020-01-01T08:00:00-05:00', endedAt: '2020-01-01T09:00:00-05:00', reason: 'Turno sintético de una hora' });
  const settlement = await rpc(admin, actor, 'settlement.create', { employeeId: worker, from: '2020-01-01', to: '2020-01-01' });
  await rpc(admin, actor, 'settlement.approve', { settlementId: settlement.id, amountCop: '10000', reason: 'Aprobación sintética' });
  const payment = { settlementId: settlement.id, amountCop: '10000', kind: 'payment', method: 'efectivo', reference: `race-${randomUUID()}` };
  const key = randomUUID();
  const winner = await rpc(first, actor, 'payment', payment, key, true);
  ids.push(winner.expenseId);
  const retry = rpc(second, actor, 'payment', payment, key);
  await first.query('commit');
  assert.deepEqual(await retry, winner);
  const paymentCount = await admin.query('select count(*)::int as n from public.attendance_payments where employee_id=$1', [worker]);
  assert.equal(paymentCount.rows[0].n, 1);
  console.log('PASS misma petición en dos sesiones: un pago y un gasto');

  await rpc(admin, actor, 'payment.reverse', { settlementId: settlement.id, paymentId: winner.paymentId, reason: 'Preparar carrera del saldo' });
  const balanceWinner = await rpc(first, actor, 'payment', { ...payment, reference: `balance-${randomUUID()}` }, randomUUID(), true);
  ids.push(balanceWinner.expenseId);
  const balanceLoser = rpc(second, actor, 'payment', { ...payment, reference: `balance-${randomUUID()}` }).then(value => ({ value }), error => ({ error }));
  await first.query('commit');
  assert.match((await balanceLoser).error?.message || '', /attendance_payment_exceeds_balance/);
  console.log('PASS dos pagos distintos compiten por saldo: solo uno consume');

  const excess = await Promise.allSettled([
    rpc(first, actor, 'payment', { ...payment, reference: `excess-${randomUUID()}` }),
    rpc(second, actor, 'payment', { ...payment, reference: `excess-${randomUUID()}` }),
  ]);
  assert(excess.every(result => result.status === 'rejected' && /attendance_payment_exceeds_balance/.test(result.reason.message)));
  console.log('PASS saldo pagado no admite sobrepago desde ninguna sesión');
} finally {
  await Promise.allSettled([first.query('rollback'), second.query('rollback')]);
  // Limpieza exclusivamente de los UUID sintéticos de esta ejecución; nunca datos del usuario.
  await admin.query('begin');
  try {
    await admin.query('delete from public.attendance_events where employee_id=any($1::uuid[])', [[actor, worker]]);
    await admin.query('delete from public.attendance_requests where actor_id=any($1::uuid[])', [[actor, worker]]);
    await admin.query('delete from public.attendance_payments where employee_id=$1', [worker]);
    await admin.query('delete from public.attendance_shifts where employee_id=$1', [worker]);
    await admin.query('delete from public.attendance_settlements where employee_id=$1', [worker]);
    await admin.query('delete from public.attendance_rates where employee_id=$1', [worker]);
    await admin.query('delete from public.attendance_evidence where employee_id=$1', [worker]);
    await admin.query('delete from public.audit_events where actor_ref=$1', [actor]);
    await admin.query('delete from public.cash_movements where expense_id=any($1::uuid[])', [ids]);
    await admin.query('delete from public.operating_expenses where id=any($1::uuid[])', [ids]);
    await admin.query('delete from public.profiles where id=any($1::uuid[])', [[actor, worker]]);
    await admin.query('delete from auth.users where id=any($1::uuid[])', [[actor, worker]]);
    if (changedSettings) await admin.query('update public.attendance_settings set enabled=false where singleton');
    await admin.query('commit');
  } catch (error) { await admin.query('rollback'); throw error; }
  finally { await Promise.allSettled([admin.end(), first.end(), second.end()]); }
}
