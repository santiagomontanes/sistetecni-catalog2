import { test } from "node:test";
import assert from "node:assert/strict";
import { getAdminClient, _resetAdminClientForTests } from "./admin";

function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    original[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

test("getAdminClient: falla con mensaje claro si falta NEXT_PUBLIC_SUPABASE_URL", () => {
  withEnv(
    { NEXT_PUBLIC_SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: "clave-de-prueba" },
    () => {
      _resetAdminClientForTests();
      assert.throws(() => getAdminClient(), /Falta la variable de entorno "NEXT_PUBLIC_SUPABASE_URL"/);
    }
  );
});

test("getAdminClient: falla con mensaje claro si falta SUPABASE_SERVICE_ROLE_KEY", () => {
  withEnv(
    { NEXT_PUBLIC_SUPABASE_URL: "https://ref-de-prueba.supabase.co", SUPABASE_SERVICE_ROLE_KEY: undefined },
    () => {
      _resetAdminClientForTests();
      assert.throws(() => getAdminClient(), /Falta la variable de entorno "SUPABASE_SERVICE_ROLE_KEY"/);
    }
  );
});

test("getAdminClient: el mensaje de error nunca incluye ningún valor de variable, solo el nombre", () => {
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: "secreto-no-debe-aparecer" }, () => {
    _resetAdminClientForTests();
    try {
      getAdminClient();
      assert.fail("debía lanzar");
    } catch (err) {
      const message = (err as Error).message;
      assert.ok(!message.includes("secreto-no-debe-aparecer"));
    }
  });
});

test("getAdminClient: crea el cliente correctamente cuando ambas variables están presentes", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://ref-de-prueba.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "clave-de-prueba",
    },
    () => {
      _resetAdminClientForTests();
      const client = getAdminClient();
      assert.ok(client);
      assert.equal(typeof client.from, "function");
    }
  );
});

test("getAdminClient: reutiliza el mismo cliente entre llamadas (cache de proceso)", () => {
  withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://ref-de-prueba.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "clave-de-prueba",
    },
    () => {
      _resetAdminClientForTests();
      const a = getAdminClient();
      const b = getAdminClient();
      assert.equal(a, b);
    }
  );
});

test("admin.ts: lanza inmediatamente si se importa en un contexto tipo navegador (window definido)", () => {
  // require() real e intencional aquí: la única forma de forzar que el guard
  // de nivel de módulo de admin.ts se re-ejecute es limpiar require.cache y
  // volver a requerirlo — un `import` estático no permite esto.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const modulePath = require.resolve("./admin");
  delete require.cache[modulePath];
  // @ts-expect-error -- simula un entorno de navegador solo para esta prueba
  global.window = {};
  try {
    assert.throws(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("./admin");
    }, /NUNCA debe ejecutarse en el cliente/);
  } finally {
    // @ts-expect-error -- limpieza del global simulado
    delete global.window;
    delete require.cache[modulePath];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("./admin"); // recarga en el estado normal (sin window) para no afectar otros tests del proceso
  }
});
