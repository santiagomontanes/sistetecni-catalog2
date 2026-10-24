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

type Loc = { id: string; code: string; name: string; active: boolean; parent_id: string | null };
export const SEPARATOR = " › ";
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// «Mueble A › Estante 1»: lo que ve y elige el usuario; el código interno nunca se muestra.
export function locationPath(locations: Loc[], id: string | null): string {
  const names: string[] = []; const seen = new Set<string>();
  for (let cur = locations.find(l => l.id === id); cur && !seen.has(cur.id); cur = locations.find(l => l.id === cur!.parent_id)) { seen.add(cur.id); names.unshift(cur.name); }
  return names.join(SEPARATOR);
}
export function locationChoices(locations: Loc[]): { id: string; path: string }[] {
  return locations.filter(l => l.active).map(l => ({ id: l.id, path: locationPath(locations, l.id) })).sort((a, b) => a.path.localeCompare(b.path, "es"));
}
// Texto escrito por el usuario -> ubicación existente (ignora tildes y mayúsculas); acepta la ruta completa o el nombre si es único.
export function findLocation(locations: Loc[], text: string): Loc | undefined {
  const wanted = norm(text.replace(/\s*[>›]\s*/g, SEPARATOR));
  if (!wanted) return undefined;
  const byPath = locations.filter(l => norm(locationPath(locations, l.id)) === wanted);
  if (byPath.length === 1) return byPath[0];
  const byName = locations.filter(l => norm(l.name) === wanted);
  return byName.length === 1 ? byName[0] : undefined;
}
export type LocationStep = { name: string; code: string; parentId?: string; parentStep?: number } | { activateId: string };
// Qué hay que crear para «Ubicación» (+ «Sub-posición» opcional). La ubicación se reutiliza si ya existe.
export function planLocation(locations: Loc[], base: string, sub: string): { steps: LocationStep[]; label: string; error?: string } {
  const baseText = base.trim().replace(/\s+/g, " "), subText = sub.trim().replace(/\s+/g, " ");
  if (!baseText) return { steps: [], label: "" };
  const used = locations.map(l => l.code); const steps: LocationStep[] = [];
  const parent = findLocation(locations, baseText); const baseLabel = parent ? locationPath(locations, parent.id) : baseText;
  let parentStep: number | undefined;
  if (parent && !parent.active) steps.push({ activateId: parent.id });
  if (!parent) {
    const code = suggestLocationCode(baseText, used); used.push(code);
    steps.push({ name: baseText, code }); parentStep = steps.length - 1;
  }
  if (!subText) {
    if (parent) return { steps: [], label: baseLabel, error: "Esa ubicación ya existe." };
    return { steps, label: baseLabel };
  }
  if (parent && locations.some(l => l.parent_id === parent!.id && norm(l.name) === norm(subText))) return { steps: [], label: `${baseLabel}${SEPARATOR}${subText}`, error: "Esa sub-posición ya existe." };
  const code = suggestLocationCode(`${baseText} ${subText}`, used);
  steps.push({ name: subText, code, ...(parent ? { parentId: parent.id } : { parentStep }) });
  return { steps, label: `${baseLabel}${SEPARATOR}${subText}` };
}
