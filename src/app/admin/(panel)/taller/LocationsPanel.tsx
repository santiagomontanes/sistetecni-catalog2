"use client";
import { useMemo, useState } from "react";
import type { WorkshopLocation } from "@/lib/workshop/types";
import { suggestLocationCode } from "@/lib/workshop/locations";

const field = "w-full rounded border px-3 py-2";
const button = "rounded border px-3 py-2 disabled:opacity-50";
const starter = ["Recepción", "Mesa técnica", "Estética", "Bodega"];

function ordered(locations: WorkshopLocation[]) {
  const out: { location: WorkshopLocation; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => locations.filter(l => l.parent_id === parent).sort((a, b) => a.name.localeCompare(b.name)).forEach(l => { out.push({ location: l, depth }); walk(l.id, depth + 1); });
  walk(null, 0);
  const seen = new Set(out.map(o => o.location.id));
  locations.filter(l => !seen.has(l.id)).forEach(l => out.push({ location: l, depth: 0 }));
  return out;
}

export default function LocationsPanel({ locations, disabled, command }: { locations: WorkshopLocation[]; disabled: boolean; command: (action: string, payload: Record<string, unknown>) => Promise<unknown> }) {
  const [name, setName] = useState(""); const [parent, setParent] = useState(""); const [code, setCode] = useState("");
  const codes = useMemo(() => locations.map(l => l.code), [locations]);
  const suggested = name.trim() ? suggestLocationCode(name, codes) : "";
  const finalCode = (code.trim() || suggested).toUpperCase();
  const taken = codes.includes(finalCode);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || taken) return;
    const result = await command("location", { code: finalCode, name: name.trim(), ...(parent ? { parentId: parent } : {}) });
    if (result) { setName(""); setCode(""); }
  }
  async function createStarter() {
    const used = [...codes];
    for (const n of starter) { const c = suggestLocationCode(n, used); used.push(c); if (!(await command("location", { code: c, name: n }))) return; }
  }
  return <section className="space-y-4 rounded border bg-white p-4">
    <div><h2 className="text-lg font-semibold">2. Ubicaciones</h2>
      <p className="text-sm text-slate-600">Una ubicación es el lugar físico donde está un equipo: una mesa, un estante, la bodega. Al recibir o mover un equipo se elige una. Puede ponerlas dentro de otra (por ejemplo «Nivel 2» dentro de «Estante A»).</p></div>
    {locations.length === 0 && <div className="rounded bg-amber-50 p-3 text-sm text-amber-900"><p>Todavía no tiene ubicaciones.</p>
      <button type="button" disabled={disabled} onClick={() => void createStarter()} className={`${button} mt-2 bg-white`}>Crear las básicas: {starter.join(", ")}</button></div>}
    <form onSubmit={e => void create(e)} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">Nombre de la ubicación<input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Estante A, Mesa técnica 1, Bodega" required maxLength={120} className={field} /></label>
      <label className="text-sm">Dentro de (opcional)<select value={parent} onChange={e => setParent(e.target.value)} className={field}><option value="">— Es una ubicación principal —</option>{locations.filter(l => l.active).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <label className="text-sm">Código interno<input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder={suggested || "Se genera solo"} pattern="[A-Z0-9_\-]{1,32}" className={field} />
        <span className="text-xs text-slate-500">{taken ? "Ese código ya existe; escriba otro." : finalCode ? `Se guardará como ${finalCode}. No hace falta cambiarlo.` : "Se genera solo a partir del nombre."}</span></label>
      <div className="sm:col-span-2"><button disabled={disabled || !name.trim() || taken} className={`${button} bg-slate-900 text-white`}>Crear ubicación</button></div>
    </form>
    {locations.length > 0 && <ul className="divide-y text-sm">
      {ordered(locations).map(({ location: l, depth }) => <li key={l.id} className="flex items-center justify-between gap-2 py-1.5" style={{ paddingLeft: depth * 20 }}>
        <span className={l.active ? "" : "text-slate-400 line-through"}>{depth > 0 && "↳ "}<strong>{l.name}</strong> <span className="text-slate-500">({l.code})</span>{!l.active && " · inactiva"}</span>
        <button disabled={disabled} className="underline disabled:opacity-50" onClick={() => void command("location", { id: l.id, active: !l.active })}>{l.active ? "Desactivar" : "Activar"}</button></li>)}
    </ul>}
    <p className="text-xs text-slate-500">Desactivar oculta la ubicación en las listas pero conserva el historial; no se borran ubicaciones.</p>
  </section>;
}
