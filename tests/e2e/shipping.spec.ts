import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createOperator, localAdmin, login, rpc } from "./helpers";

test("envío web, guía, entrega y consignación persisten con Auth/PostgREST reales", async ({ page }) => {
  const operator = await createOperator("admin");
  const carrier = `Prueba E2E ${randomUUID().slice(0, 8)}`;
  const product = await operator.client.from("products").insert({ title: "Equipo FICTICIO E2E envíos", price: 700000, erp_stock_enabled: true }).select("id").single();
  if (product.error) throw product.error;
  const unit = await operator.client.from("product_units").insert({ product_id: product.data.id, unit_code: `SHIP-E2E-${randomUUID()}`, status: "available", acquisition_cost_cop: 40000 }).select("id").single();
  if (unit.error) throw unit.error;
  const saleId = await rpc(operator.client, "erp_create_sale_with_units", {
    p_customer_id: null, p_customer_name: "Cliente FICTICIO E2E", p_customer_document: "00000001", p_customer_phone: "3000000000", p_customer_email: null,
    p_items: [{ itemType: "catalog", productId: product.data.id, productUnitId: unit.data.id, quantity: 1, unitPriceCop: 700000 }],
    p_discount_cop: 0, p_payment_method: "transferencia", p_payment_status: "pendiente", p_warranty_months: 6, p_notes: "Sólo prueba local", p_idempotency_key: randomUUID(),
  });
  await rpc(operator.client, "erp_shipping_command", { p_action: "configure", p_arguments: { enabled: true }, p_request_id: randomUUID() });
  const sale = await localAdmin.from("sales").select("sale_number").eq("id", saleId).single();
  if (sale.error) throw sale.error;
  page.on("dialog", (dialog) => dialog.accept());
  await login(page, operator);
  await page.goto("/admin/envios");
  await page.getByRole("button", { name: "Nuevo envío", exact: true }).click();
  await page.getByLabel("Venta", { exact: true }).selectOption(saleId);
  await page.getByLabel("Ciudad", { exact: true }).fill("Ciudad FICTICIA");
  await page.getByLabel("Departamento", { exact: true }).fill("Departamento Prueba");
  await page.getByLabel("Dirección o sede de recogida").fill("Oficina de prueba local");
  await page.getByLabel("Transportadora", { exact: true }).fill(carrier);
  await page.getByRole("button", { name: "Crear envío", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(sale.data.sale_number) }).click();
  const guide = `000${Date.now()}`;
  await page.getByLabel("Guía (conserva ceros iniciales)").fill(guide);
  await page.getByLabel("Flete exacto COP").fill("30000");
  await page.getByLabel("Flete: responsable",{exact:true}).selectOption("sistetecni");
  await page.getByLabel("Flete: forma de pago",{exact:true}).selectOption("withheld");
  await page.getByRole("button", { name: "Registrar guía y flete" }).click();
  await page.getByRole("button", { name: "Registrar despacho", exact: true }).click();
  await expect(page.getByLabel("Fecha y hora de entrega (Bogotá)")).toBeVisible();
  // El campo registra segundos; avanzar un segundo evita truncar antes del despacho real.
  await page.waitForTimeout(1100);
  const bogotaDate = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 19);
  await page.getByLabel("Fecha y hora de entrega (Bogotá)").fill(bogotaDate);
  await page.getByLabel("Responsable/evidencia de entrega").fill("Constancia sintética E2E");
  await page.getByRole("button", { name: "Registrar entrega", exact: true }).click();
  await expect(page.getByText("Entregado · Recaudo: Pendiente", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Recaudos", exact: true }).click();
  await page.getByLabel("Importe de la consignación COP").fill("670000");
  await page.getByLabel("Transportadora (opcional)").fill(carrier);
  await page.getByRole("button", { name: "Buscar combinaciones exactas" }).click();
  await expect(page.getByText(/1 coincidencia\(s\) exacta\(s\)/)).toBeVisible();
  await expect(page.getByText(/Equivale probablemente a:.*SHIP-E2E/).first()).toBeVisible();
  await page.getByRole("button", { name: "Seleccionar para revisar" }).click();
  await page.getByLabel("Fecha de consignación").fill(new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10));
  await page.getByLabel("Cuenta receptora").fill("Cuenta FICTICIA E2E");
  const reference = `REF-${randomUUID()}`;
  await page.getByLabel("Referencia única de la consignación").fill(reference);
  await page.getByRole("button", { name: "Confirmar y registrar consignación" }).click();
  await expect(page.getByText(new RegExp(reference))).toBeVisible();
  await page.getByRole("button", { name: "Estadísticas", exact: true }).click();
  await expect(page.getByText("Cobro promedio de la transportadora por envío").first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Promedio que te llega por envío").first()).toBeVisible();
  const rows = await rpc(operator.client, "erp_shipping_command", { p_action: "list", p_arguments: { carrier }, p_request_id: null });
  expect(rows.items).toHaveLength(1);
  expect(rows.items[0]).toMatchObject({ guide, status: "delivered", collection_status: "reconciled", received_cop: "670000", balance_cop: "0" });
  const deposit = await localAdmin.from("erp_shipping_deposits").select("id,cash_movement_id").eq("reference", reference).single();
  if (deposit.error) throw deposit.error;
  const cash = await localAdmin.from("cash_movements").select("amount_cop,movement_type").eq("id", deposit.data.cash_movement_id).single();
  expect(cash.data).toMatchObject({ amount_cop: 670000, movement_type: "manual_in" });
});

test("API de envíos deniega usuario sin permisos y limita cuerpo real", async ({ request }) => {
  const viewer = await createOperator("viewer");
  const noAuth = await request.post("/api/admin/shipments", { data: { action: "list", arguments: {} } });
  expect(noAuth.status()).toBe(403);
  const forbidden = await request.post("/api/admin/shipments", { headers: { authorization: `Bearer ${viewer.token}` }, data: { action: "list", arguments: {} } });
  expect(forbidden.status()).toBe(403);
  const oversized = await request.post("/api/admin/shipments", { data: "x".repeat(32769), headers: { "content-type": "application/json" } });
  expect(oversized.status()).toBe(413);
});
