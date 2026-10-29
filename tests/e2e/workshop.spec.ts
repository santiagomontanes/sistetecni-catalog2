import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
// Fixture ESM exclusivamente local, sin credenciales ni entornos remotos.
import { appUrl, baseUrl, anonKey, serviceKey, testPassword } from "../../scripts/operational/browser-env.mjs";

const email = `workshop-${randomUUID()}@local.invalid`;
let token: string;
async function json(path: string, method: string, body: unknown, access = serviceKey) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { apikey: anonKey, Authorization: `Bearer ${access}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
  return data;
}
async function command(action: string, payload: unknown) { return json("/rest/v1/rpc/erp_workshop_command", "POST", { p_action: action, p_payload: payload, p_key: randomUUID() }, token); }
async function login(page: Page) {
  await page.goto(`${appUrl}/admin/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(testPassword);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 30000 });
  await page.goto(`${appUrl}/admin/taller`);
  await expect(page.getByRole("heading", { name: "Taller operativo", exact: true })).toBeVisible();
}
test.beforeAll(async () => {
  if (!/^http:\/\/127\.0\.0\.1:/.test(baseUrl) || !/^http:\/\/127\.0\.0\.1:/.test(appUrl)) throw new Error("E2E taller admite únicamente servicios loopback sintéticos");
  const user = await json("/auth/v1/admin/users", "POST", { email, password: testPassword, email_confirm: true });
  await json("/rest/v1/profiles", "POST", { id: user.id, email, is_admin: true, erp_role: "admin", active: true });
  const session = await json("/auth/v1/token?grant_type=password", "POST", { email, password: testPassword }, anonKey);
  token = session.access_token;
  await command("configure", { enabled: true });
});

test("QR impreso, recepción 1GB, vínculo de dos pestañas, traslado y evidencia original", async ({ page, browser }) => {
  test.setTimeout(120000);
  const destination=await command("location",{code:`DEST-${randomUUID().slice(0,6).toUpperCase()}`,name:"Destino sintético móvil"});
  await login(page);
  await page.getByText("Preparar taller: etiquetas QR y ubicaciones", { exact: true }).click();
  // Ubicación y sub-posición libres: «Mueble X» con «Estante 1» dentro, sin códigos a la vista.
  const furniture = `Mueble ${randomUUID().slice(0, 4).toUpperCase()}`;
  const placeLabel = `${furniture} › Estante 1`;
  await page.getByLabel("Ubicación", { exact: true }).fill(furniture);
  await page.getByLabel(/Sub-posición/).fill("Estante 1");
  await expect(page.getByText(`Se creará «${furniture}» y dentro «Estante 1».`)).toBeVisible();
  await page.getByRole("button", { name: "Guardar ubicación", exact: true }).click();
  await expect(page.locator("option").filter({ hasText: placeLabel }).first()).toBeAttached();
  await expect(page.locator("option").filter({ hasText: /^Mueble [A-F0-9]{4}$/ }).first()).toBeAttached();
  // Segunda sub-posición en la misma ubicación existente: no la duplica.
  await page.getByLabel("Ubicación", { exact: true }).fill(furniture);
  await page.getByLabel(/Sub-posición/).fill("Estante 2");
  await expect(page.getByText(`Se agregará «Estante 2» dentro de «${furniture}».`)).toBeVisible();
  await page.getByRole("button", { name: "Guardar ubicación", exact: true }).click();
  await expect(page.locator("option").filter({ hasText: `${furniture} › Estante 2` }).first()).toBeAttached();
  await page.getByLabel("Ubicación", { exact: true }).fill(furniture);
  await page.getByLabel(/Sub-posición/).fill("estante 1");
  await expect(page.getByText("Esa sub-posición ya existe.")).toBeVisible();
  await page.getByLabel("¿Cuántos equipos llegaron?").fill("1");
  await page.getByRole("button", { name: /Generar 1 QR y ver PDF/ }).click();
  const summary = page.locator("p").filter({ hasText: /STU-\d{6,} a STU-\d{6,}/ }).first();
  await expect(summary).toBeVisible();
  const qr = (await summary.innerText()).match(/STU-\d{6,}/)![0];
  expect(qr).toMatch(/^STU-\d{6,}$/);
  await expect(page.getByTitle("Vista previa de etiquetas")).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Descargar PDF" }).click()]);
  const pdfBytes = readFileSync((await download.path())!);
  expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdfBytes.length).toBeGreaterThan(1500);
  await page.locator("summary").filter({ hasText: /Lotes anteriores \(/ }).click();
  await expect(page.getByRole("button", { name: "Reimprimir libres" }).first()).toBeEnabled();
  await page.getByText(/Celular y estación ·/).click();
  await page.getByRole("button", { name: "Generar código en computador" }).click();
  const pair = page.locator("details").filter({ hasText: "Inicia sesión con tu cuenta en ambos dispositivos" });
  await expect(pair.locator("strong")).toBeVisible();
  const pairingCode = await pair.locator("strong").innerText();
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await mobileContext.newPage();
  try {
    await login(mobile);
    await mobile.getByText(/Celular y estación ·/).click();
    await mobile.getByLabel("Código temporal").fill(pairingCode);
    await mobile.getByRole("button", { name: "Vincular este celular" }).click();
    await expect(mobile.getByText("Conectado · sincronizado", { exact: true })).toBeVisible({ timeout: 15000 });
    // El celular actúa como lector del computador: lo que lee/escribe el celular aparece en la pantalla del computador.
    await mobile.getByLabel("Código QR", { exact: true }).fill(qr);
    await mobile.getByRole("button", { name: "Abrir QR", exact: true }).click();
    await expect(page.getByRole("heading", { name: `Recepción · ${qr}` })).toBeVisible({ timeout: 20000 });
    await page.getByLabel("Código QR", { exact: true }).fill(qr);
    await page.getByRole("button", { name: "Abrir QR", exact: true }).click();
    const receipt = page.locator("form").filter({ has: page.getByRole("heading", { name: `Recepción · ${qr}` }) });
    await expect(receipt).toBeVisible();
    await receipt.getByLabel("Marca", { exact: true }).fill("Marca sintética");
    await receipt.getByLabel("Modelo", { exact: true }).fill("Recepción E2E");
    await receipt.getByLabel(/^Ubicación física/).selectOption({ label: placeLabel });
    await receipt.getByRole("button", { name: "Agregar RAM", exact: true }).click();
    await receipt.getByLabel("Capacidad GB", { exact: true }).fill("1");
    await receipt.getByLabel("Generación RAM", { exact: true }).selectOption("DDR3");
    await receipt.getByRole("button", { name: "Registrar y asignar QR", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/taller\?unit=[a-f0-9-]+$/, { timeout: 30000 });
    const unitId = new URL(page.url()).searchParams.get("unit");
    await expect(mobile).toHaveURL(new RegExp(`unit=${unitId}`), { timeout: 20000 });
    await expect(page.getByText("RAM actual: 1 GB", { exact: true })).toBeVisible();
    await expect(mobile.getByText("RAM actual: 1 GB", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: /Fase 1/ }).click();
    await mobile.getByRole("tab", { name: /Fase 1/ }).click();
    const png=await mobile.screenshot();
    await mobile.getByLabel(/Tomar foto o seleccionar archivo/).setInputFiles({name:"evidencia-sintetica.png",mimeType:"image/png",buffer:png});
    await expect(mobile.getByText("Foto guardada en almacenamiento privado.",{exact:true})).toBeVisible();
    await expect(page.getByAltText("Evidencia interna de la unidad")).toBeVisible({timeout:25000});
    await page.getByLabel(/^Trasladar a/).selectOption(destination.id);
    await page.getByPlaceholder("Motivo del traslado").fill("Traslado sintético E2E");
    await page.getByRole("button",{name:"Guardar movimiento",exact:true}).click();
    await expect(page.locator('p[role="alert"]')).toHaveCount(0);
    await expect(async () => {
      if (!(await page.getByText("Instantánea original", { exact: false }).first().isVisible())) await page.getByText("Evidencia original y correcciones de recepción", { exact: true }).click();
      await expect(page.getByText("Instantánea original", { exact: false }).first()).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20000 });
    const server = await json("/rest/v1/rpc/erp_workshop_read", "POST", { p_unit_id: unitId }, token);
    expect(server.receipts[0].snapshot.components[0].capacityGb).toBe(1);
    expect(server.components.find((c: { installed_in_unit_id: string }) => c.installed_in_unit_id === unitId)).toBeTruthy();
    expect(server.unit.location_id).toBe(destination.id);
    expect(server.events.some((e:{event_type:string})=>e.event_type==="move")).toBe(true);
    // Una edición local no se reemplaza por la actualización del celular.
    const sourceId=server.locations.find((l:{name:string;parent_id:string|null})=>l.name==="Estante 1"&&server.locations.some((p:{id:string;name:string})=>p.id===l.parent_id&&p.name===furniture)).id;
    await page.getByLabel(/^Trasladar a/).selectOption(sourceId);
    await page.getByPlaceholder("Motivo del traslado").fill("Borrador local que debe conservarse");
    await mobile.waitForTimeout(6000);
    await mobile.getByLabel(/^Trasladar a/).selectOption(sourceId);
    await mobile.getByPlaceholder("Motivo del traslado").fill("Movimiento simultáneo desde celular");
    await mobile.getByRole("button",{name:"Guardar movimiento",exact:true}).click();
    await expect(page.getByText("Hay cambios de otra sesión. Guarde para detectar conflictos o recargue.",{exact:true})).toBeVisible({timeout:15000});
    await expect(page.getByPlaceholder("Motivo del traslado")).toHaveValue("Borrador local que debe conservarse");
    await page.getByRole("button",{name:"Guardar movimiento",exact:true}).click();
    await expect(page.locator('p[role="alert"]')).toContainText("Otra sesión modificó");
    page.once("dialog",dialog=>dialog.accept());await page.getByRole("button",{name:"Recargar ficha",exact:true}).click();
    await expect(page.getByPlaceholder("Motivo del traslado")).toHaveValue("");
    await page.getByRole("button", { name: "Revocar vínculo", exact: true }).click();
    await expect(pair.getByText("Vínculo revocado", { exact: true })).toBeVisible();
  } finally { await mobileContext.close(); }
});

test("reutiliza STU recibido y registra atributos completos de cargador suelto",async({page})=>{
 const location=await command("location",{code:`ATTR-${randomUUID().slice(0,7).toUpperCase()}`,name:"Atributos sintéticos"});
 const product=await json("/rest/v1/products","POST",{title:"TEST recepción compra existente",price:700000});
 const existing=await json("/rest/v1/rpc/erp_receive_product_unit","POST",{p_product_id:product[0].id,p_serial_number:null,p_acquisition_cost_cop:200000,p_battery_health_percent:null,p_storage_health_percent:null,p_spec_overrides:{},p_notes:"Unidad sintética existente"},token);
 const labels=await command("qr_batch",{count:1});await login(page);
 await page.getByLabel("Código QR",{exact:true}).fill(labels.labels[0].code);await page.getByRole("button",{name:"Abrir QR",exact:true}).click();
 await page.getByLabel("STU de unidad ya recibida en Compras (opcional)",{exact:true}).fill(existing[0].unit_code);
 await page.getByLabel(/^Ubicación física/).selectOption(location.id);
 await page.getByRole("button",{name:"Registrar y asignar QR",exact:true}).click();
 await expect(page).toHaveURL(new RegExp(`unit=${existing[0].unit_id}`));
 await page.getByRole("tab",{name:/Fase 2/}).click();
 await page.getByText("Configuración actual verificada (independiente de la recepción)",{exact:true}).click();
 await page.getByLabel("Interfaz de almacenamiento compatible SATA",{exact:true}).check();
 await page.getByLabel("Interfaz de almacenamiento compatible NVMe",{exact:true}).check();
 await page.getByLabel("Voltaje de cargador compatible verificado",{exact:true}).fill("19.5");
 await page.getByLabel("Conector de cargador compatible verificado",{exact:true}).fill("TEST-5.5x2.5");
 await page.getByPlaceholder("Cómo se verificó / motivo",{exact:true}).fill("Atributos confirmados sintéticamente para verificar persistencia UI");
 await page.getByRole("button",{name:"Guardar configuración verificada",exact:true}).click();
 await expect(page.locator('p[role="alert"]')).toHaveCount(0);
 await page.getByRole("tab",{name:/Fase 1/}).click();
 await page.getByText("Registrar repuesto suelto",{exact:true}).click();
 await page.getByLabel("Tipo repuesto").selectOption("charger");
 const connector="TEST-"+randomUUID().slice(0,8);await page.getByPlaceholder("Conector",{exact:true}).fill(connector);
 await page.getByLabel("Voltaje V del cargador").fill("19.5");
 await page.getByLabel("Corriente A del cargador").fill("3.33");
 await page.getByLabel("Potencia W del cargador").fill("65");
 await page.getByLabel("Ubicación repuesto").selectOption(location.id);
 await page.getByRole("button",{name:"Registrar repuesto",exact:true}).click();
 await expect.poll(async()=>{const result=await json("/rest/v1/rpc/erp_workshop_components","POST",{p_query:connector,p_offset:0},token);return result.items.some((c:{component_attributes:{voltage:number;current:number;watts:number}})=>c.component_attributes.voltage===19.5&&c.component_attributes.current===3.33&&c.component_attributes.watts===65);}).toBe(true);
 const server=await json("/rest/v1/rpc/erp_workshop_read","POST",{p_unit_id:existing[0].unit_id},token);
 expect(server.unit.acquisition_cost_cop).toBe(200000);expect(server.receipts[0].snapshot.unitCode).toBe(existing[0].unit_code);
 expect(server.unit.spec_overrides.storageInterfaces).toEqual(["SATA","NVMe"]);expect(server.unit.spec_overrides.chargerVoltage).toBe(19.5);expect(server.unit.spec_overrides.chargerConnector).toBe("TEST-5.5x2.5");
});

test("recepción persistida: controles incompletos impiden disponibilidad y retiro es idempotente", async ({ page }) => {
  test.setTimeout(90000);
  const location = await command("location", { code: `E2E-${randomUUID().slice(0, 7).toUpperCase()}`, name: "Banco técnico E2E" });
  const batch = await command("qr_batch", { count: 1 });
  const received = await command("receive", { qrCode: batch.labels[0].code, locationId: location.id, condition: "good", snapshot: { physical: "unknown", screenType: "unknown", powersOn: "unchecked", video: "unchecked", chargerReceived: "unchecked", components: [{ kind: "ram", capacityGb: 1 }] } });
  await login(page);
  await page.goto(`${appUrl}/admin/taller?unit=${received.unitId}`);
  await expect(page.getByText("RAM actual: 1 GB", { exact: true })).toBeVisible();
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("tab", { name: /Fase 2/ }).click();
  await page.getByLabel("Fase de trabajo").selectOption("ready");
  await page.getByRole("button", { name: "Cambiar fase", exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("Asocie primero el producto");
  const remove = page.locator("form").filter({ has: page.getByRole("button", { name: "Retirar", exact: true }) });
  await remove.getByLabel("Destino componente").selectOption(location.id);
  await remove.getByLabel("Estado componente retirado").selectOption("functional");
  await remove.getByPlaceholder("Motivo de retiro").fill("Sustitución de prueba E2E");
  await remove.getByRole("button", { name: "Retirar", exact: true }).click();
  await expect(page.getByText("RAM actual: 0 GB", { exact: true })).toBeVisible();
  const server = await json("/rest/v1/rpc/erp_workshop_read", "POST", { p_unit_id: received.unitId }, token);
  expect(server.receipts[0].snapshot.components[0].capacityGb).toBe(1);
  expect(server.events.filter((e: { event_type: string }) => e.event_type === "component_move")).toHaveLength(1);
});

test("regresión ERP: inventario y rentabilidad admiten unidad sin producto comercial", async ({ page }) => {
  test.setTimeout(90000);
  const location = await command("location", { code: `REG-${randomUUID().slice(0, 7).toUpperCase()}`, name: "Recepción desconocida E2E" });
  const batch = await command("qr_batch", { count: 1 });
  const received = await command("receive", { qrCode: batch.labels[0].code, locationId: location.id, condition: "fair", costCop: "250000", snapshot: { physical: "unknown", screenType: "unknown", powersOn: "unchecked", video: "unchecked", chargerReceived: "unchecked", components: [] } });
  await login(page);
  await page.goto(`${appUrl}/admin/inventario`);
  await expect(page.getByText("Sin producto comercial asociado", { exact: true }).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(received.unitCode, { exact: true }).first()).toBeVisible();
  await page.goto(`${appUrl}/admin/rentabilidad/unidad/${received.unitId}`);
  await expect(page.getByRole("heading", { name: received.unitCode, exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Unidad no encontrada.", { exact: true })).toHaveCount(0);
});

test("Fase 3: sin unidad pide el STU y un producto nuevo se crea sin imágenes y queda seleccionado", async ({ page }) => {
  test.setTimeout(90000);
  const location = await command("location", { code: `F3-${randomUUID().slice(0, 7).toUpperCase()}`, name: "Fase 3 E2E" });
  const batch = await command("qr_batch", { count: 1 });
  const received = await command("receive", { qrCode: batch.labels[0].code, locationId: location.id, condition: "good", snapshot: { physical: "unknown", screenType: "unknown", powersOn: "unchecked", video: "unchecked", chargerReceived: "unchecked", components: [{ kind: "ram", capacityGb: 1 }] } });
  await login(page);
  await page.getByRole("tab", { name: /Fase 3/ }).click();
  await page.getByLabel("STU de la unidad", { exact: true }).fill(received.unitCode);
  await page.getByRole("button", { name: "Abrir unidad", exact: true }).click();
  await expect(page.getByText("Unidad:", { exact: false }).first()).toBeVisible({ timeout: 20000 });
  const model = `Modelo ${randomUUID().slice(0, 6)}`;
  await page.getByText(/¿No está registrado\? Crear producto/).click();
  await page.getByLabel("Marca del producto nuevo", { exact: true }).fill("MarcaE2E");
  await page.getByLabel("Modelo del producto nuevo", { exact: true }).fill(model);
  await page.getByRole("button", { name: "Crear producto y seleccionarlo", exact: true }).click();
  await expect(page.getByText(/Las imágenes quedan pendientes/).first()).toBeVisible({ timeout: 20000 });
  const row = await json(`/rest/v1/products?title=eq.${encodeURIComponent(`MarcaE2E ${model}`)}&select=id,visible_web,images`, "GET", undefined, token);
  expect(row).toHaveLength(1);
  expect(row[0].visible_web).toBe(false);
  expect(row[0].images).toEqual([]);
});

test("Fase 2: copiar la configuración verificada de un equipo igual y aplicarla a otros STU", async ({ page }) => {
  test.setTimeout(90000);
  const location = await command("location", { code: `CP-${randomUUID().slice(0, 7).toUpperCase()}`, name: "Copia configuración E2E" });
  const snapshot = { physical: "unknown", screenType: "unknown", powersOn: "unchecked", video: "unchecked", chargerReceived: "unchecked", components: [{ kind: "ram", capacityGb: 1 }] };
  const batch = await command("qr_batch", { count: 3 });
  const [a, b, c] = await Promise.all(batch.labels.map((l: { code: string }) => command("receive", { qrCode: l.code, locationId: location.id, condition: "good", snapshot })));
  const cpu = `CPU E2E ${randomUUID().slice(0, 5)}`;
  const base = await json("/rest/v1/rpc/erp_workshop_read", "POST", { p_unit_id: a.unitId }, token);
  await command("configuration", { unitId: a.unitId, version: base.unit.row_version, configuration: { cpu, screen: "14 HD", ramGeneration: "DDR3", ramFormFactor: "SO-DIMM", storageInterfaces: ["SATA"], chargerVoltage: 19.5, chargerConnector: "4.5x3.0" }, reason: "Base para copiar E2E" });
  await login(page);
  await page.goto(`${appUrl}/admin/taller?unit=${b.unitId}`);
  await page.getByRole("tab", { name: /Fase 2/ }).click();
  await page.getByText("Configuración actual verificada (independiente de la recepción)", { exact: true }).click();
  await page.getByLabel("Copiar de otro equipo", { exact: true }).selectOption({ label: `${a.unitCode} · ${cpu}` });
  await expect(page.getByPlaceholder("CPU verificada")).toHaveValue(cpu);
  await expect(page.getByLabel("Interfaz de almacenamiento compatible SATA", { exact: true })).toBeChecked();
  await page.getByPlaceholder("Cómo se verificó / motivo", { exact: true }).fill("Mismo modelo que el equipo base");
  await page.getByPlaceholder("STU-000127, STU-000128, STU-000129").fill(c.unitCode);
  page.once("dialog", d => d.accept());
  await page.getByRole("button", { name: "Aplicar a esos STU", exact: true }).click();
  await expect(page.getByText(/1 actualizado\(s\)/)).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Guardar configuración verificada", exact: true }).click();
  await expect(async () => {
    const sb = await json("/rest/v1/rpc/erp_workshop_read", "POST", { p_unit_id: b.unitId }, token);
    const sc = await json("/rest/v1/rpc/erp_workshop_read", "POST", { p_unit_id: c.unitId }, token);
    expect(sb.unit.spec_overrides.cpu).toBe(cpu);
    expect(sc.unit.spec_overrides.cpu).toBe(cpu);
    expect(sc.unit.spec_overrides.chargerVoltage).toBe(19.5);
  }).toPass({ timeout: 20000 });
});

test("Reimprimir etiquetas de unidades ya registradas: PDF con el mismo STU y rechazo de STU inexistentes", async ({ page }) => {
  test.setTimeout(90000);
  const location = await command("location", { code: `RP-${randomUUID().slice(0, 7).toUpperCase()}`, name: "Reimpresión E2E" });
  const batch = await command("qr_batch", { count: 1 });
  const received = await command("receive", { qrCode: batch.labels[0].code, locationId: location.id, condition: "good", snapshot: { physical: "unknown", screenType: "unknown", powersOn: "unchecked", video: "unchecked", chargerReceived: "unchecked", components: [] } });
  await login(page);
  await page.getByText("Preparar taller: etiquetas QR y ubicaciones", { exact: true }).click();
  await page.locator("summary").filter({ hasText: "Reimprimir etiquetas de equipos ya registrados" }).click();
  await page.getByLabel(/STU a reimprimir/).fill("STU-999999999");
  await page.getByRole("button", { name: "Ver PDF para reimprimir" }).click();
  await expect(page.getByText(/No existe ninguna unidad registrada/)).toBeVisible();
  await page.getByLabel(/STU a reimprimir/).fill(received.unitCode.toLowerCase());
  await page.getByRole("button", { name: "Ver PDF para reimprimir" }).click();
  await expect(page.getByTitle("Vista previa de etiquetas")).toBeVisible();
  await expect(page.locator("p").filter({ hasText: new RegExp(`1 etiquetas · ${received.unitCode}`) }).first()).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Descargar PDF" }).click()]);
  expect(readFileSync((await download.path())!).subarray(0, 5).toString()).toBe("%PDF-");
});
