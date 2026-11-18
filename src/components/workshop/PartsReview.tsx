"use client";
import { useState } from "react";
import type { WorkshopPartReview, WorkshopUnit } from "@/lib/workshop/types";
import { descriptiveKinds, partKinds, partKindNames, unitName, type PartKind } from "@/lib/workshop/partKinds";

const field = "rounded-lg border border-border bg-white px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const btn = "rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface disabled:opacity-50";
const primary = "rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50";

export interface ReviewPayload {
  verdict: "confirmed" | "corrected" | "replace";
  kind: PartKind; componentId?: string; target?: string; note?: string;
  attributes?: Record<string, unknown>; replacementId?: string; replacementNote?: string;
}
export interface SwapRequest { kind: PartKind; oldComponent?: WorkshopUnit; replacement: WorkshopUnit; note: string; target?: string }

const verdictBadge: Record<string, { text: string; cls: string }> = {
  none: { text: "Sin verificar", cls: "bg-slate-100 text-slate-700" },
  confirmed: { text: "Coincide con la recepción", cls: "bg-green-100 text-green-800" },
  corrected: { text: "Corregida", cls: "bg-blue-100 text-blue-800" },
  replace: { text: "Cambio pendiente", cls: "bg-amber-100 text-amber-900" },
  replaced: { text: "Cambiada", cls: "bg-green-100 text-green-800" },
};
const attrNames: Record<string, string> = { capacityGb: "Capacidad (GB)", generation: "Generación", technology: "Tecnología", interface: "Interfaz", formFactor: "Formato", connector: "Conector", voltage: "Voltaje (V)", current: "Corriente (A)", watts: "Potencia (W)", notes: "Descripción" };

function detail(c: WorkshopUnit) {
  const a = c.component_attributes;
  const parts = Object.entries(attrNames).map(([k, label]) => (a[k] != null && a[k] !== "" ? `${label}: ${String(a[k])}` : null)).filter(Boolean);
  return parts.length ? parts.join(" · ") : "Sin datos registrados";
}

// Elegir un repuesto libre del mismo tipo (instalarlo ahora) o dejar el cambio pendiente.
function ReplaceForm({ kind, spares, disabled, askNote, noteLabel, onPending, onInstall }: {
  kind: PartKind; spares: WorkshopUnit[]; disabled: boolean; askNote: boolean; noteLabel: string;
  onPending: (v: { note: string; replacementId?: string; replacementNote?: string }) => Promise<void>;
  onInstall: (v: { note: string; replacement: WorkshopUnit }) => Promise<void>;
}) {
  const [note, setNote] = useState(""); const [spare, setSpare] = useState(""); const [what, setWhat] = useState(""); const [err, setErr] = useState("");
  const chosen = spares.find(s => s.id === spare);
  const noteOk = !askNote || note.trim().length >= 3;
  const need = () => { if (!noteOk) { setErr("Escriba la anotación (mínimo 3 letras)."); return false; } setErr(""); return true; };
  return <div className="mt-2 space-y-2 rounded-lg border border-border bg-white p-3">
    {askNote && <label className="block text-sm font-medium">{noteLabel}<input className={`${field} mt-1 w-full`} value={note} onChange={e => setNote(e.target.value)} placeholder="Ej.: batería hinchada, no carga" /></label>}
    <label className="block text-sm font-medium">Repuesto que se le va a poner ({partKindNames[kind].toLowerCase()})
      <select aria-label={`Repuesto de ${partKindNames[kind]}`} className={`${field} mt-1 w-full`} value={spare} onChange={e => setSpare(e.target.value)}>
        <option value="">Todavía no lo tengo / no se ha decidido</option>
        {spares.map(s => <option key={s.id} value={s.id}>{unitName(s)} · {detail(s)}{s.component_condition === "functional" ? "" : " (sin probar)"}</option>)}
      </select></label>
    {!spare && <label className="block text-sm font-medium">Qué hay que conseguir (opcional)<input className={`${field} mt-1 w-full`} value={what} onChange={e => setWhat(e.target.value)} placeholder="Ej.: batería 6 celdas compatible" /></label>}
    {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
    {chosen && chosen.component_condition !== "functional" && <p className="text-sm text-slate-600">Ese repuesto aún no está probado como funcional: puede dejarlo pendiente y, cuando lo pruebe, instalarlo desde aquí.</p>}
    <div className="flex flex-wrap gap-2">
      {chosen && chosen.component_condition === "functional" && <button type="button" disabled={disabled} className={primary} onClick={() => { if (need()) void onInstall({ note: note.trim(), replacement: chosen }); }}>Instalar ahora {unitName(chosen)}</button>}
      <button type="button" disabled={disabled} className={btn} onClick={() => { if (need()) void onPending({ note: note.trim(), ...(spare ? { replacementId: spare } : {}), ...(what.trim() ? { replacementNote: what.trim() } : {}) }); }}>Dejar pendiente</button>
    </div>
  </div>;
}

export default function PartsReview({ installed, spares, reviews, disabled, onReview, onSwap }: {
  installed: WorkshopUnit[]; spares: WorkshopUnit[]; reviews: WorkshopPartReview[]; disabled: boolean;
  onReview: (payload: ReviewPayload) => Promise<void>; onSwap: (request: SwapRequest) => Promise<void>;
}) {
  const [open, setOpen] = useState<{ id: string; mode: "correct" | "replace" }>(); const [adding, setAdding] = useState(false); const [kind, setKind] = useState<PartKind>("battery");
  const [attrs, setAttrs] = useState<Record<string, string>>({}); const [note, setNote] = useState(""); const [err, setErr] = useState("");
  const latest = (target: string) => reviews.find(r => r.target === target);
  const sparesOf = (k: PartKind) => spares.filter(s => s.asset_kind === k);
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
    <p className="mt-2 text-sm text-slate-600">Para cada pieza que llegó con el equipo: confirme que coincide, corrija el dato real, o marque que hay que cambiarla. Si se cambia, elija el repuesto y se instala aquí mismo; si todavía no lo tiene, queda <strong>pendiente</strong> y el equipo no se puede dejar disponible hasta resolverlo.</p>
    {pendingCount > 0 && <p role="status" className="mt-2 rounded-lg bg-amber-50 p-2 text-sm font-medium text-amber-900">{pendingCount} {pendingCount === 1 ? "pieza con cambio pendiente" : "piezas con cambio pendiente"}.</p>}
    {installed.length === 0 && pendingMissing.length === 0 && <p className="mt-3 text-sm">Este equipo no tiene piezas registradas. Si le falta alguna (por ejemplo la batería), agréguela abajo.</p>}
    <ul className="mt-3 space-y-3">
      {installed.map(c => {
        const r = latest(c.id); const b = verdictBadge[r?.verdict ?? "none"]; const kindOf = c.asset_kind as PartKind;
        return <li key={c.id} className="rounded-lg border border-border bg-surface/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{partKindNames[kindOf] ?? c.asset_kind}</span><span className="font-data text-sm">{unitName(c)}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.cls}`}>{b.text}</span>
          </div>
          <p className="mt-1 text-sm text-slate-700">En la recepción: {detail(c)}</p>
          {r?.note && <p className="text-sm text-slate-700">Anotación: {r.note}</p>}
          {r?.verdict === "replace" && <p className="text-sm text-amber-900">{r.replacementCode ? `Repuesto elegido: ${r.replacementCode}` : r.replacementNote ? `Por conseguir: ${r.replacementNote}` : "Repuesto sin definir"}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={disabled} className={btn} onClick={() => void onReview({ verdict: "confirmed", kind: kindOf, componentId: c.id })}>Coincide</button>
            <button type="button" disabled={disabled} className={btn} onClick={() => { setAttrs({}); setNote(""); setErr(""); setOpen(open?.id === c.id && open.mode === "correct" ? undefined : { id: c.id, mode: "correct" }); }}>Corregir dato</button>
            <button type="button" disabled={disabled} className={btn} onClick={() => { setOpen(open?.id === c.id && open.mode === "replace" ? undefined : { id: c.id, mode: "replace" }); }}>{r?.verdict === "replace" ? "Resolver el cambio" : "Hay que cambiarla"}</button>
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
          {open?.id === c.id && open.mode === "replace" && <ReplaceForm kind={kindOf} spares={sparesOf(kindOf)} disabled={disabled} askNote={r?.verdict !== "replace"} noteLabel="Anotación: ¿por qué hay que cambiarla?"
            onPending={v => onReview({ verdict: "replace", kind: kindOf, componentId: c.id, note: v.note || r?.note || undefined, replacementId: v.replacementId, replacementNote: v.replacementNote }).then(() => setOpen(undefined))}
            onInstall={v => onSwap({ kind: kindOf, oldComponent: c, replacement: v.replacement, note: v.note || r?.note || "Cambio de pieza" }).then(() => setOpen(undefined))} />}
        </li>;
      })}
    </ul>

    {pendingMissing.length > 0 && <div className="mt-4"><h4 className="font-medium">Piezas que faltan (pendientes)</h4><ul className="mt-2 space-y-3">{pendingMissing.map(r => <li key={r.target} className="rounded-lg border border-amber-300 bg-amber-50/60 p-3">
      <p className="font-semibold">{partKindNames[r.kind as PartKind] ?? r.kind} <span className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${verdictBadge.replace.cls}`}>{verdictBadge.replace.text}</span></p>
      {r.note && <p className="text-sm">Anotación: {r.note}</p>}
      <p className="text-sm text-amber-900">{r.replacementCode ? `Repuesto elegido: ${r.replacementCode}` : r.replacementNote ? `Por conseguir: ${r.replacementNote}` : "Repuesto sin definir"}</p>
      <button type="button" disabled={disabled} className={`${btn} mt-2`} onClick={() => setOpen(open?.id === r.target ? undefined : { id: r.target, mode: "replace" })}>Resolver</button>
      {open?.id === r.target && <ReplaceForm kind={r.kind as PartKind} spares={sparesOf(r.kind as PartKind)} disabled={disabled} askNote={false} noteLabel=""
        onPending={v => onReview({ verdict: "replace", kind: r.kind as PartKind, target: r.target, note: r.note ?? undefined, replacementId: v.replacementId, replacementNote: v.replacementNote }).then(() => setOpen(undefined))}
        onInstall={v => onSwap({ kind: r.kind as PartKind, replacement: v.replacement, note: r.note ?? "Pieza que faltaba", target: r.target }).then(() => setOpen(undefined))} />}
    </li>)}</ul></div>}

    {(replacedOld.length > 0 || doneMissing.length > 0) && <div className="mt-4"><h4 className="font-medium">Piezas cambiadas</h4><ul className="mt-1 space-y-1 text-sm">
      {[...replacedOld, ...doneMissing].map(r => <li key={r.id}>{partKindNames[r.kind as PartKind] ?? r.kind}: {r.replacementCode ? `instalada ${r.replacementCode}` : "cambiada"}{r.note ? ` · ${r.note}` : ""}</li>)}</ul></div>}

    <div className="mt-4 border-t border-border pt-3">
      <button type="button" disabled={disabled} className={btn} onClick={() => setAdding(v => !v)}>{adding ? "Cancelar" : "Agregar pieza que le falta o hay que ponerle"}</button>
      {adding && <div className="mt-2 space-y-2">
        <label className="block text-sm font-medium">Tipo de pieza<select aria-label="Tipo de pieza que falta" className={`${field} mt-1 w-full`} value={kind} onChange={e => setKind(e.target.value as PartKind)}>{partKinds.map(k => <option key={k} value={k}>{partKindNames[k]}</option>)}</select></label>
        <ReplaceForm key={kind} kind={kind} spares={sparesOf(kind)} disabled={disabled} askNote noteLabel="Anotación: ¿por qué se necesita?"
          onPending={v => onReview({ verdict: "replace", kind, note: v.note, replacementId: v.replacementId, replacementNote: v.replacementNote }).then(() => setAdding(false))}
          onInstall={v => onSwap({ kind, replacement: v.replacement, note: v.note }).then(() => setAdding(false))} />
      </div>}
    </div>
  </details>;
}
