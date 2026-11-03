import { test, expect } from "@playwright/test";
import { createOperator, login } from "./helpers";

test("Entrada única: Recibir computador y Nueva compra ya no existen, todo equipo entra por Taller", async ({ page }) => {
  test.setTimeout(90000);
  const admin = await createOperator("admin");
  await login(page, admin);

  await page.goto("/admin/inventario/recibir");
  await expect(page).toHaveURL(/\/admin\/taller$/);

  await page.goto("/admin/compras/nueva");
  await expect(page).toHaveURL(/\/admin\/taller$/);

  await page.goto("/admin/inventario");
  await expect(page.getByRole("link", { name: "Recibir en Taller" })).toHaveAttribute("href", "/admin/taller");
  await expect(page.getByText("+ Recibir computador")).toHaveCount(0);

  await page.goto("/admin/compras");
  await expect(page.getByRole("heading", { name: "Historial de compras" })).toBeVisible();
  await expect(page.getByText("+ Recibir compra")).toHaveCount(0);
});
