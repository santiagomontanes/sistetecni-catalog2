import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuoteWhatsAppMessage, buildWhatsAppUrl } from "./whatsappMessage";

// "mensaje de WhatsApp contiene código correcto" (punto 20)
test("buildQuoteWhatsAppMessage: contiene el código exacto de la cotización", () => {
  const message = buildQuoteWhatsAppMessage("COT-ABCDEFGHJ", 800000);
  assert.ok(message.includes("COT-ABCDEFGHJ"));
});

test("buildQuoteWhatsAppMessage: incluye el precio formateado cuando existe", () => {
  const message = buildQuoteWhatsAppMessage("COT-ABCDEFGHJ", 800000);
  assert.ok(message.includes("800.000"));
});

test("buildQuoteWhatsAppMessage: cotización especial (finalPrice null) -> sin línea de precio, sin 'null' ni 'undefined' en el texto", () => {
  const message = buildQuoteWhatsAppMessage("COT-ZZZZZZZZZ", null);
  assert.ok(message.includes("COT-ZZZZZZZZZ"));
  assert.ok(!message.toLowerCase().includes("null"));
  assert.ok(!message.toLowerCase().includes("undefined"));
});

test("buildWhatsAppUrl: usa wa.me con el mensaje codificado y solo dígitos del teléfono", () => {
  const url = buildWhatsAppUrl("+57 320 221 0698", "Hola, código COT-ABCDEFGHJ");
  assert.ok(url.startsWith("https://wa.me/573202210698?text="));
  assert.ok(url.includes(encodeURIComponent("COT-ABCDEFGHJ")));
});

test("buildWhatsAppUrl: el código de la cotización sobrevive intacto al round-trip de codificación de URL", () => {
  const message = buildQuoteWhatsAppMessage("COT-ABCDEFGHJ", 620000);
  const url = buildWhatsAppUrl("3202210698", message);
  const decoded = decodeURIComponent(url.split("?text=")[1]);
  assert.ok(decoded.includes("COT-ABCDEFGHJ"));
});
