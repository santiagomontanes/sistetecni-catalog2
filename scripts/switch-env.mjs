#!/usr/bin/env node
/**
 * Copia .env.<target>.local -> .env.local, con un aviso claro impreso en
 * consola y un encabezado auto-generado dentro del archivo resultante.
 *
 * Reemplaza un diseño anterior basado en symlink (ver docs/entornos-staging-
 * produccion.md, sección "Por qué copia y no symlink"): escribir por error en
 * .env.local con un editor de texto sigue el symlink y modifica el archivo
 * fuente (.env.staging.local o .env.production.local) sin que se note. Con
 * una copia simple, .env.local es siempre un archivo "de usar y tirar":
 * editarlo por error no daña nada, porque la próxima vez que alguien corra
 * `npm run env:staging`/`env:production` se sobrescribe igual.
 *
 * Nunca imprime valores de variables — solo confirma cuál NEXT_PUBLIC_APP_ENV
 * quedó activo, sin mostrar URLs ni claves.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const target = process.argv[2];

if (target !== "staging" && target !== "production") {
  console.error("Uso: node scripts/switch-env.mjs staging|production");
  process.exit(1);
}

const sourceFile = `.env.${target}.local`;

if (!existsSync(sourceFile)) {
  console.error(
    `✗ No existe ${sourceFile}. Cópialo primero desde .env.${target}.example y complétalo con valores reales.`
  );
  process.exit(1);
}

const content = readFileSync(sourceFile, "utf8");

const appEnvLine = content
  .split("\n")
  .find((line) => line.trim().startsWith("NEXT_PUBLIC_APP_ENV="));

const banner =
  `# ══════════════════════════════════════════════════════════════════\n` +
  `# GENERADO AUTOMÁTICAMENTE por "npm run env:${target}" — NO EDITAR A MANO.\n` +
  `# Para cambiar valores, edita ${sourceFile} y vuelve a correr el comando.\n` +
  `# ══════════════════════════════════════════════════════════════════\n\n`;

writeFileSync(".env.local", banner + content);

console.log(`✓ .env.local actualizado desde ${sourceFile}`);
console.log(`  ${appEnvLine ?? "⚠ NEXT_PUBLIC_APP_ENV no encontrada en el archivo fuente — revísalo"}`);

if (target === "production") {
  console.log("  ⚠⚠⚠  ESTÁS APUNTANDO A PRODUCCIÓN — ten cuidado con lo que ejecutas.  ⚠⚠⚠");
}
