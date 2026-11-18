"use client";
import { useState } from "react";
import type { WorkshopPartReview, WorkshopUnit } from "@/lib/workshop/types";
import { kindPrefixes, partKindNames, unitName, type PartKind } from "@/lib/workshop/partKinds";
import { detail, verdictBadge, type ReviewPayload, type SwapRequest } from "./PartsReview";

const field = "rounded-lg border border-border bg-white px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const btn = "rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface disabled:opacity-50";
const primary = "rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50";

export interface ArrivalRequest { kind: PartKind; code: string; costCop?: string; condition: "functional" | "untested" }

// Cambios de pieza pendientes: aquí se asigna el repuesto, del inventario o por comprar (con su código STU según el tipo de pieza).
function Item({ review, old, spares, disabled, onReview, onSwap, onArrival, onPrint }: {
  review: WorkshopPartReview; old?: WorkshopUnit; spares: WorkshopUnit[]; disabled: boolean;
  onReview: (p: ReviewPayload) => Promise<void>; onSwap: (r: SwapRequest) => Promise<void>; onArrival: (r: ArrivalRequest) => Promise<void>; onPrint: (code: string, kind: PartKind) => Promise<void>;
}) {
  const kind = review.kind as PartKind;
  const arrived = review.reservedCode ? spares.find(s => s.unit_code === review.reservedCode) : undefined;
  const [spare, setSpare] = useState(review.replacementId ?? ""); const [cost, setCost] = useState(""); const [state, setState] = useState<"functional" | "untested">("functional");
  const chosen = spares.find(s => s.id === spare);
  const base = { kind, ...(review.componentId ? { componentId: review.componentId } : { target: review.target }), note: review.note ?? undefined };
  const install = (replacement: WorkshopUnit) => onSwap({ kind, oldComponent: old, replacement, note: review.note ?? "Cambio de pieza", ...(review.componentId ? {} : { target: review.target }) });
  return <li className="rounded-lg border border-amber-300 bg-amber-50/60 p-3">
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold">{partKindNames[kind] ?? kind}</span>{old && <span className="font-data text-sm">{unitName(old)}</span>}
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${verdictBadge.replace.cls}`}>{verdictBadge.replace.text}</span>
    </div>
    {old && <p className="text-sm text-slate-700">Pieza actual: {detail(old)}</p>}
    {review.note && <p className="text-sm text-slate-700">Anotación: {review.note}</p>}

    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <div className="space-y-2 rounded-lg border border-border bg-white p-3">
        <h4 className="text-sm font-semibold">Repuesto que ya está en el inventario</h4>
        <select aria-label={`Repuesto del inventario: ${partKindNames[kind]}`} className={`${field} w-full`} value={spare} onChange={e => setSpare(e.target.value)}>
          <option value="">Elegir repuesto…</option>
          {spares.map(s => <option key={s.id} value={s.id}>{unitName(s)} · {detail(s)}{s.component_condition === "functional" ? "" : " (sin probar)"}</option>)}
        </select>
        {spares.length === 0 && <p className="text-xs text-slate-600">No hay repuestos de este tipo en el inventario.</p>}
        <div className="flex flex-wrap gap-2">
          {chosen?.component_condition === "functional" && <button type="button" disabled={disabled} className={primary} onClick={() => void install(chosen)}>Instalar {unitName(chosen)}</button>}
          {chosen && chosen.component_condition !== "functional" && <button type="button" disabled={disabled} className={btn} onClick={() => void onReview({ verdict: "replace", ...base, replacementId: chosen.id })}>Asignar (falta probarlo)</button>}
        </div>
        {review.replacementCode && !review.reservedCode && <p className="text-xs text-slate-600">Asignado: {review.replacementCode}. Pruébelo como funcional para instalarlo.</p>}
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-white p-3">
        <h4 className="text-sm font-semibold">Hay que comprarlo</h4>
        {!review.reservedCode && <><p className="text-xs text-slate-600">Se le reserva ya su código ({kindPrefixes[kind]}-…) para pegar la etiqueta al repuesto cuando llegue.</p>
          <button type="button" disabled={disabled} className={btn} onClick={() => void onReview({ verdict: "replace", ...base, reserveCode: true })}>Asignar código {kindPrefixes[kind]}</button></>}
        {review.reservedCode && <>
          <p className="rounded-lg bg-surface px-3 py-2 text-sm">Código reservado: <strong className="font-data">{review.reservedCode}</strong> {arrived ? "· ya llegó" : "· esperando el repuesto"}</p>
          <button type="button" className={btn} onClick={() => void onPrint(review.reservedCode!, kind)}>Imprimir etiqueta</button>
          {arrived ? (arrived.component_condition === "functional"
            ? <button type="button" disabled={disabled} className={primary} onClick={() => void install(arrived)}>Instalar {unitName(arrived)}</button>
            : <p className="text-xs text-slate-600">Llegó sin probar: márquelo como funcional en «Repuestos sueltos» para instalarlo.</p>)
          : <div className="space-y-2 border-t border-border pt-2"><p className="text-sm font-medium">Ya llegó el repuesto</p>
            <input aria-label="Costo del repuesto" inputMode="numeric" className={`${field} w-full`} placeholder="Costo COP (vacío = desconocido)" value={cost} onChange={e => setCost(e.target.value.replace(/\D/g, ""))} />
            <select aria-label="Estado del repuesto que llegó" className={`${field} w-full`} value={state} onChange={e => setState(e.target.value as "functional" | "untested")}><option value="functional">Llegó funcional</option><option value="untested">Pendiente de prueba</option></select>
            <button type="button" disabled={disabled} className={primary} onClick={() => void onArrival({ kind, code: review.reservedCode!, ...(cost ? { costCop: cost } : {}), condition: state })}>Registrar llegada</button></div>}
        </>}
      </div>
    </div>
  </li>;
}

export default function RepairParts({ installed, spares, reviews, disabled, onReview, onSwap, onArrival, onPrint }: {
  installed: WorkshopUnit[]; spares: WorkshopUnit[]; reviews: WorkshopPartReview[]; disabled: boolean;
  onReview: (p: ReviewPayload) => Promise<void>; onSwap: (r: SwapRequest) => Promise<void>; onArrival: (r: ArrivalRequest) => Promise<void>; onPrint: (code: string, kind: PartKind) => Promise<void>;
}) {
  const pending = reviews.filter(r => r.verdict === "replace");
  if (!pending.length) return <p className="mt-3 rounded-lg bg-surface/60 p-3 text-sm text-slate-600">No hay cambios de pieza pendientes. Si en la revisión (Fase 2) anota que una pieza hay que cambiarla, aparece aquí para asignarle el repuesto.</p>;
  return <div className="mt-3">
    <h4 className="font-semibold">Cambios de pieza pendientes <span className="text-sm font-normal text-slate-500">· {pending.length}</span></h4>
    <p className="text-sm text-slate-600">Asigne el repuesto: uno que ya esté en el inventario, o reserve el código de uno por comprar. Al instalarlo, la pieza vieja sale como defectuosa y el costo del repuesto suma al equipo.</p>
    <ul className="mt-2 space-y-3">{pending.map(r => <Item key={r.target} review={r} old={r.componentId ? installed.find(c => c.id === r.componentId) : undefined}
      spares={spares.filter(s => s.asset_kind === r.kind)} disabled={disabled} onReview={onReview} onSwap={onSwap} onArrival={onArrival} onPrint={onPrint} />)}</ul>
  </div>;
}
