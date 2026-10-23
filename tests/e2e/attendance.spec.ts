import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createOperator, localAdmin, login, rpc } from './helpers';
import { appEnv } from '../../scripts/operational/browser-env.mjs';

test.use({ permissions: ['camera'], launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });
test.describe.serial('Asistencia con Auth, PostgreSQL y Storage locales reales', () => {
  let manager: Awaited<ReturnType<typeof createOperator>>;
  let employee: Awaited<ReturnType<typeof createOperator>>;
  let other: Awaited<ReturnType<typeof createOperator>>;
  let originalEnabled = false;
  let shiftId = ''; let evidenceId = ''; let evidencePath = '';
  let signedPhotoUrl = ''; let signedPhotoExpiresAt = 0; let actualJpeg: Buffer;
  const command = (action: string, data: Record<string, unknown>, key = randomUUID()) => rpc(manager.client, 'attendance_command', { p_action: action, p_data: data, p_request_key: key });

  test.beforeAll(async () => {
    [manager, employee, other] = await Promise.all([createOperator('admin'), createOperator('tecnico'), createOperator('tecnico')]);
    const settings = await localAdmin.from('attendance_settings').select('enabled').single();
    if (settings.error) throw settings.error;
    originalEnabled = settings.data.enabled;
    await command('settings', { enabled: true, reason: 'Prueba E2E local sintética' });
    await command('rate', { employeeId: employee.id, effectiveFrom: '2019-01-01T00:00:00Z', modality: 'hourly', amountCop: '10000', paidLunch: false, reason: 'Tarifa sintética E2E' });
  });
  test.afterAll(async () => {
    if (manager) await command('settings', { enabled: originalEnabled, reason: 'Restaurar bandera tras E2E' });
  });

  test('selfie cámara, turno, almuerzo, salida y evidencia privada persistida', async ({ page, request }) => {
    await login(page, employee);
    await page.goto('/admin/asistencia');
    await expect(page.getByRole('heading', { name: 'Asistencia y pagos operativos' })).toBeVisible();
    await page.getByRole('button', { name: 'Iniciar turno: abrir cámara' }).click();
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2);
    await page.getByRole('button', { name: 'Tomar selfie' }).click();
    await expect(page.getByAltText('Selfie pendiente de guardar')).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar selfie y registrar entrada' }).click();
    await expect(page.getByRole('button', { name: 'Iniciar almuerzo' })).toBeVisible();
    const shifts = await employee.client.from('attendance_shifts').select('*').eq('employee_id', employee.id).single();
    expect(shifts.error).toBeNull(); expect(shifts.data.started_at).toBeTruthy();
    shiftId = shifts.data.id; evidenceId = shifts.data.evidence_id;
    const evidence = await employee.client.from('attendance_evidence').select('*').eq('id', evidenceId).single();
    expect(evidence.error).toBeNull(); expect(evidence.data.status).toBe('ready'); expect(evidence.data.bytes).toBeLessThanOrEqual(524288);
    expect(evidence.data).not.toHaveProperty('base64'); expect(evidence.data).not.toHaveProperty('binary'); evidencePath = evidence.data.storage_path;
    const actualFile = await localAdmin.storage.from('attendance-private').download(evidencePath);
    expect(actualFile.error).toBeNull(); expect(actualFile.data?.size).toBe(evidence.data.bytes);
    actualJpeg = Buffer.from(await actualFile.data!.arrayBuffer());
    const signed = await request.get(`/api/admin/attendance/photo?id=${evidenceId}`, { headers: { Authorization: `Bearer ${employee.token}` } });
    expect(signed.status()).toBe(200); const signedBody = await signed.json(); expect(signedBody.expiresIn).toBe(60);
    signedPhotoUrl = signedBody.url; signedPhotoExpiresAt = Date.now() + 62_000;
    expect((await request.get(signedBody.url)).ok()).toBe(true);
    const wrongUser = await request.get(`/api/admin/attendance/photo?id=${evidenceId}`, { headers: { Authorization: `Bearer ${other.token}` } });
    expect(wrongUser.status()).toBe(404);
    await page.getByRole('button', { name: 'Iniciar almuerzo' }).click();
    await expect(page.getByRole('button', { name: 'Finalizar almuerzo' })).toBeVisible();
    await page.getByRole('button', { name: 'Finalizar almuerzo' }).click();
    await expect(page.getByRole('button', { name: 'Registrar salida' })).toBeVisible();
    page.on('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Registrar salida' }).click();
    await expect(page.getByText('No tienes un turno abierto. Captura una selfie para registrar la entrada.')).toBeVisible();
    const final = await employee.client.from('attendance_shifts').select('*').eq('id', shiftId).single();
    expect(final.data.ended_at).toBeTruthy(); expect(final.data.lunch_started_at).toBeTruthy(); expect(final.data.lunch_ended_at).toBeTruthy();
    await page.reload();
    await expect(page.getByText('No tienes un turno abierto. Captura una selfie para registrar la entrada.')).toBeVisible();
  });

  test('corrección UI auditada, snapshot histórico, aprobación y pago integrados', async ({ page }) => {
    await login(page, manager); await page.goto('/admin/asistencia');
    await page.getByLabel('Empleado', { exact: true }).selectOption(employee.id);
    await page.getByRole('button', { name: 'Corregir', exact: true }).click();
    const correction = page.locator('section').filter({ has: page.getByRole('heading', { name: /Corrección auditada/ }) });
    await correction.getByLabel('Entrada', { exact: true }).fill('2020-01-01T22:00');
    await correction.getByLabel('Salida (vacío = turno abierto)').fill('2020-01-02T06:00');
    await correction.getByLabel('Inicio de almuerzo').fill('2020-01-02T01:00');
    await correction.getByLabel('Fin de almuerzo').fill('2020-01-02T01:30');
    await correction.getByLabel('Motivo obligatorio').fill('Corrección E2E sintética con turno nocturno');
    page.on('dialog', dialog => dialog.accept());
    await correction.getByRole('button', { name: 'Guardar corrección' }).click();
    await expect(correction).toBeHidden();
    const events = await localAdmin.from('attendance_events').select('before_snapshot,after_snapshot,reason').eq('shift_id', shiftId).eq('event_type', 'correct');
    expect(events.data).toHaveLength(1); expect(events.data?.[0].before_snapshot).toBeTruthy(); expect(events.data?.[0].after_snapshot).toBeTruthy();
    await command('rate', { employeeId: employee.id, effectiveFrom: '2020-01-01T00:00:00Z', modality: 'hourly', amountCop: '20000', paidLunch: true, reason: 'Nueva tarifa no altera pasado E2E' });
    await page.getByText('Tarifas vigentes y liquidación', { exact: true }).click();
    await page.getByLabel('Entradas desde').fill('2020-01-01'); await page.getByLabel('Hasta', { exact: true }).fill('2020-01-01');
    await page.getByRole('button', { name: 'Calcular borrador' }).click();
    await expect(page.getByText(/Horas: 7.50.*75.000/)).toBeVisible();
    await page.getByRole('button', { name: 'Gestionar', exact: true }).click();
    await page.getByLabel('Motivo de aprobación').fill('Revisión E2E de horas registradas');
    await page.getByRole('button', { name: 'Aprobar', exact: true }).click();
    await expect(page.getByText(/2020-01-01 a 2020-01-01 · Aprobada/)).toBeVisible();
    await page.getByLabel('Importe COP', { exact: true }).fill('75000');
    await page.getByLabel('Referencia única').fill(`E2E-${randomUUID()}`);
    await page.getByRole('button', { name: 'Registrar pago / anticipo' }).click();
    await expect(page.getByText(/Pagado: \$ 75.000 COP · Saldo aprobado: \$ 0 COP/)).toBeVisible();
    const dashboardResponse = await page.request.get(`/api/admin/attendance?employee=${employee.id}`, { headers: { Authorization: `Bearer ${manager.token}` } });
    expect(dashboardResponse.ok()).toBe(true);
    const dashboard = await dashboardResponse.json();
    expect(dashboard.settlements[0].base_cop).toBe('75000');
    expect(dashboard.balances[0].paid_cop).toBe('75000');
    expect(dashboard.payments[0].amount_cop).toBe('75000');
    const payments = await localAdmin.from('attendance_payments').select('expense_id').eq('employee_id', employee.id);
    expect(payments.data).toHaveLength(1);
    const ledger = await localAdmin.from('cash_movements').select('amount_cop').eq('expense_id', payments.data![0].expense_id);
    expect(ledger.data).toHaveLength(1); expect(ledger.data?.[0].amount_cop).toBe(-75000);
  });

  test('retención elimina archivo real, verifica ausencia y reintenta sin duplicar', async ({ request }) => {
    // Esperar el TTL real del proveedor antes de borrar: un 404 posterior al borrado no probaría expiración.
    while (Date.now() < signedPhotoExpiresAt) await new Promise(resolve => setTimeout(resolve, Math.min(30_000, signedPhotoExpiresAt - Date.now())));
    expect((await localAdmin.storage.from('attendance-private').download(evidencePath)).error).toBeNull();
    expect((await request.get(signedPhotoUrl)).ok()).toBe(false);
    const expired = await localAdmin.from('attendance_evidence').update({ expires_at: '2020-01-01T00:00:00Z' }).eq('id', evidenceId);
    expect(expired.error).toBeNull();
    const notSigned = await request.get(`/api/admin/attendance/photo?id=${evidenceId}`, { headers: { Authorization: `Bearer ${employee.token}` } });
    expect(notSigned.status()).toBe(404);
    expect((await request.post('/api/internal/attendance/retention')).status()).toBe(403);
    const headers = { Authorization: `Bearer ${appEnv.ATTENDANCE_RETENTION_SECRET}` };
    const cleanup = await request.post('/api/internal/attendance/retention', { headers });
    expect(cleanup.status()).toBe(200); expect((await cleanup.json()).deleted).toBeGreaterThanOrEqual(1);
    const record = await localAdmin.from('attendance_evidence').select('status,deleted_at,deletion_attempts').eq('id', evidenceId).single();
    expect(record.data?.status).toBe('deleted'); expect(record.data?.deleted_at).toBeTruthy(); expect(record.data?.deletion_attempts).toBeGreaterThanOrEqual(1);
    const file = await localAdmin.storage.from('attendance-private').download(evidencePath); expect(file.error).toBeTruthy();
    const retry = await request.post('/api/internal/attendance/retention', { headers });
    expect(retry.status()).toBe(200); expect((await retry.json()).deleted).toBe(0);
  });

  test('corte tras subir selfie: retención recupera evidencia pendiente y elimina el archivo', async ({ request }) => {
    const id = randomUUID(); const path = `${employee.id}/${id}.jpg`;
    const metadata = await localAdmin.from('attendance_evidence').insert({ id, employee_id: employee.id, storage_path: path, mime_type: 'image/jpeg', bytes: actualJpeg.length, status: 'pending', expires_at: '2020-01-01T00:00:00Z' });
    expect(metadata.error).toBeNull();
    expect((await localAdmin.storage.from('attendance-private').upload(path, actualJpeg, { contentType: 'image/jpeg' })).error).toBeNull();
    expect((await localAdmin.storage.from('attendance-private').download(path)).error).toBeNull();
    const cleaned = await request.post('/api/internal/attendance/retention', { headers: { Authorization: `Bearer ${appEnv.ATTENDANCE_RETENTION_SECRET}` } });
    expect(cleaned.ok()).toBe(true); expect((await cleaned.json()).deleted).toBeGreaterThanOrEqual(1);
    expect((await localAdmin.storage.from('attendance-private').download(path)).error).toBeTruthy();
    const record = await localAdmin.from('attendance_evidence').select('status,deleted_at').eq('id', id).single();
    expect(record.data?.status).toBe('deleted'); expect(record.data?.deleted_at).toBeTruthy();
  });
});
