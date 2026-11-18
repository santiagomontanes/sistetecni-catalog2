"use client";
import { useState } from "react";
import type { WorkshopPartReview, WorkshopUnit } from "@/lib/workshop/types";
import { descriptiveKinds, partKinds, partKindNames, unitName, type PartKind } from "@/lib/workshop/partKinds";

const field = "rounded-lg border border-border bg-white px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const btn = "rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface disabled:opacity-50";
const primary = "rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50";

export interface ReviewPayload {
  verdict: "confirmed" | "corrected" | "replace" | "replaced";
  kind: PartKind; componentId?: string; target?: string; note?: string;
  attributes?: Record<string, unknown>; replacementId?: string; replacementNote?: string; reserveCode?: boolean;
}
export interface SwapRequest { kind: PartKind; oldComponent?: WorkshopUnit; replacement: WorkshopUnit; note: string; target?: string }

export const verdictBadge: Record<string, { text: string; cls: string }> = {
  none: { text: "Sin verificar", cls: "bg-slate-100 text-slate-700" },
  confirmed: { text: "Coincide con la recepción", cls: "bg-green-100 text-green-800" },
  corrected: { text: "Corregida", cls: "bg-blue-100 text-blue-800" },
  replace: { text: "Cambio pendiente", cls: "bg-amber-100 text-amber-900" },
  replaced: { text: "Cambiada", cls: "bg-green-100 text-green-800" },
};
const attrNames: Record<string, string> = { capacityGb: "Capacidad (GB)", generation: "Generación", technology: "Tecnología", interface: "Interfaz", formFactor: "Formato", connector: "Conector", voltage: "Voltaje (V)", current: "Corriente (A)", watts: "Potencia (W)", notes: "Descripción" };

export function detail(c: WorkshopUnit) {
  const a = c.component_attributes;
  const parts = Object.entries(attrNames).map(([k, label]) => (a[k] != null && a[k] !== "" ? `${label}: ${String(a[k])}` : null)).filter(Boolean);
  return parts.length ? parts.join(" · ") : "Sin datos registrados";
}

// Anotar que hay que cambiar una pieza (o que falta). El repuesto se asigna después, en la pestaña Reparación.
function NoteForm({ label, disabled, onSave }: { label: string; disabled: boolean; onSave: (note: string) => Promise<void> }) {
  const [note, setNote] = useState(""); const [err, setErr] = useState("");
  return <div className="mt-2 space-y-2 rounded-lg border border-border bg-white p-3">
    <label className="block text-sm font-medium">{label}<input className={`${field} mt-1 w-full`} value={note} onChange={e => setNote(e.target.value)} placeholder="Ej.: batería hinchada, no carga" /></label>
    {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
    <button type="button" disabled={disabled} className={primary} onClick={() => { if (note.trim().length < 3) { setErr("Escriba la anotación (mínimo 3 letras)."); return; } setErr(""); void onSave(note.trim()); }}>Anotar y pasar a Reparación</button>
    <p className="text-xs text-slate-600">El repuesto (del inventario o por comprar) se asigna en la pestaña <strong>Reparación</strong>.</p>
  </div>;
}

export default function PartsReview({ installed, reviews, disabled, onReview }: {
  installed: WorkshopUnit[]; reviews: WorkshopPartReview[]; disabled: boolean; onReview: (payload: ReviewPayload) => Promise<void>;
}) {
  const [open, setOpen] = useState<{ id: string; mode: "correct" | "replace" }>(); const [adding, setAdding] = useState(false); const [kind, setKind] = useState<PartKind>("battery");
  const [attrs, setAttrs] = useState<Record<string, string>>({}); const [note, setNote] = useState(""); const [err, setErr] = useState("");
  const latest = (target: string) => reviews.find(r => r.target === target);
  const pendingMissing = reviews.filter(r => r.target.startsWith("new:") && r.verdict === "replace");
  const doneMissing = reviews.filter(r => r.target.startsWith("new:") && r.verdict === "replaced");
  const replacedOld = reviews.filter(r => !r.target.startsWith("new:") && r.verdict === "replaced");
  const pendingCount = installed.filter(c => latest(c.id)?.verdict === "replace").length + pendingMissing.length;
  const numeric = new Set(["capacityGb", "voltage", "current", "watts"]);
  const toAttributes = () => Object.fromEntries(Object.entries(attrs).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, numeric.has(k) ? Number(v) : v.trim()]));
  const fieldsFor = (c: WorkshopUnit): [string, string][] => c.asset_kind === "ram" ? [["capacityGb", "Capacidad GB"], ["generation", "Generación (DDR3, DDR4…)"], ["formFactor", "Formato"]]
    : c.asset_kind === "storage" ? [["capacityGb", "Capacidad GB"], ["technology", "HDD o SSD"], ["interface", "SATA, NVMe…"]]
    : c.asset_kind === "charger" ? [["voltage", "Voltaje V"], ["current", "Corriente A"], ["watts", "Potencia W"], ["connector", "Conector"]]
    : descriptiveKinds.includes(c.asset_kind as PartKind) ? [["notes", "Descripción real"]] : [["formFactor", "Formato"], ["connector", "Conector"]];

  return <details open className="rounded-xl border border-border bg-white p-4 shadow-sm">
    <summary className="cursor-pointer text-base font-semibold">Verificar las piezas de la recepción <span className="text-sm font-normal text-slate-500">· ¿lo que se anotó al recibir es real?</span></summary>
    <p className="mt-2 text-sm text-slate-600">Para cada pieza que llegó con el equipo: confirme que coincide, corrija el dato real, o anote que hay que cambiarla. Los cambios se resuelven en la pestaña <strong>Reparación</strong>, donde se asigna el repuesto; mientras haya un cambio pendiente el equipo no se puede dejar disponible.</p>
    {pendingCount > 0 && <p role="status" className="mt-2 rounded-lg bg-amber-50 p-2 text-sm font-medium text-amber-900">{pendingCount} {pendingCount === 1 ? "pieza con cambio pendiente" : "piezas con cambio pendiente"} (se resuelve en Reparación).</p>}
    {installed.length === 0 && pendingMissing.length === 0 && <p className="mt-3 text-sm">Este equipo no tiene piezas registradas. Si le falta alguna (por ejemplo la batería), agréguela abajo.</p>}
    <ul className="mt-3 space-y-3">
      {installed.map(c => {
        const r = latest(c.id); const b = verdictBadge[r?.verdict ?? "none"]; const kindOf = c.asset_kind as PartKind; const pending = r?.verdict === "replace";
        return <li key={c.id} className="rounded-lg border border-border bg-surface/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{partKindNames[kindOf] ?? c.asset_kind}</span><span className="font-data text-sm">{unitName(c)}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.cls}`}>{b.text}</span>
          </div>
          <p className="mt-1 text-sm text-slate-700">En la recepción: {detail(c)}</p>
          {r?.note && <p className="text-sm text-slate-700">Anotación: {r.note}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={disabled} className={btn} onClick={() => void onReview({ verdict: "confirmed", kind: kindOf, componentId: c.id })}>Coincide</button>
            <button type="button" disabled={disabled} className={btn} onClick={() => { setAttrs({}); setNote(""); setErr(""); setOpen(open?.id === c.id && open.mode === "correct" ? undefined : { id: c.id, mode: "correct" }); }}>Corregir dato</button>
            {pending ? <span className="self-center text-sm font-medium text-amber-900">Se resuelve en la pestaña Reparación</span>
              : <button type="button" disabled={disabled} className={btn} onClick={() => setOpen(open?.id === c.id && open.mode === "replace" ? undefined : { id: c.id, mode: "replace" })}>Hay que cambiarla</button>}
          </div>
          {open?.id === c.id && open.mode === "correct" && <div className="mt-2 space-y-2 rounded-lg border border-border bg-white p-3">
            <div className="flex flex-wrap gap-2">{fieldsFor(c).map(([k, label]) => <input key={k} aria-label={`Dato real: ${label}`} className={`${field} w-44`} placeholder={label} defaultValue={String(c.component_attributes[k] ?? "")} onChange={e => setAttrs(v => ({ ...v, [k]: e.target.value }))} />)}</div>
            <input aria-label="Anotación de la corrección" className={`${field} w-full`} placeholder="Qué se encontró (ej.: el disco es de 240 GB, no 120)" value={note} onChange={e => setNote(e.target.value)} />
            {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
            <button type="button" disabled={disabled} className={primary} onClick={() => {
              const attributes = toAttributes(); if (!Object.keys(attributes).length) { setErr("Escriba al menos un dato real."); return; } if (note.trim().length < 3) { setErr("Escriba la anotación (mínimo 3 letras)."); return; }
              void onReview({ verdict: "corrected", kind: kindOf, componentId: c.id, attributes, note: note.trim() }).then(() => setOpen(undefined));
            }}>Guardar corrección</button>
          </div>}
          {open?.id === c.id && open.mode === "replace" && <NoteForm label="Anotación: ¿por qué hay que cambiarla?" disabled={disabled}
            onSave={n => onReview({ verdict: "replace", kind: kindOf, componentId: c.id, note: n }).then(() => setOpen(undefined))} />}
        </li>;
      })}
    </ul>

    {pendingMissing.length > 0 && <div className="mt-4"><h4 className="font-medium">Piezas que faltan (pendientes)</h4><ul className="mt-2 space-y-2">{pendingMissing.map(r => <li key={r.target} className="rounded-lg border border-amber-300 bg-amber-50/60 p-3">
      <p className="font-semibold">{partKindNames[r.kind as PartKind] ?? r.kind} <span className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${verdictBadge.replace.cls}`}>{verdictBadge.replace.text}</span></p>
      {r.note && <p className="text-sm">Anotación: {r.note}</p>}
      <p className="text-sm text-amber-900">Se resuelve en la pestaña Reparación.</p>
    </li>)}</ul></div>}

    {(replacedOld.length > 0 || doneMissing.length > 0) && <div className="mt-4"><h4 className="font-medium">Piezas cambiadas</h4><ul className="mt-1 space-y-1 text-sm">
      {[...replacedOld, ...doneMissing].map(r => <li key={r.id}>{partKindNames[r.kind as PartKind] ?? r.kind}: {r.replacementCode ? `instalada ${r.replacementCode}` : "cambiada"}{r.note ? ` · ${r.note}` : ""}</li>)}</ul></div>}

    <div className="mt-4 border-t border-border pt-3">
      <button type="button" disabled={disabled} className={btn} onClick={() => setAdding(v => !v)}>{adding ? "Cancelar" : "Agregar pieza que le falta o hay que ponerle"}</button>
      {adding && <div className="mt-2 space-y-2">
        <label className="block text-sm font-medium">Tipo de pieza<select aria-label="Tipo de pieza que falta" className={`${field} mt-1 w-full`} value={kind} onChange={e => setKind(e.target.value as PartKind)}>{partKinds.map(k => <option key={k} value={k}>{partKindNames[k]}</option>)}</select></label>
        <NoteForm key={kind} label="Anotación: ¿por qué se necesita?" disabled={disabled} onSave={n => onReview({ verdict: "replace", kind, note: n }).then(() => setAdding(false))} />
      </div>}
    </div>
  </details>;
}
