import test from "node:test";
import assert from "node:assert/strict";
import { addBogotaBusinessDays, findCollectionMatches, moneyCop } from "./domain";
import { parseShippingCommand } from "./contracts";
import { readShippingBody, ShippingBodyTooLarge } from "./http";
const candidate = (id: string, amount: string) => ({ id, guide: `000${id}`, carrier: "Pruebas", balance_cop: amount, version: 1 });

test("moneda COP entera exacta, sin floats ni redondeos", () => {
  assert.equal(moneyCop("999999999999").toString(), "999999999999");
  for (const value of ["1.1", "1,000", "1e3", "-1", "NaN", "01", ""]) assert.throws(() => moneyCop(value));
});
test("coincidencia única, múltiple, ninguna y parcial ya descontado", () => {
  const rows = [candidate("a", "100"), candidate("b", "200"), candidate("c", "300")];
  assert.equal(findCollectionMatches(rows, "100").matches.length, 1);
  assert.equal(findCollectionMatches(rows, "300").matches.length, 2);
  assert.equal(findCollectionMatches(rows, "301").matches.length, 0);
  assert.equal(findCollectionMatches([candidate("a", "0"), candidate("b", "50")], "50").matches[0].shipments[0].id, "b");
});
test("búsqueda acotada comunica resultados incompletos", () => {
  assert.equal(findCollectionMatches(Array.from({ length: 40 }, (_, i) => candidate(String(i), "1")), "20", { maxNodes: 10 }).limited, true);
  assert.equal(findCollectionMatches([candidate("a", "10"), candidate("b", "10")], "10", { maxResults: 1 }).limited, true);
});
test("plazo Bogotá excluye sábado y domingo, incluye festivos", () => {
  assert.equal(addBogotaBusinessDays("2026-10-23T20:00:00-05:00"), "2026-10-29T01:00:00.000Z");
  assert.equal(addBogotaBusinessDays("2026-10-22T10:00:00-05:00"), "2026-10-27T15:00:00.000Z");
  // Lunes 12 octubre (festivo colombiano) sí cuenta según regla solicitada.
  assert.equal(addBogotaBusinessDays("2026-10-09T10:00:00-05:00", 1), "2026-10-12T15:00:00.000Z");
});
test("contratos preservan ceros de guía y exigen confirmación e idempotencia", () => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  assert.equal(parseShippingCommand({ action: "guide", requestId: id, arguments: { id, version: 1, guide: "000123", freightCop: "12000", deductionsCop: "0" } }).arguments.guide, "000123");
  assert.throws(() => parseShippingCommand({ action: "dispatch", arguments: { id, version: 1 } }));
  assert.throws(() => parseShippingCommand({ action: "reconcile", requestId: id, arguments: { confirmed: false } }));
});
test("HTTP limita bytes sin depender de Content-Length y conserva el cuerpo HMAC", async () => {
  const body = '{"nombre":"Prueba á"}';
  assert.equal(await readShippingBody(new Request("http://localhost", { method: "POST", body })), body);
  await assert.rejects(readShippingBody(new Request("http://localhost", { method: "POST", body: "x".repeat(32769) })), ShippingBodyTooLarge);
  await assert.rejects(readShippingBody(new Request("http://localhost", { method: "POST", body: "{}", headers: { "Content-Length": "999999" } })), ShippingBodyTooLarge);
});
