// Código interno de una ubicación derivado del nombre que escribe el usuario:
// «Estante A · nivel 2» -> ESTANTE-A-NIVEL-2. Único frente a los códigos existentes.
export function suggestLocationCode(name: string, existing: string[]): string {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28) || "UBICACION";
  const taken = new Set(existing.map(code => code.toUpperCase()));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) { const candidate = `${base.slice(0, 28 - String(n).length)}-${n}`; if (!taken.has(candidate)) return candidate; }
  return `${base.slice(0, 20)}-${Date.now() % 100000}`;
}
