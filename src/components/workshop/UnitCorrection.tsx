"use client";
import type { WorkshopLocation, WorkshopUnit } from "@/lib/workshop/types";
import { locationChoices } from "@/lib/workshop/locations";

const field = "mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const conditionLabels: Record<string, string> = { good: "Bueno", fair: "Regular", bad: "Malo" };

// Corrección de una recepción mal hecha. Solo el administrador puede guardarla (lo exige la base de datos)
// y siempre pide el motivo; el valor anterior queda en el historial de la unidad.
export default function UnitCorrection({ unit, installed, snapshot, locations, disabled, onCorrect }: {
  unit: WorkshopUnit; installed: WorkshopUnit[]; snapshot: Record<string, unknown> | undefined; locations: WorkshopLocation[]; disabled: boolean;
  onCorrect: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const text = (k: string) => String(snapshot?.[k] ?? "");
  return (
    <details>
      <summary className="cursor-pointer font-medium">Corregir datos de la recepción (solo administrador)</summary>
      <p className="mt-1 text-sm text-slate-600">Use esto si el equipo se recibió con datos equivocados. Cada cambio queda con su motivo, el valor anterior y quién lo hizo. Solo se envía lo que cambie.</p>
      <form
        className="mt-2 space-y-3"
        onSubmit={e => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const val = (k: string) => String(fd.get(k) ?? "").trim();
          const payload: Record<string, unknown> = { reason: val("reason") };
          if (val("cost") !== String(unit.acquisition_cost_cop ?? "")) payload.costCop = val("cost");
          if (val("condition") !== (unit.preliminary_condition ?? "")) payload.condition = val("condition");
          if (val("location") && val("location") !== (unit.location_id ?? "")) payload.locationId = val("location");
          for (const [key, current] of [["brand", text("brand")], ["model", text("model")], ["source", text("source")]] as const) if (val(key) !== current) payload[key] = val(key);
          if (val("serial") !== (unit.serial_number ?? "")) payload.serial = val("serial");
          const components = installed.flatMap(c => {
            const cap = val(`cap-${c.id}`), gen = val(`gen-${c.id}`);
            const attributes: Record<string, unknown> = {};
            if (cap !== String(c.component_attributes.capacityGb ?? "")) attributes.capacityGb = cap ? Number(cap) : null;
            if (gen !== String(c.component_attributes.generation ?? "")) attributes.generation = gen || null;
            return Object.keys(attributes).length ? [{ id: c.id, attributes }] : [];
          });
          if (components.length) payload.components = components;
          if (Object.keys(payload).length === 1) return;
          if (window.confirm("Guardar la corrección? Queda registrada con su motivo.")) void onCorrect(payload);
        }}
      >
        <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Costo de adquisición COP<input name="cost" inputMode="numeric" defaultValue={unit.acquisition_cost_cop ?? ""} className={field} /></label>
          <label className="text-sm font-medium">Clasificación<select name="condition" defaultValue={unit.preliminary_condition ?? ""} className={field}>
            {!unit.preliminary_condition && <option value="">Sin clasificar</option>}
            {Object.entries(conditionLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="text-sm font-medium">Ubicación<select name="location" defaultValue={unit.location_id ?? ""} className={field}>
            <option value="">Sin cambio</option>{locationChoices(locations).map(l => <option key={l.id} value={l.id}>{l.path}</option>)}</select></label>
          <label className="text-sm font-medium">Serial<input name="serial" defaultValue={unit.serial_number ?? ""} className={field} /></label>
          <label className="text-sm font-medium">Marca<input name="brand" defaultValue={text("brand")} className={field} /></label>
          <label className="text-sm font-medium">Modelo<input name="model" defaultValue={text("model")} className={field} /></label>
          <label className="text-sm font-medium sm:col-span-2">Procedencia / lote<input name="source" defaultValue={text("source")} className={field} /></label>
          {installed.filter(c => c.asset_kind !== "charger").map(c => (
            <div key={c.id} className="rounded-lg border bg-surface/40 p-3 sm:col-span-2">
              <p className="text-sm font-semibold">{c.unit_code} · {c.asset_kind === "ram" ? "Memoria RAM" : "Disco"}</p>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                <label className="text-sm">Capacidad GB<input name={`cap-${c.id}`} inputMode="decimal" defaultValue={String(c.component_attributes.capacityGb ?? "")} className={field} /></label>
                {c.asset_kind === "ram" && <label className="text-sm">Generación<select name={`gen-${c.id}`} defaultValue={String(c.component_attributes.generation ?? "")} className={field}>
                  <option value="">Sin dato</option>{["DDR2", "DDR3", "DDR3L", "DDR4", "DDR5"].map(g => <option key={g}>{g}</option>)}</select></label>}
              </div>
            </div>
          ))}
          <label className="text-sm font-medium sm:col-span-2">Motivo de la corrección (obligatorio)<input name="reason" required minLength={3} className={field} placeholder="Ej.: se digitó mal el costo al recibir" /></label>
          <div className="sm:col-span-2"><button className="rounded-lg bg-primary px-4 py-2 font-semibold text-white">Guardar corrección</button></div>
        </fieldset>
      </form>
    </details>
  );
}
