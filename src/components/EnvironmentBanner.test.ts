/**
 * Test de regresión a nivel de código fuente (no de render) — bug real
 * encontrado en producción (Preview de B8): Next.js solo puede inlinear
 * en el bundle de CLIENTE los accesos ESTÁTICOS Y LITERALES de la forma
 * `process.env.NEXT_PUBLIC_X` (su DefinePlugin hace reemplazo de texto
 * sobre ese patrón exacto en tiempo de build). Pasar `process.env`
 * completo, o leerlo dinámicamente (`process.env[x]`, o un parámetro
 * `env.NEXT_PUBLIC_X` donde `env` no es el token literal `process.env`),
 * NO se inlinea — en el navegador esa lectura cae a un polyfill vacío en
 * runtime, así que siempre da `undefined`, aunque la variable esté bien
 * configurada en Vercel. Verificado empíricamente inspeccionando el
 * bundle compilado real (ver commit del fix).
 *
 * Este test no renderiza el componente (el proyecto no tiene jsdom/RTL,
 * ver README de B5 para el mismo criterio) — verifica el patrón de
 * código fuente que causa/evita el bug, que es justamente lo que se
 * rompió: no una decisión de lógica, sino la FORMA EXACTA del acceso.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// __dirname aquí es .tmp-test/components/ tras la compilación (tsc no
// copia EnvironmentBanner.tsx en sí — no está en tsconfig.test.json,
// solo este .test.ts). El origen real vive en src/components/, dos
// niveles arriba de la raíz del proyecto compilado.
const SOURCE = readFileSync(resolve(__dirname, "../../src/components/EnvironmentBanner.tsx"), "utf8");

test("EnvironmentBanner lee cada NEXT_PUBLIC_* con acceso literal (inlineable por Next.js)", () => {
  assert.match(
    SOURCE,
    /process\.env\.NEXT_PUBLIC_APP_ENV/,
    "falta process.env.NEXT_PUBLIC_APP_ENV literal — sin esto Next.js no puede inlinearlo en el bundle de cliente"
  );
  assert.match(
    SOURCE,
    /process\.env\.NEXT_PUBLIC_SUPABASE_URL/,
    "falta process.env.NEXT_PUBLIC_SUPABASE_URL literal"
  );
});

test("EnvironmentBanner NUNCA pasa process.env completo a getEnvironment() (rompe el inlining en el navegador)", () => {
  // \b tras process.env (no \s*[,)]) para detectar también variantes con
  // cast de TypeScript pegado inmediatamente después (ej. el bug real:
  // "getEnvironment(process.env as unknown as Record<...>)") — el cast
  // no cambia el hecho de que sigue siendo el objeto process.env completo.
  assert.doesNotMatch(
    SOURCE,
    /getEnvironment\(\s*process\.env\b/,
    "pasar process.env completo (en vez de un objeto con valores ya resueltos vía accesos literales) hace que el banner muestre siempre 'entorno no configurado' en el navegador, incluso con la variable bien puesta en Vercel"
  );
});

test("EnvironmentBanner NUNCA usa acceso dinámico process.env[x] (Next.js no lo inlinea)", () => {
  assert.doesNotMatch(SOURCE, /process\.env\[/, "acceso dinámico a process.env — nunca se inlinea en el bundle de cliente");
});
