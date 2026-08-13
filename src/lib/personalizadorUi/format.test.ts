import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCOP } from "./format";

// Punto 16 del pedido
test("formatCOP: formatea enteros COP con separador de miles, sin decimales", () => {
  // Intl.NumberFormat("es-CO", ...) en este runtime intercala un espacio
  // tras el símbolo ($ 620.000) — se compara contra el formateador real,
  // no un literal adivinado, para no acoplar el test a un detalle de ICU
  // que puede variar entre versiones de Node.
  const expected = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
  assert.equal(formatCOP(620000), expected.format(620000));
  assert.equal(formatCOP(2500000), expected.format(2500000));
  assert.equal(formatCOP(0), expected.format(0));

  // Invariantes de forma que sí deben cumplirse siempre, independientes de ICU:
  assert.ok(formatCOP(620000).includes("620.000"));
  assert.ok(formatCOP(620000).includes("$"));
  assert.ok(!formatCOP(620000).includes(","));
});
