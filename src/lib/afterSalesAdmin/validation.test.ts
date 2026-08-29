import { test } from "node:test";
import assert from "node:assert/strict";
import { openAfterSalesCaseSchema, progressAfterSalesCaseSchema } from "./validation";

const SALE_ITEM_ID = "11111111-1111-1111-1111-111111111111";
const CASE_ID = "22222222-2222-2222-2222-222222222222";

test("openAfterSalesCaseSchema: acepta garantía válida", () => {
  assert.equal(openAfterSalesCaseSchema.safeParse({
    saleItemId: SALE_ITEM_ID,
    caseType: "warranty",
    reportedIssue: "El equipo no carga batería.",
    intakeCondition: "Sin golpes visibles.",
    evidenceUrls: ["https://example.com/evidence.jpg"],
  }).success, true);
});

test("openAfterSalesCaseSchema: rechaza motivo vacío y campos extra", () => {
  assert.equal(openAfterSalesCaseSchema.safeParse({ saleItemId: SALE_ITEM_ID, caseType: "warranty", reportedIssue: "x" }).success, false);
  assert.equal(openAfterSalesCaseSchema.safeParse({ saleItemId: SALE_ITEM_ID, caseType: "return", reportedIssue: "Devolución solicitada", fake: true }).success, false);
});

test("progressAfterSalesCaseSchema: enviar a reparación exige diagnóstico", () => {
  assert.equal(progressAfterSalesCaseSchema.safeParse({ caseId: CASE_ID, action: "send_repair" }).success, false);
  assert.equal(progressAfterSalesCaseSchema.safeParse({ caseId: CASE_ID, action: "send_repair", diagnosis: "SSD con fallas SMART", costCop: 80000 }).success, true);
});

test("progressAfterSalesCaseSchema: cierre/cancelación exige nota", () => {
  assert.equal(progressAfterSalesCaseSchema.safeParse({ caseId: CASE_ID, action: "close_returned" }).success, false);
  assert.equal(progressAfterSalesCaseSchema.safeParse({ caseId: CASE_ID, action: "close_retired", note: "Equipo retirado por daño de board" }).success, true);
  assert.equal(progressAfterSalesCaseSchema.safeParse({ caseId: CASE_ID, action: "cancel", note: "Ingreso registrado por error" }).success, true);
});

test("progressAfterSalesCaseSchema: costo debe ser COP entero no negativo", () => {
  assert.equal(progressAfterSalesCaseSchema.safeParse({ caseId: CASE_ID, action: "start_diagnosis", costCop: -1 }).success, false);
  assert.equal(progressAfterSalesCaseSchema.safeParse({ caseId: CASE_ID, action: "start_diagnosis", costCop: 1000.5 }).success, false);
});
