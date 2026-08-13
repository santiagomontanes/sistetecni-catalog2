import { test } from "node:test";
import assert from "node:assert/strict";
import { getEnvironment, extractProjectRef } from "./environment.mjs";

test("extractProjectRef: extrae el subdominio de una URL de Supabase", () => {
  assert.equal(extractProjectRef("https://abcdefgh.supabase.co"), "abcdefgh");
});

test("extractProjectRef: null si no hay URL", () => {
  assert.equal(extractProjectRef(undefined), null);
});

test("extractProjectRef: null si la URL es inválida", () => {
  assert.equal(extractProjectRef("no-es-una-url"), null);
});

test("getEnvironment: staging válido y coherente", () => {
  const info = getEnvironment({
    NEXT_PUBLIC_APP_ENV: "staging",
    NEXT_PUBLIC_SUPABASE_URL: "https://staging-ref.supabase.co",
    SUPABASE_PROJECT_REF_PRODUCTION: "prod-ref",
  });
  assert.equal(info.appEnv, "staging");
  assert.equal(info.coherent, true);
  assert.deepEqual(info.warnings, []);
});

test("getEnvironment: sin NEXT_PUBLIC_APP_ENV -> appEnv null, no coherente", () => {
  const info = getEnvironment({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" });
  assert.equal(info.appEnv, null);
  assert.equal(info.coherent, false);
  assert.ok(info.warnings.some((w) => w.includes("NEXT_PUBLIC_APP_ENV no está definida")));
});

test("getEnvironment: valor inválido de APP_ENV -> appEnv null, no coherente (no adivina)", () => {
  const info = getEnvironment({
    NEXT_PUBLIC_APP_ENV: "dev",
    NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  });
  assert.equal(info.appEnv, null);
  assert.equal(info.coherent, false);
});

test("getEnvironment: sin NEXT_PUBLIC_SUPABASE_URL -> no coherente", () => {
  const info = getEnvironment({ NEXT_PUBLIC_APP_ENV: "staging" });
  assert.equal(info.coherent, false);
  assert.ok(info.warnings.some((w) => w.includes("NEXT_PUBLIC_SUPABASE_URL no está definida")));
});

test("getEnvironment: staging pero la URL coincide con la producción conocida -> no coherente", () => {
  const info = getEnvironment({
    NEXT_PUBLIC_APP_ENV: "staging",
    NEXT_PUBLIC_SUPABASE_URL: "https://prod-ref.supabase.co",
    SUPABASE_PROJECT_REF_PRODUCTION: "prod-ref",
  });
  assert.equal(info.coherent, false);
  assert.ok(info.warnings.some((w) => w.includes("PRODUCCIÓN")));
});

test("getEnvironment: staging con URL distinta a producción conocida -> coherente", () => {
  const info = getEnvironment({
    NEXT_PUBLIC_APP_ENV: "staging",
    NEXT_PUBLIC_SUPABASE_URL: "https://staging-ref.supabase.co",
    SUPABASE_PROJECT_REF_PRODUCTION: "prod-ref",
  });
  assert.equal(info.coherent, true);
});

test("getEnvironment: sin SUPABASE_PROJECT_REF_PRODUCTION disponible (ej. navegador), no se marca incoherente por eso solo", () => {
  const info = getEnvironment({
    NEXT_PUBLIC_APP_ENV: "staging",
    NEXT_PUBLIC_SUPABASE_URL: "https://staging-ref.supabase.co",
  });
  assert.equal(info.coherent, true);
});

test("getEnvironment: production explícito es coherente en sí mismo — bloquearlo es responsabilidad de assertNotProduction, no de getEnvironment", () => {
  const info = getEnvironment({
    NEXT_PUBLIC_APP_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://prod-ref.supabase.co",
  });
  assert.equal(info.appEnv, "production");
  assert.equal(info.coherent, true);
});
