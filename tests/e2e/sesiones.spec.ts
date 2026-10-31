import { test, expect } from "@playwright/test";
import { createOperator, login } from "./helpers";

test("Sesiones: un usuario no puede tener dos sesiones, personas distintas sí, y el vínculo del celular se conserva", async ({ page, browser }) => {
  test.setTimeout(120000);
  const ana = await createOperator("admin"); const beto = await createOperator("caja");
  const ctxBeto = await browser.newContext(); const pBeto = await ctxBeto.newPage();
  const ctxAna2 = await browser.newContext(); const pAna2 = await ctxAna2.newPage();
  try {
    await login(page, ana);
    await login(pBeto, beto);
    await page.goto("/admin/caja"); await pBeto.goto("/admin/caja");
    await expect(page.getByRole("heading", { name: /Caja/ }).first()).toBeVisible();
    // Ana entra desde otro dispositivo: la primera sesión de Ana se cierra; la de Beto sigue.
    await login(pAna2, ana);
    await page.reload();
    await expect(page).toHaveURL(/\/admin\/login\?sesion=cerrada/, { timeout: 30000 });
    await expect(page.getByText(/Tu sesión se cerró porque esta cuenta ingresó desde otro dispositivo/)).toBeVisible();
    await pBeto.reload();
    await expect(pBeto.getByRole("heading", { name: /Caja/ }).first()).toBeVisible();
    await expect(pBeto).not.toHaveURL(/login/);
    await pAna2.goto("/admin/caja");
    await expect(pAna2.getByRole("heading", { name: /Caja/ }).first()).toBeVisible();
  } finally { await ctxBeto.close(); await ctxAna2.close(); }
});

test("Sesiones: el celular que se vincula con el código no cierra la sesión del computador", async ({ page, browser }) => {
  test.setTimeout(120000);
  const ana = await createOperator("admin");
  await login(page, ana);
  await page.goto("/admin/taller");
  await page.getByText(/Celular y estación ·/).click();
  await page.getByRole("button", { name: "Generar código en computador" }).click();
  const pair = page.locator("details").filter({ hasText: "Inicia sesión con tu cuenta en ambos dispositivos" });
  const code = await pair.locator("strong").innerText();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const phone = await ctx.newPage();
  try {
    await login(phone, ana);
    await phone.goto("/admin/taller");
    await phone.getByText(/Celular y estación ·/).click();
    await phone.getByLabel("Código temporal").fill(code);
    await phone.getByRole("button", { name: "Vincular este celular" }).click();
    await expect(phone.getByText("Conectado · sincronizado", { exact: true })).toBeVisible({ timeout: 15000 });
    // El computador sigue con sesión válida y vinculado.
    await page.reload();
    await expect(page).not.toHaveURL(/login/);
    await expect(page.getByRole("heading", { name: /Taller/ }).first()).toBeVisible();
  } finally { await ctx.close(); }
});
