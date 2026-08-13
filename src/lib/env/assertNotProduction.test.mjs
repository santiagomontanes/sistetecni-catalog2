import { test } from "node:test";
import assert from "node:assert/strict";
import { assertNotProduction } from "./assertNotProduction.mjs";

test("assertNotProduction: no lanza con staging coherente", () => {
  assert.doesNotThrow(() =>
    assertNotProduction("seed-test", {
      NEXT_PUBLIC_APP_ENV: "staging",
      NEXT_PUBLIC_SUPABASE_URL: "https://staging-ref.supabase.co",
      SUPABASE_PROJECT_REF_PRODUCTION: "prod-ref",
    })
  );
});

test("assertNotProduction: aborta si APP_ENV=production", () => {
  assert.throws(
    () =>
      assertNotProduction("seed-test", {
        NEXT_PUBLIC_APP_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: "https://prod-ref.supabase.co",
      }),
    /bloqueada explícitamente contra producción/
  );
});

test("assertNotProduction: aborta si APP_ENV no está definida (no adivina)", () => {
  assert.throws(() => assertNotProduction("seed-test", {}), /no está definida o no es válida/);
});

test("assertNotProduction: aborta si APP_ENV tiene un valor inválido", () => {
  assert.throws(
    () =>
      assertNotProduction("seed-test", {
        NEXT_PUBLIC_APP_ENV: "dev",
        NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      }),
    /no está definida o no es válida/
  );
});

test("assertNotProduction: aborta si staging apunta a la URL de producción conocida", () => {
  assert.throws(
    () =>
      assertNotProduction("seed-test", {
        NEXT_PUBLIC_APP_ENV: "staging",
        NEXT_PUBLIC_SUPABASE_URL: "https://prod-ref.supabase.co",
        SUPABASE_PROJECT_REF_PRODUCTION: "prod-ref",
      }),
    /configuración inconsistente/
  );
});

test("assertNotProduction: nunca incluye la service_role key en su mensaje aunque esté presente en env", () => {
  try {
    assertNotProduction("seed-test", {
      NEXT_PUBLIC_APP_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://prod-ref.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "secreto-de-prueba-no-debe-aparecer",
    });
    assert.fail("debía lanzar");
  } catch (err) {
    const message = /** @type {Error} */ (err).message;
    assert.ok(!message.includes("secreto-de-prueba-no-debe-aparecer"));
  }
});
