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
