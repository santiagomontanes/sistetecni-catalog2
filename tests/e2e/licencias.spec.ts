import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createOperator, localAdmin, login, rpc } from "./helpers";

const lic = (client: Parameters<typeof rpc>[0], action: string, args: Record<string, unknown>, id: string | null = randomUUID()) => rpc(client, "erp_license_command", { p_action: action, p_arguments: args, p_request_id: id });

test("Licencias: alta, pago con asiento único en Caja, reverso ligado y permisos por rol", async ({ page }) => {
  test.setTimeout(120000);
  const admin = await createOperator("admin"); const vendedor = await createOperator("vendedor"); const caja = await createOperator("caja"); const tecnico = await createOperator("tecnico");
  const name = `Cliente FICTICIO licencia ${randomUUID().slice(0, 6)}`;
  const customer = await localAdmin.from("customers").insert({ full_name: name, phone: "3000000000" }).select("id").single();
  if (customer.error) throw customer.error;
  page.on("dialog", d => void (d.type() === "prompt" ? d.accept("Pago duplicado E2E") : d.accept()));
  await login(page, admin);
  await page.goto("/admin/licencias");
  await expect(page.getByRole("heading", { name: "Licencias de software" })).toBeVisible();
  await page.getByRole("button", { name: "Nueva licencia" }).click();
  await page.getByLabel("Buscar cliente").fill(name.slice(0, 22));
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page.getByLabel("Software", { exact: true }).fill("Office E2E");
  await page.getByLabel(/Licencia \/ clave/).fill("AAAA-BBBB-CCCC");
  await page.getByLabel(/Valor por mes/).fill("50000");
  await page.getByLabel("Fecha de inicio").fill("2026-01-01");
  await page.getByRole("button", { name: "Crear licencia" }).click();
  await expect(page.getByText("Licencia creada.")).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`Office E2E.*${name}`) }).click();
  await expect(page.getByRole("button", { name: "Ver clave de licencia" })).toBeVisible();
  await page.getByRole("button", { name: "Ver clave de licencia" }).click();
  await expect(page.getByText("AAAA-BBBB-CCCC")).toBeVisible();
  // Pago de 2 meses: un asiento en Caja y la licencia queda pagada hasta el fin del período.
  await page.getByLabel("Periodos pagados").fill("2");
  await expect(page.getByLabel("Valor recibido")).toHaveValue("100000");
  await page.getByLabel("Fecha del pago").fill(new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10));
  await page.getByLabel("Referencia del pago").fill("REF-LIC-E2E");
  await page.getByRole("button", { name: "Registrar pago", exact: true }).click();
  await expect(page.getByText("Pago registrado y asentado en Caja.")).toBeVisible();
  await expect(page.getByText(/Pagada hasta: 2026-02-28/)).toBeVisible();
  const row = await localAdmin.from("software_licenses").select("id,paid_until,license_number,version").eq("customer_id", customer.data.id).single();
  expect(row.data?.paid_until).toBe("2026-02-28");
  const pays = await localAdmin.from("software_license_payments").select("id,amount_cop,cash_movement_id").eq("license_id", row.data!.id);
  expect(pays.data).toHaveLength(1);
  const mov = await localAdmin.from("cash_movements").select("amount_cop,movement_type,description,metadata").eq("id", pays.data![0].cash_movement_id).single();
  expect(mov.data).toMatchObject({ amount_cop: 100000, movement_type: "manual_in" });
  expect(mov.data!.description).toContain(row.data!.license_number); expect(mov.data!.metadata).toMatchObject({ kind: "software_license" });
  // Caja muestra el origen y el resumen por origen.
  await page.goto("/admin/caja");
  await expect(page.getByText(/Licencias de software · \d+/)).toBeVisible();
  // El reverso genérico de Caja está bloqueado; se hace desde Licencias y no duplica.
  await expect(rpc(admin.client, "erp_reverse_cash_movement", { p_movement_id: pays.data![0].cash_movement_id, p_reason: "intento directo" })).rejects.toThrow(/license_reverse_through_license/);
  await page.goto("/admin/licencias");
  await page.getByRole("button", { name: new RegExp(`Office E2E.*${name}`) }).click();
  await page.getByRole("button", { name: "Reversar pago" }).click();
  await expect(page.getByText("Pago reversado en Caja.")).toBeVisible();
  const after = await localAdmin.from("software_licenses").select("paid_until").eq("id", row.data!.id).single();
  expect(after.data?.paid_until).toBeNull();
  const net = await localAdmin.from("cash_movements").select("amount_cop").or(`id.eq.${pays.data![0].cash_movement_id},reversal_of_id.eq.${pays.data![0].cash_movement_id}`);
  expect(net.data!.reduce((s, m) => s + Number(m.amount_cop), 0)).toBe(0);
  // Roles: el vendedor crea pero no cobra; caja cobra pero no crea; el técnico no ve nada.
  const lid = row.data!.id;
  await expect(lic(vendedor.client, "payment", { id: lid, amountCop: "1000", method: "efectivo" })).rejects.toThrow();
  await expect(lic(caja.client, "create", { customerId: customer.data.id, software: "X", plan: "monthly", priceCop: "1" })).rejects.toThrow();
  await expect(lic(tecnico.client, "list", {}, null)).rejects.toThrow();
  const sold = await lic(vendedor.client, "create", { customerId: customer.data.id, software: "Antivirus E2E", plan: "one_time", priceCop: "80000" });
  expect(sold.state).toBe("pending_payment");
  // Pago único: idempotente, parcial y sin sobrepago.
  const key = randomUUID(); const args = { id: sold.id, amountCop: "30000", method: "efectivo" };
  const first = await lic(caja.client, "payment", args, key); const again = await lic(caja.client, "payment", args, key);
  expect(again.paymentId).toBe(first.paymentId);
  expect((await localAdmin.from("cash_movements").select("id").eq("metadata->>paymentId", first.paymentId)).data).toHaveLength(1);
  await expect(lic(caja.client, "payment", { id: sold.id, amountCop: "60000", method: "efectivo" })).rejects.toThrow(/license_payment_exceeds_balance/);
  const done = await lic(caja.client, "payment", { id: sold.id, amountCop: "50000", method: "transferencia" });
  expect(done.license.state).toBe("paid");
});
