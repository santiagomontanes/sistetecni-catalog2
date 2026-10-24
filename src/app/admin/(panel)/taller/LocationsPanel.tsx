"use client";
import { useMemo, useState } from "react";
import type { WorkshopLocation } from "@/lib/workshop/types";
import { findLocation, locationChoices, planLocation, SEPARATOR } from "@/lib/workshop/locations";

const field = "w-full rounded border px-3 py-2";
const button = "rounded border px-3 py-2 disabled:opacity-50";
const starter = ["Recepción", "Mesa técnica", "Estética", "Bodega"];

function ordered(locations: WorkshopLocation[]) {
  const out: { location: WorkshopLocation; depth: number }[] = []; const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => locations.filter(l => l.parent_id === parent && !seen.has(l.id)).sort((a, b) => a.name.localeCompare(b.name, "es")).forEach(l => { seen.add(l.id); out.push({ location: l, depth }); walk(l.id, depth + 1); });
  walk(null, 0);
  locations.filter(l => !seen.has(l.id)).forEach(l => out.push({ location: l, depth: 0 }));
  return out;
}

export default function LocationsPanel({ locations, disabled, command }: { locations: WorkshopLocation[]; disabled: boolean; command: (action: string, payload: Record<string, unknown>) => Promise<unknown> }) {
  const [base, setBase] = useState(""); const [sub, setSub] = useState("");
  const plan = useMemo(() => planLocation(locations, base, sub), [locations, base, sub]);
  const existingBase = findLocation(locations, base);
  const baseOptions = useMemo(() => locationChoices(locations), [locations]);
  const subOptions = existingBase ? locations.filter(l => l.parent_id === existingBase.id).map(l => l.name) : [];
  const canSave = !disabled && plan.steps.length > 0 && !plan.error;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    const ids: (string | undefined)[] = [];
    for (const [i, step] of plan.steps.entries()) {
      if ("activateId" in step) { if (!(await command("location", { id: step.activateId, active: true }))) return; continue; }
      const parentId = step.parentId ?? (step.parentStep !== undefined ? ids[step.parentStep] : undefined);
      const result = await command("location", { code: step.code, name: step.name, ...(parentId ? { parentId } : {}) }) as { id?: string } | undefined;
      if (!result?.id) return;
      ids[i] = result.id;
    }
    setBase(""); setSub("");
  }
  async function createStarter() {
    for (const n of starter) { const p = planLocation(locations, n, ""); const step = p.steps[0]; if (!step || "activateId" in step) continue; if (!(await command("location", { code: step.code, name: step.name }))) return; }
  }
  const hint = plan.error ? plan.error
    : plan.steps.length === 0 ? "Escriba el nombre de la ubicación."
    : sub.trim() ? (existingBase ? `Se agregará «${sub.trim()}» dentro de «${plan.label.split(SEPARATOR).slice(0, -1).join(SEPARATOR)}».` : `Se creará «${base.trim()}» y dentro «${sub.trim()}».`)
    : `Se creará «${plan.label}».`;
  return <section className="space-y-4 rounded border bg-white p-4">
    <div><h2 className="text-lg font-semibold">2. Ubicaciones</h2>
      <p className="text-sm text-slate-600">Escriba el nombre que quiera, como lo dice en el taller: «Mueble A», «Mesa 2», «Bodega». Si dentro hay posiciones (estante, cajón), escríbalas en <strong>Sub-posición</strong>: «Estante 1». Al recibir o mover un equipo se elige el lugar completo, por ejemplo «Mueble A › Estante 1».</p></div>
    {locations.length === 0 && <div className="rounded bg-amber-50 p-3 text-sm text-amber-900"><p>Todavía no tiene ubicaciones. Puede escribir las suyas abajo o empezar con unas básicas.</p>
      <button type="button" disabled={disabled} onClick={() => void createStarter()} className={`${button} mt-2 bg-white`}>Crear: {starter.join(", ")}</button></div>}
    <form onSubmit={e => void save(e)} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Ubicación<input list="loc-base" value={base} onChange={e => setBase(e.target.value)} placeholder="Ej: Mueble A" required maxLength={100} className={field} autoComplete="off" />
        <datalist id="loc-base">{baseOptions.map(o => <option key={o.id} value={o.path} />)}</datalist></label>
      <label className="text-sm">Sub-posición (opcional)<input list="loc-sub" value={sub} onChange={e => setSub(e.target.value)} placeholder="Ej: Estante 1" maxLength={100} className={field} autoComplete="off" />
        <datalist id="loc-sub">{subOptions.map(n => <option key={n} value={n} />)}</datalist></label>
      <p className={`text-sm sm:col-span-2 ${plan.error ? "text-red-700" : "text-slate-600"}`} role="status">{hint}</p>
      <div className="sm:col-span-2"><button disabled={!canSave} className={`${button} bg-slate-900 text-white`}>Guardar ubicación</button></div>
    </form>
    {locations.length > 0 && <ul className="divide-y text-sm">
      {ordered(locations).map(({ location: l, depth }) => <li key={l.id} className="flex items-center justify-between gap-2 py-1.5" style={{ paddingLeft: depth * 20 }}>
        <span className={l.active ? "" : "text-slate-400 line-through"}>{depth > 0 && "↳ "}<strong>{l.name}</strong>{!l.active && " · inactiva"}</span>
        <button disabled={disabled} className="underline disabled:opacity-50" onClick={() => void command("location", { id: l.id, active: !l.active })}>{l.active ? "Desactivar" : "Activar"}</button></li>)}
    </ul>}
    <p className="text-xs text-slate-500">Desactivar oculta el lugar de las listas pero conserva el historial; las ubicaciones no se borran.</p>
  </section>;
}
