import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createOperator, localAdmin, login } from "./helpers";

async function sellable(operator: Awaited<ReturnType<typeof createOperator>>, price: number) {
  const tag = randomUUID().slice(0, 6).toUpperCase();
  const product = await operator.client.from("products").insert({ title: `Equipo FICTICIO reservas ${tag}`, price, erp_stock_enabled: true }).select("id").single();
  if (product.error) throw product.error;
  const unit = await operator.client.from("product_units").insert({ product_id: product.data.id, unit_code: `RSV-${tag}-${randomUUID().slice(0, 4)}`, status: "available", acquisition_cost_cop: 100000 }).select("id,unit_code").single();
  if (unit.error) throw unit.error;
  return { tag, productId: product.data.id as string, unitId: unit.data.id as string, code: unit.data.unit_code as string };
}

test("reservar un equipo para un cliente y confirmar la venta genera la venta y su comprobante", async ({ page }) => {
  test.setTimeout(120000);
  const operator = await createOperator("admin");
  const eq = await sellable(operator, 850000);
  await login(page, operator);
  await page.goto("/admin/reservas");
  await page.getByLabel("Buscar equipo por STU").fill(eq.code);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByLabel("Equipo a reservar").selectOption(eq.unitId);
  await page.getByLabel("Nombre del cliente").fill("Cliente FICTICIO Reserva");
  await page.getByLabel("Celular del cliente").fill("3001112233");
  await page.getByRole("button", { name: "Reservar equipo" }).click();
  const card = page.locator("article").filter({ hasText: eq.code });
  await expect(card).toContainText("Cliente FICTICIO Reserva");
  expect((await localAdmin.from("product_units").select("status").eq("id", eq.unitId).single()).data?.status).toBe("reserved");
  // Confirmar la venta desde la reserva.
  await card.getByRole("button", { name: "Confirmar venta" }).click();
  await card.getByLabel("Documento del cliente").fill("1002003004");
  await card.getByLabel("Precio (COP)").fill("800000");
  await card.getByRole("button", { name: "Confirmar venta y generar comprobante" }).click();
  const confirmed = page.getByRole("status").filter({ hasText: /Venta .+ confirmada/ });
  await expect(confirmed).toContainText("Cliente FICTICIO Reserva");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Descargar comprobante" }).click()]);
  const bytes = readFileSync((await download.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  await expect(page.locator("article").filter({ hasText: eq.code })).toHaveCount(0);
  const unit = (await localAdmin.from("product_units").select("status").eq("id", eq.unitId).single()).data;
  expect(unit?.status).toBe("sold");
  const item = (await localAdmin.from("sale_items").select("sale_id,unit_price_cop").eq("product_unit_id", eq.unitId).single()).data!;
  expect(Number(item.unit_price_cop)).toBe(800000);
  const sale = (await localAdmin.from("sales").select("customer_name,customer_document,total_cop,sale_number").eq("id", item.sale_id).single()).data!;
  expect(sale.customer_name).toBe("Cliente FICTICIO Reserva"); expect(sale.customer_document).toBe("1002003004"); expect(Number(sale.total_cop)).toBe(800000);
});

test("una reserva se puede liberar con motivo y el equipo vuelve a estar disponible", async ({ page }) => {
  test.setTimeout(90000);
  const operator = await createOperator("admin");
  const eq = await sellable(operator, 500000);
  await login(page, operator);
  await page.goto("/admin/reservas");
  await page.getByLabel("Buscar equipo por STU").fill(eq.code);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByLabel("Equipo a reservar").selectOption(eq.unitId);
  await page.getByLabel("Nombre del cliente").fill("Cliente FICTICIO Libera");
  await page.getByLabel("Celular del cliente").fill("3009998877");
  await page.getByRole("button", { name: "Reservar equipo" }).click();
  const card = page.locator("article").filter({ hasText: eq.code });
  await expect(card).toBeVisible();
  page.once("dialog", d => void d.accept("El cliente desistió"));
  await card.getByRole("button", { name: "Liberar" }).click();
  await expect(page.locator("article").filter({ hasText: eq.code })).toHaveCount(0);
  expect((await localAdmin.from("product_units").select("status").eq("id", eq.unitId).single()).data?.status).toBe("available");
});
