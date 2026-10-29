"use client";
import { useState } from "react";
import type { WorkshopLocation } from "@/lib/workshop/types";
import { locationChoices } from "@/lib/workshop/locations";
const inputClass = "mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const sectionClass = "space-y-3 rounded-xl border border-border bg-surface/40 p-4";
const smallInput = "rounded-lg border border-border bg-white p-2";
function Step({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return <div className="flex items-start gap-3"><span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{n}</span><div><h3 className="font-semibold">{title}</h3>{hint && <p className="text-sm text-slate-600">{hint}</p>}</div></div>;
}
interface Part { kind: "ram" | "storage" | "charger"; capacityGb?: number | null; generation?: "DDR2" | "DDR3" | "DDR3L" | "DDR4" | "DDR5"; formFactor?: string; technology?: "HDD" | "SSD"; interface?: "SATA" | "NVMe" | "IDE" | "SAS" | "unknown"; connector?: string; voltage?: number | null; current?: number | null; watts?: number | null }
export default function ReceptionForm({ qr, locations, disabled, onReceive }: { qr: string; locations: WorkshopLocation[]; disabled: boolean; onReceive: (payload: Record<string, unknown>) => Promise<void> }) {
  const [parts, setParts] = useState<Part[]>([]);
  const update = (i: number, changes: Partial<Part>) => setParts(v => v.map((p, j) => j === i ? { ...p, ...changes } : p));
  return <form onSubmit={e => {
    e.preventDefault(); const form = new FormData(e.currentTarget); const val = (k: string) => String(form.get(k) ?? "").trim();
    void onReceive({ qrCode: qr, locationId: val("location"), condition: val("condition"), ...(val("cost") ? { costCop: val("cost") } : {}), ...(val("existing") ? { existingUnitId: val("existing") } : {}),
      snapshot: { brand: val("brand"), model: val("model"), serial: val("serial"), source: val("source"), physical: val("physical"), screenInches: val("inches") ? Number(val("inches")) : null, screenType: val("screenType"), screenNotes: val("screenNotes"), powersOn: val("powers"), video: val("video"), apparentBattery: val("battery"), chargerReceived: val("charger"), components: parts, notes: val("notes") } });
  }} className="space-y-4 rounded-xl border border-border bg-white p-5 shadow-sm">
    <div><h2 className="text-lg font-semibold">Recepción · {qr}</h2><p className="text-sm text-slate-600">Registre lo observado en 4 pasos. Deje vacío lo desconocido. La evidencia original se conserva aunque luego cambie la configuración.</p></div>
    <fieldset disabled={disabled} className="space-y-4">
      <section className={sectionClass}><Step n={1} title="¿Qué equipo es?" hint="Identificación y procedencia." /><div className="grid gap-3 sm:grid-cols-2">
      {[['brand','Marca'],['model','Modelo'],['serial','Serial (opcional)'],['source','Procedencia / lote'],['cost','Costo de adquisición COP (opcional)'],['existing','STU de unidad ya recibida en Compras (opcional)']].map(([name, label]) => <label key={name} className="text-sm font-medium">{label}<input className={inputClass} name={name} inputMode={name === 'cost' ? 'numeric' : undefined} /></label>)}
      </div></section>
      <section className={sectionClass}><Step n={2} title="¿En qué estado llegó?" hint="Estado físico, pantalla y funcionamiento." /><div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Estado físico<select name="physical" className={inputClass} defaultValue="unknown"><option value="unknown">Sin comprobar</option><option value="perfect">Perfecto</option><option value="good">Bueno</option><option value="bad">Malo</option></select></label>
      <label className="text-sm font-medium">Clasificación preliminar<select name="condition" className={inputClass}><option value="good">Bueno</option><option value="fair">Regular</option><option value="bad">Malo → bodega</option></select></label>
      <label className="text-sm font-medium">Pantalla (pulgadas)<input name="inches" type="number" step="0.1" min="1" max="100" className={inputClass} /></label>
      <label className="text-sm font-medium">Tipo de pantalla<select name="screenType" className={inputClass} defaultValue="unknown"><option value="unknown">Desconocido</option><option value="standard">Estándar</option><option value="slim">Slim</option><option value="special">Especial</option></select></label>
      <label className="text-sm font-medium">Observaciones de pantalla<input name="screenNotes" className={inputClass} /></label>
      {[["powers","Prende"],["video","Da video"]].map(([name,label]) => <label key={name} className="text-sm font-medium">{label}<select name={name} defaultValue="unchecked" className={inputClass}><option value="unchecked">Sin comprobar</option><option value="yes">Sí</option><option value="no">No</option></select></label>)}
      <label className="text-sm font-medium">Batería aparente (provisional)<input name="battery" className={inputClass} /></label>
      <label className="text-sm font-medium">Cargador recibido<select name="charger" defaultValue="unchecked" className={inputClass}><option value="unchecked">Sin comprobar</option><option value="yes">Sí</option><option value="no">No</option><option value="not_applicable">No aplica</option></select></label>
      </div></section>
      <section className={sectionClass}><Step n={3} title="Piezas que trae instaladas" hint="RAM, disco o cargador recibidos dentro del equipo (no cuentan como repuesto). Cada pieza recibe su propio STU." /><div className="space-y-2">{parts.map((part, i) => <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white p-3">
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-semibold text-primary">{part.kind === "ram" ? "RAM" : part.kind === "storage" ? "Disco" : "Cargador"} #{i + 1}</span>
        {part.kind !== "charger" && <input aria-label="Capacidad GB" className={`w-32 ${smallInput}`} type="number" min="0.1" step="0.1" placeholder="GB desconocidos" onChange={e => update(i, { capacityGb: e.target.value ? Number(e.target.value) : null })} />}
        {part.kind === "ram" && <select aria-label="Generación RAM" className={smallInput} onChange={e => update(i, { generation: (e.target.value || undefined) as Part["generation"] })}><option value="">DDR desconocida</option>{["DDR2","DDR3","DDR3L","DDR4","DDR5"].map(v => <option key={v}>{v}</option>)}</select>}
        {part.kind === "storage" && <><select aria-label="Tecnología disco" className={smallInput} onChange={e => update(i, { technology: (e.target.value || undefined) as Part["technology"] })}><option value="">Tecnología desconocida</option><option>HDD</option><option>SSD</option></select><select aria-label="Interfaz disco" className={smallInput} onChange={e => update(i, { interface: (e.target.value || undefined) as Part["interface"] })}><option value="">Interfaz desconocida</option>{["SATA","NVMe","IDE","SAS"].map(v => <option key={v}>{v}</option>)}</select></>}
        {part.kind === "charger" && ([['voltage','Voltaje (V)'],['current','Corriente (A)'],['watts','Potencia (W)']] as const).map(([key,label]) => <input key={key} aria-label={label} className={`w-32 ${smallInput}`} type="number" min="0.01" step="any" placeholder={label} onChange={e => update(i, { [key]: e.target.value ? Number(e.target.value) : null })} />)}
        <input aria-label="Formato" className={`w-36 ${smallInput}`} placeholder={part.kind === "ram" ? "SO-DIMM / DIMM" : "2.5 / M.2 / otro"} onChange={e => update(i, { formFactor: e.target.value })} />
        <input aria-label="Conector" className={`w-36 ${smallInput}`} placeholder="Conector / llave" onChange={e => update(i, { connector: e.target.value })} /><button type="button" className="ml-auto rounded-lg px-2 py-1 text-sm text-red-700 hover:bg-red-50" onClick={() => setParts(v => v.filter((_, j) => i !== j))}>Quitar fila</button>
      </div>)}<div className="flex flex-wrap gap-2">{(["ram","storage","charger"] as const).map(kind => <button type="button" key={kind} className="rounded-lg border-2 border-dashed border-primary/40 px-3 py-2 font-medium text-primary hover:bg-primary/5" onClick={() => setParts(v => [...v, { kind }])}>Agregar {kind === "ram" ? "RAM" : kind === "storage" ? "disco" : "cargador"}</button>)}</div></div>
      </section>
      <section className={sectionClass}><Step n={4} title="¿Dónde queda y algo más?" hint="Ubicación física y observaciones." /><div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Ubicación física<select name="location" required className={inputClass}><option value="">Seleccione</option>{locationChoices(locations).map(l => <option key={l.id} value={l.id}>{l.path}</option>)}</select></label>
      <label className="text-sm font-medium sm:col-span-2">Observaciones<textarea name="notes" maxLength={4000} rows={2} className={inputClass} /></label></div></section>
      <p className="text-sm text-slate-600">Si enlaza una unidad de Compras se conservan su costo y su STU. Tras guardar podrá adjuntar fotos privadas a la ficha.</p>
      <button className="w-full rounded-lg bg-primary px-4 py-3 text-base font-semibold text-white shadow hover:opacity-90 disabled:opacity-50 sm:w-auto" type="submit">Registrar y asignar QR</button>
    </fieldset>
  </form>;
}
