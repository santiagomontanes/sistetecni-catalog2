import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { buildLabelsPdf } from "./labelsPdf";
import { suggestLocationCode } from "./locations";
test("PDF de etiquetas: una página por grilla y un QR por STU", async () => {
  const codes = Array.from({ length: 30 }, (_, i) => `STU-${String(126 + i).padStart(6, "0")}`);
  const bytes = await buildLabelsPdf(codes, "large", "Lote de prueba");
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  const small = await PDFDocument.load(await buildLabelsPdf(codes.slice(0, 1), "small", "Lote"));
  assert.equal(small.getPageCount(), 1);
  assert.ok((await PDFDocument.load(bytes)).getPageCount() > 1, "5 cm: 30 etiquetas no caben en una hoja A4");
  await assert.rejects(buildLabelsPdf([], "small", "vacío"), /labels_empty/);
});
test("código de ubicación sugerido: sin tildes, único y válido para la BD", () => {
  assert.equal(suggestLocationCode("Estante A · nivel 2", []), "ESTANTE-A-NIVEL-2");
  assert.equal(suggestLocationCode("Bodega", ["BODEGA"]), "BODEGA-2");
  assert.equal(suggestLocationCode("Estética", ["ESTETICA", "ESTETICA-2"]), "ESTETICA-3");
  assert.match(suggestLocationCode("¡¡??", []), /^[A-Z0-9_-]{1,32}$/);
  assert.match(suggestLocationCode("x".repeat(100), []), /^[A-Z0-9_-]{1,32}$/);
});
import { findLocation, locationChoices, locationPath, planLocation } from "./locations";
const L = (id: string, name: string, parent: string | null = null, active = true) => ({ id, code: name.toUpperCase().replace(/\W+/g, "-"), name, active, parent_id: parent });
test("ubicaciones: ruta legible, reutiliza la ubicación y crea la sub-posición dentro", () => {
  const locs = [L("a", "Mueble A"), L("a1", "Estante 1", "a"), L("b", "Bodega")];
  assert.equal(locationPath(locs, "a1"), "Mueble A › Estante 1");
  assert.deepEqual(locationChoices(locs).map(c => c.path), ["Bodega", "Mueble A", "Mueble A › Estante 1"]);
  assert.equal(findLocation(locs, "mueble a > estante 1")?.id, "a1");
  assert.equal(findLocation(locs, "MUEBLE   Á")?.id, "a");
  // Ubicación existente + sub-posición nueva: un solo paso, dentro de «Mueble A».
  const plan = planLocation(locs, "mueble a", "Estante 2");
  assert.equal(plan.steps.length, 1); assert.equal(plan.label, "Mueble A › Estante 2");
  assert.equal((plan.steps[0] as { parentId?: string }).parentId, "a");
  // Todo nuevo: crea «Mueble B» y luego «Estante 1» dentro de ese paso.
  const fresh = planLocation(locs, "Mueble B", "Estante 1");
  assert.equal(fresh.steps.length, 2); assert.equal((fresh.steps[1] as { parentStep?: number }).parentStep, 0);
  // Sin sub-posición: sólo la ubicación; duplicados se rechazan.
  assert.equal(planLocation(locs, "Escritorio", "").steps.length, 1);
  assert.match(planLocation(locs, "Mueble A", "").error ?? "", /ya existe/);
  assert.match(planLocation(locs, "Mueble A", "estante 1").error ?? "", /ya existe/);
  // Una sub-posición también puede ser la base de otra más profunda.
  const deep = planLocation(locs, "Mueble A › Estante 1", "Caja 3");
  assert.equal((deep.steps[0] as { parentId?: string }).parentId, "a1");
  assert.equal(deep.label, "Mueble A › Estante 1 › Caja 3");
});
