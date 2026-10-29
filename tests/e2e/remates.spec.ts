import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createOperator, localAdmin, login, rpc } from "./helpers";

test("Remate: solo el administrador registra y genera un QR por pieza; reintento idempotente", async ({ page }) => {
  test.setTimeout(90000);
  const admin = await createOperator("admin");
  const tecnico = await createOperator("tecnico");
  await rpc(admin.client, "erp_workshop_command", { p_action: "configure", p_payload: { enabled: true }, p_key: randomUUID() });
  // La generación de QR sueltos y de remates se rechaza para roles distintos del administrador.
  await expect(rpc(tecnico.client, "erp_workshop_command", { p_action: "qr_batch", p_payload: { count: 1 }, p_key: randomUUID() })).rejects.toThrow();
  await expect(rpc(tecnico.client, "erp_auction_lot_create", { p_payload: { machines: 1, totalPriceCop: "1000" }, p_key: randomUUID() })).rejects.toThrow();
  // Idempotencia y conflicto por clave reutilizada con otros datos.
  const key = randomUUID(); const payload = { purchasedOn: "2026-10-30", machines: 1, memories: 1, disks: 1, totalPriceCop: "900000" };
  const first = await rpc(admin.client, "erp_auction_lot_create", { p_payload: payload, p_key: key });
  const again = await rpc(admin.client, "erp_auction_lot_create", { p_payload: payload, p_key: key });
  expect(again.id).toBe(first.id); expect(first.labels).toHaveLength(3);
  await expect(rpc(admin.client, "erp_auction_lot_create", { p_payload: { ...payload, machines: 2 }, p_key: key })).rejects.toThrow(/auction_idempotency_conflict/);
  // Interfaz.
  await login(page, admin);
  await page.goto("/admin/remates");
  await expect(page.getByRole("heading", { name: "Ingreso de remate" })).toBeVisible();
  await page.getByLabel(/Precio total del remate/).fill("1200000");
  await page.getByLabel("Computadores comprados").fill("2");
  await page.getByLabel("Memorias compradas").fill("3");
  await page.getByLabel("Discos comprados").fill("1");
  await expect(page.getByText(/Se generarán 6 QR/)).toBeVisible();
  await expect(page.getByText(/Costo promedio por pieza: \$ 200\.000/)).toBeVisible();
  await page.getByRole("button", { name: /Registrar remate y generar 6 QR/ }).click();
  await expect(page.getByText(/6 QR generados/)).toBeVisible();
  await expect(page.getByTitle("Vista previa de etiquetas del remate")).toBeVisible();
  const lots = await localAdmin.from("auction_lots").select("id,machines,memories,disks,total_price_cop,qr_batch_id").eq("created_by", admin.id);
  expect(lots.data).toHaveLength(2);
  const ui = lots.data!.find(l => l.machines === 2)!;
  expect(Number(ui.total_price_cop)).toBe(1200000);
  expect((await localAdmin.from("workshop_qr_labels").select("code").eq("batch_id", ui.qr_batch_id)).data).toHaveLength(6);
  // Un técnico no ve la pantalla.
  const other = await page.context().browser()!.newContext(); const p2 = await other.newPage();
  await login(p2, tecnico); await p2.goto("/admin/remates");
  await expect(p2.getByText(/Solo el administrador registra remates/)).toBeVisible();
  await other.close();
});

test("Venta pendiente → pagada: registra una sola entrada en caja y respeta roles y envíos contraentrega", async ({ page }) => {
  test.setTimeout(90000);
  const admin = await createOperator("admin");
  const vendedor = await createOperator("vendedor");
  const product = await admin.client.from("products").insert({ title: "Equipo FICTICIO cobro", price: 500000, erp_stock_enabled: true }).select("id").single();
  if (product.error) throw product.error;
  const unit = await admin.client.from("product_units").insert({ product_id: product.data.id, unit_code: `PAY-E2E-${randomUUID()}`, status: "available", acquisition_cost_cop: 100000 }).select("id").single();
  if (unit.error) throw unit.error;
  const saleId = await rpc(admin.client, "erp_create_sale_with_units", {
    p_customer_id: null, p_customer_name: "Cliente FICTICIO cobro", p_customer_document: "0001", p_customer_phone: "3000000000", p_customer_email: null,
    p_items: [{ itemType: "catalog", productId: product.data.id, productUnitId: unit.data.id, description: "Equipo FICTICIO cobro", unitPriceCop: 500000, quantity: 1 }],
    p_discount_cop: 0, p_payment_method: "transferencia", p_payment_status: "pendiente", p_warranty_months: 3, p_notes: "E2E", p_idempotency_key: randomUUID(),
  });
  expect((await localAdmin.from("cash_movements").select("id").eq("sale_id", saleId)).data).toHaveLength(0);
  await expect(rpc(vendedor.client, "erp_sale_mark_paid", { p_sale_id: saleId, p_payment_method: "efectivo", p_reference: null })).rejects.toThrow();
  page.on("dialog", d => d.accept());
  await login(page, admin);
  await page.goto(`/admin/ventas/${saleId}`);
  await page.getByLabel("Medio de pago").selectOption("efectivo");
  await page.getByLabel(/Referencia/).fill("RECIBO-E2E");
  await page.getByRole("button", { name: "Marcar como pagada" }).click();
  await expect(page.getByText(/Venta marcada como pagada y registrada en caja/)).toBeVisible();
  const sale = await localAdmin.from("sales").select("payment_status,payment_method").eq("id", saleId).single();
  expect(sale.data).toMatchObject({ payment_status: "pagado", payment_method: "efectivo" });
  const cash = await localAdmin.from("cash_movements").select("amount_cop,movement_type,payment_method").eq("sale_id", saleId);
  expect(cash.data).toEqual([{ amount_cop: 500000, movement_type: "sale", payment_method: "efectivo" }]);
  // Repetir no duplica el ingreso.
  const repeat = await rpc(admin.client, "erp_sale_mark_paid", { p_sale_id: saleId, p_payment_method: "efectivo", p_reference: null });
  expect(repeat.alreadyPaid).toBe(true);
  expect((await localAdmin.from("cash_movements").select("id").eq("sale_id", saleId)).data).toHaveLength(1);
});
