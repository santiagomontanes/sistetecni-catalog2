import { test } from "node:test";
import assert from "node:assert/strict";
import { maskPhone } from "./mask";

test("maskPhone: conserva los primeros 3 y los últimos 2 dígitos, enmascara el resto", () => {
  assert.equal(maskPhone("3001234578"), "300*****78");
});

test("maskPhone: ignora caracteres no numéricos antes de enmascarar (el +57 cuenta como dígitos)", () => {
  assert.equal(maskPhone("+57 300 123 4578"), "573*******78");
});

test("maskPhone: números muy cortos se enmascaran por completo", () => {
  assert.equal(maskPhone("123"), "***");
});
