import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { buildLabelsPdf, cleanCaption, CAPTION_MAX } from "./labelsPdf";
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
test("etiqueta de RAM: hoja carta, 1 cm de alto y muchas por hoja", async () => {
  const codes = Array.from({ length: 120 }, (_, i) => `STU-${String(83 + i).padStart(6, "0")}`);
  const doc = await PDFDocument.load(await buildLabelsPdf(codes, "ram", "RAM"));
  const { width, height } = doc.getPage(0).getSize();
  assert.ok(Math.abs(width - 21.59 * 28.3465) < 1 && Math.abs(height - 27.94 * 28.3465) < 1, "hoja carta");
  assert.equal(doc.getPageCount(), 1, "120 etiquetas de 1 cm caben en una carta");
});
test("etiquetas libres: medida, disposición y texto a elección; rechaza medidas fuera de rango", async () => {
  const codes = Array.from({ length: 40 }, (_, i) => `STU-${String(1 + i).padStart(6, "0")}`);
  for (const spec of [
    { layout: "square", qrCm: 2, caption: "Disco" },
    { layout: "strip", qrCm: 1.5, caption: "Cargador" },
    { layout: "strip", qrCm: 8 },
    { layout: "square", qrCm: 3, caption: "Ñandú ✓ 😀 " + "x".repeat(40) },
  ] as const) {
    const bytes = await buildLabelsPdf(codes, spec, "Libre");
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  }
  assert.equal(cleanCaption("  Ratón ✓ 😀  grande  "), "Ratón grande");
  assert.equal(cleanCaption("x".repeat(60)).length, CAPTION_MAX);
  const piece = await PDFDocument.load(await buildLabelsPdf(codes, "piece", "Pieza"));
  assert.equal(piece.getPageCount(), 1, "40 etiquetas de pieza caben en una carta");
  await assert.rejects(buildLabelsPdf(codes, { layout: "square", qrCm: 0.2 }, "x"), /labels_bad_size/);
  await assert.rejects(buildLabelsPdf(codes, { layout: "square", qrCm: 20 }, "x"), /labels_bad_size/);
});
