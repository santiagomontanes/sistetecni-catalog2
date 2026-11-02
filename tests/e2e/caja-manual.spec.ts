import { test, expect } from "@playwright/test";
import { createOperator, login } from "./helpers";

test("Caja: ingreso y egreso manual con un formulario, sin ventanas emergentes", async ({ page }) => {
  test.setTimeout(90000);
  const admin = await createOperator("admin");
  let dialogs = 0;
  page.on("dialog", d => { dialogs++; void d.dismiss(); });
  await login(page, admin);
  await page.goto("/admin/caja");
  const concept = `Almuerzo E2E ${Date.now()}`;
  await page.getByLabel("Valor (COP)").fill("12500");
  await page.getByLabel(/Concepto/).fill(concept);
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText(/Egreso de .*12\.500.* registrado/)).toBeVisible();
  await expect(page.getByRole("cell", { name: concept })).toBeVisible();
  await page.getByLabel("Ingreso").check();
  await page.getByLabel("Valor (COP)").fill("40000");
  await page.getByLabel(/Concepto/).fill(`Aporte E2E ${Date.now()}`);
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText(/Ingreso de .*40\.000.* registrado/)).toBeVisible();
  expect(dialogs).toBe(0);
});
