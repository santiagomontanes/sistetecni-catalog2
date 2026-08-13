import { test } from "node:test";
import assert from "node:assert/strict";
import { mapUnexpectedError } from "./errorMapping";
import { AdminAuthError } from "./auth";
import { RepositoryError } from "../repositories/errors";

// "error Supabase seguro" (punto 17)
test("mapUnexpectedError: AdminAuthError -> FORBIDDEN", () => {
  const result = mapUnexpectedError(new AdminAuthError("no autorizado"));
  assert.deepEqual(result, { ok: false, error: "FORBIDDEN" });
});

test("mapUnexpectedError: RepositoryError (fallo real de Supabase) -> INTERNAL_ERROR genérico, SIN el mensaje/causa original", () => {
  const supabaseError = { message: "relation \"products\" does not exist", code: "42P01", hint: "revisa el schema" };
  const err = new RepositoryError("ProductsRepository.findById falló", supabaseError);

  const result = mapUnexpectedError(err);
  assert.deepEqual(result, { ok: false, error: "INTERNAL_ERROR" });

  // Garantía estructural: el objeto devuelto no tiene NINGÚN campo que
  // pudiera acarrear el detalle original — ni por accidente futuro.
  assert.deepEqual(Object.keys(result).sort(), ["error", "ok"]);
  assert.ok(!JSON.stringify(result).includes("relation"));
  assert.ok(!JSON.stringify(result).includes("42P01"));
});

test("mapUnexpectedError: cualquier otro tipo de error (string, undefined, Error genérico) -> también INTERNAL_ERROR, nunca se cae", () => {
  assert.deepEqual(mapUnexpectedError("un string cualquiera"), { ok: false, error: "INTERNAL_ERROR" });
  assert.deepEqual(mapUnexpectedError(undefined), { ok: false, error: "INTERNAL_ERROR" });
  assert.deepEqual(mapUnexpectedError(new Error("timeout de red")), { ok: false, error: "INTERNAL_ERROR" });
});
