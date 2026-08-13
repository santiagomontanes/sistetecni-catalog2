import { test } from "node:test";
import assert from "node:assert/strict";
import { translateReason, translateReasons } from "./reasonText";
import type { MatchReasonCode } from "../personalizador";

const ALL_CODES: MatchReasonCode[] = [
  "CPU_GENERATION_OK",
  "CPU_GENERATION_TOO_LOW",
  "CPU_GENERATION_UNKNOWN",
  "GPU_OK",
  "GPU_MISMATCH",
  "GPU_UNKNOWN",
  "TOUCH_OK",
  "TOUCH_MISMATCH",
  "TOUCH_UNKNOWN",
  "SCREEN_SIZE_OK",
  "SCREEN_SIZE_OUT_OF_RANGE",
  "SCREEN_SIZE_UNKNOWN",
  "RAM_ALREADY_SUFFICIENT",
  "RAM_UPGRADE_AVAILABLE",
  "RAM_UPGRADE_UNAVAILABLE",
  "STORAGE_ALREADY_SUFFICIENT",
  "STORAGE_UPGRADE_AVAILABLE",
  "STORAGE_UPGRADE_UNAVAILABLE",
  "WITHIN_BUDGET",
  "WITHIN_BUDGET_TOLERANCE",
  "OVER_BUDGET",
  "IN_STOCK",
  "OUT_OF_STOCK",
];

test("cada MatchReasonCode tiene traducción en español, nunca vacía, nunca el código crudo", () => {
  for (const code of ALL_CODES) {
    const text = translateReason(code);
    assert.ok(text.length > 0, `${code} no debería traducir a texto vacío`);
    assert.notEqual(text, code, `${code} no debería devolverse tal cual (texto crudo)`);
  }
});

test("translateReasons traduce un array completo en el mismo orden", () => {
  const result = translateReasons(["WITHIN_BUDGET", "IN_STOCK"]);
  assert.equal(result.length, 2);
  assert.equal(result[0], translateReason("WITHIN_BUDGET"));
  assert.equal(result[1], translateReason("IN_STOCK"));
});
