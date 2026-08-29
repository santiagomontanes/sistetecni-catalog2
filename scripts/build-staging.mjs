import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const stagingFile = path.join(root, ".env.staging.local");
const localFile = path.join(root, ".env.local");
const productionLocalFile = path.join(root, ".env.production.local");
const hiddenProductionFile = path.join(root, ".env.production.local.__staging_build_disabled__");

function parseEnv(raw) {
  const out = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out.set(key, value);
  }
  return out;
}

if (!fs.existsSync(stagingFile)) {
  console.error("✗ Falta .env.staging.local. Ejecuta/configura primero el entorno STAGING.");
  process.exit(1);
}

if (fs.existsSync(hiddenProductionFile)) {
  console.error("✗ Existe un archivo temporal de un build anterior. No se modifica nada; revisa .env.production.local.__staging_build_disabled__.");
  process.exit(1);
}

const stagingRaw = fs.readFileSync(stagingFile, "utf8");
const env = parseEnv(stagingRaw);
const appEnv = env.get("NEXT_PUBLIC_APP_ENV") ?? "";
const url = env.get("NEXT_PUBLIC_SUPABASE_URL") ?? "";
const productionRef = env.get("SUPABASE_PROJECT_REF_PRODUCTION") ?? "";
let urlRef = "";
try {
  urlRef = url ? new URL(url).hostname.split(".")[0] : "";
} catch {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL de STAGING no es una URL válida.");
  process.exit(1);
}

if (appEnv !== "staging") {
  console.error("✗ .env.staging.local no declara NEXT_PUBLIC_APP_ENV=staging.");
  process.exit(1);
}
if (!urlRef) {
  console.error("✗ STAGING no tiene NEXT_PUBLIC_SUPABASE_URL configurada.");
  process.exit(1);
}
if (productionRef && urlRef === productionRef) {
  console.error("✗ ABORTADO: .env.staging.local apunta al ref de PRODUCTION.");
  process.exit(1);
}

// Asegura que .env.local sea exactamente STAGING para este build.
fs.copyFileSync(stagingFile, localFile);

let productionWasHidden = false;
try {
  // Next.js, al ejecutar `next build`, usa NODE_ENV=production y da prioridad a
  // .env.production.local sobre .env.local. Se oculta temporalmente para que
  // un build de validación STAGING no pueda tomar credenciales de producción.
  if (fs.existsSync(productionLocalFile)) {
    fs.renameSync(productionLocalFile, hiddenProductionFile);
    productionWasHidden = true;
  }

  console.log(`✓ Build STAGING protegido (ref=${urlRef}).`);
  console.log("  .env.production.local queda temporalmente fuera del cargador de Next.js.");

  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const result = spawnSync(process.execPath, [nextBin, "build"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_APP_ENV: "staging" },
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (productionWasHidden && fs.existsSync(hiddenProductionFile)) {
    fs.renameSync(hiddenProductionFile, productionLocalFile);
    console.log("✓ .env.production.local restaurado después del build.");
  }
}
