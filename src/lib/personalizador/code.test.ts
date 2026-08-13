import { test } from "node:test";
import assert from "node:assert/strict";
import { generateQuoteCode, isValidQuoteCodeFormat, QUOTE_CODE_ALPHABET } from "./code";

// Escenario 25: generación determinista mediante RNG inyectado
test("25. con un RNG inyectado fijo, el código generado es 100% predecible y reproducible", () => {
  const fixedBytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const fakeRandom = () => fixedBytes;

  const code1 = generateQuoteCode(fakeRandom);
  const code2 = generateQuoteCode(fakeRandom);

  assert.equal(code1, code2);
  assert.equal(code1, `COT-${QUOTE_CODE_ALPHABET.slice(0, 9)}`);
});

test("25b. bytes distintos producen códigos distintos, siempre con el mismo formato", () => {
  const codeA = generateQuoteCode(() => new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0]));
  const codeB = generateQuoteCode(() => new Uint8Array([31, 31, 31, 31, 31, 31, 31, 31, 31]));
  assert.notEqual(codeA, codeB);
  assert.ok(isValidQuoteCodeFormat(codeA));
  assert.ok(isValidQuoteCodeFormat(codeB));
});

test("el alfabeto excluye 0/O/1/I (ambiguos) y tiene exactamente 32 símbolos — conserva 'L'", () => {
  for (const ambiguous of ["0", "O", "1", "I"]) {
    assert.ok(!QUOTE_CODE_ALPHABET.includes(ambiguous), `"${ambiguous}" no debería estar en el alfabeto`);
  }
  assert.ok(QUOTE_CODE_ALPHABET.includes("L"), "\"L\" debe conservarse para llegar a 32 símbolos exactos");
  assert.equal(QUOTE_CODE_ALPHABET.length, 32);
});

test("el generador por defecto (sin RNG inyectado) produce códigos válidos y no siempre iguales", () => {
  const a = generateQuoteCode();
  const b = generateQuoteCode();
  assert.ok(isValidQuoteCodeFormat(a));
  assert.ok(isValidQuoteCodeFormat(b));
  // Con 32^6 combinaciones, la probabilidad de colisión en 2 intentos es despreciable.
  assert.notEqual(a, b);
});

test("isValidQuoteCodeFormat: rechaza formatos incorrectos", () => {
  assert.equal(isValidQuoteCodeFormat("COT-ABC"), false); // muy corto
  assert.equal(isValidQuoteCodeFormat("XXX-ABCDEF"), false); // prefijo incorrecto
  assert.equal(isValidQuoteCodeFormat("COT-ABC0EF"), false); // "0" no está en el alfabeto
});
