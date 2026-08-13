/**
 * Cargador mínimo de .env, sin dependencias — mismo enfoque que ya usa
 * ~/sistetecni-ai-agent/src/config/index.js (no se instala `dotenv` para
 * ~15 líneas de parseo). Solo lo usan los scripts sueltos de `scripts/`,
 * que corren fuera de Next.js y por tanto no reciben la carga automática
 * de `.env.local` que sí tiene `next dev`/`next build`.
 *
 * No sobrescribe variables ya presentes en el entorno del shell.
 */
import { readFileSync } from "node:fs";

/**
 * @param {string} [path]
 */
export function loadEnv(path = ".env.local") {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    console.warn(`[loadEnv] No se encontró ${path} — solo se usarán variables ya presentes en el entorno.`);
    return;
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf("=");
    if (sep === -1) continue;
    const key = trimmed.slice(0, sep).trim();
    let value = trimmed.slice(sep + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
