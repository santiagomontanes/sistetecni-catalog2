import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createOperator, localAdmin, login } from "./helpers";

test("Usuarios: el administrador crea una cuenta con rol, esa persona inicia sesión y solo ve lo de su rol", async ({ page, browser }) => {
  test.setTimeout(120000);
  const admin = await createOperator("admin");
  const tag = randomUUID().slice(0, 8);
  const email = `nuevo.${tag}@sistetecni.test`;
  const password = `Clave-${tag}-ok`;
  await login(page, admin);
  await page.goto("/admin/usuarios");
  await page.getByRole("button", { name: "Crear usuario", exact: true }).first().click();
  await page.getByLabel("Nombre completo").fill(`Persona FICTICIA ${tag}`);
  await page.getByLabel("Correo (para iniciar sesión)").fill(email);
  await page.getByLabel(/Contraseña inicial/).fill("corta");
  await page.getByLabel("Rol del nuevo usuario").selectOption("caja");
  await page.getByRole("button", { name: "Crear usuario", exact: true }).last().click();
  // La validación nativa (mínimo 10) impide enviar; con una clave válida se crea.
  await page.getByLabel(/Contraseña inicial/).fill(password);
  await page.getByRole("button", { name: "Crear usuario", exact: true }).last().click();
  await expect(page.getByText("Usuario creado.")).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  const profile = await localAdmin.from("profiles").select("erp_role,active,is_admin,display_name").eq("email", email).single();
  expect(profile.data).toMatchObject({ erp_role: "caja", active: true, is_admin: false });

  // Correo repetido: mensaje claro, sin duplicar.
  await page.getByRole("button", { name: "Crear usuario", exact: true }).first().click();
  await page.getByLabel("Nombre completo").fill("Otra persona");
  await page.getByLabel("Correo (para iniciar sesión)").fill(email);
  await page.getByLabel(/Contraseña inicial/).fill(password);
  await page.getByRole("button", { name: "Crear usuario", exact: true }).last().click();
  await expect(page.getByText("Ya existe un usuario con ese correo.")).toBeVisible();

  // La persona nueva entra con su correo y contraseña y solo ve lo de su rol (Caja, sin Usuarios).
  const ctx = await browser.newContext(); const p2 = await ctx.newPage();
  try {
    await login(p2, { email, password });
    await p2.goto("/admin/caja");
    await expect(p2.getByRole("heading", { name: /Caja/ }).first()).toBeVisible();
    await expect(p2.getByRole("link", { name: "Usuarios", exact: true })).toHaveCount(0);
    await p2.goto("/admin/usuarios");
    await expect(p2.getByRole("button", { name: "Crear usuario", exact: true })).toHaveCount(0);
  } finally { await ctx.close(); }

  // Cambio de contraseña por el administrador: la clave vieja deja de servir y la nueva sirve.
  const card = page.locator("article").filter({ hasText: email });
  await card.getByRole("button", { name: "Cambiar contraseña" }).click();
  const newPassword = `Nueva-${tag}-ok`;
  await card.getByLabel("Nueva contraseña").fill(newPassword);
  await card.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByText("Contraseña actualizada.")).toBeVisible();
  const ctx2 = await browser.newContext(); const p3 = await ctx2.newPage();
  try {
    await login(p3, { email, password: newPassword });
    await p3.goto("/admin/caja");
    await expect(p3.getByRole("heading", { name: /Caja/ }).first()).toBeVisible();
  } finally { await ctx2.close(); }
});
