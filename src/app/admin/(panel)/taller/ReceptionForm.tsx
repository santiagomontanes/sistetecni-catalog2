"use client";
import { useState } from "react";
import type { WorkshopLocation } from "@/lib/workshop/types";
const inputClass = "w-full rounded border px-3 py-2";
interface Part { kind: "ram" | "storage" | "charger"; capacityGb?: number | null; generation?: "DDR2" | "DDR3" | "DDR3L" | "DDR4" | "DDR5"; formFactor?: string; technology?: "HDD" | "SSD"; interface?: "SATA" | "NVMe" | "IDE" | "SAS" | "unknown"; connector?: string; voltage?: number | null; current?: number | null; watts?: number | null }
export default function ReceptionForm({ qr, locations, disabled, onReceive }: { qr: string; locations: WorkshopLocation[]; disabled: boolean; onReceive: (payload: Record<string, unknown>) => Promise<void> }) {
  const [parts, setParts] = useState<Part[]>([]);
  const update = (i: number, changes: Partial<Part>) => setParts(v => v.map((p, j) => j === i ? { ...p, ...changes } : p));
  return <form onSubmit={e => {
    e.preventDefault(); const form = new FormData(e.currentTarget); const val = (k: string) => String(form.get(k) ?? "").trim();
    void onReceive({ qrCode: qr, locationId: val("location"), condition: val("condition"), ...(val("cost") ? { costCop: val("cost") } : {}), ...(val("existing") ? { existingUnitId: val("existing") } : {}),
      snapshot: { brand: val("brand"), model: val("model"), serial: val("serial"), source: val("source"), physical: val("physical"), screenInches: val("inches") ? Number(val("inches")) : null, screenType: val("screenType"), screenNotes: val("screenNotes"), powersOn: val("powers"), video: val("video"), apparentBattery: val("battery"), chargerReceived: val("charger"), components: parts, notes: val("notes") } });
  }} className="space-y-4 rounded border bg-white p-4">
    <h2 className="text-lg font-semibold">Recepción · {qr}</h2><p className="text-sm text-slate-600">Registre lo observado. Deje vacío lo desconocido. La evidencia original se conserva aunque luego cambie la configuración.</p>
    <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
      {[['brand','Marca'],['model','Modelo'],['serial','Serial (opcional)'],['source','Procedencia / lote'],['cost','Costo de adquisición COP (opcional)'],['existing','STU de unidad ya recibida en Compras (opcional)']].map(([name, label]) => <label key={name}>{label}<input className={inputClass} name={name} inputMode={name === 'cost' ? 'numeric' : undefined} /></label>)}
      <label>Estado físico<select name="physical" className={inputClass} defaultValue="unknown"><option value="unknown">Sin comprobar</option><option value="perfect">Perfecto</option><option value="good">Bueno</option><option value="bad">Malo</option></select></label>
      <label>Clasificación preliminar<select name="condition" className={inputClass}><option value="good">Bueno</option><option value="fair">Regular</option><option value="bad">Malo → bodega</option></select></label>
      <label>Pantalla (pulgadas)<input name="inches" type="number" step="0.1" min="1" max="100" className={inputClass} /></label>
      <label>Tipo de pantalla<select name="screenType" className={inputClass} defaultValue="unknown"><option value="unknown">Desconocido</option><option value="standard">Estándar</option><option value="slim">Slim</option><option value="special">Especial</option></select></label>
      <label>Observaciones de pantalla<input name="screenNotes" className={inputClass} /></label>
      {[["powers","Prende"],["video","Da video"]].map(([name,label]) => <label key={name}>{label}<select name={name} defaultValue="unchecked" className={inputClass}><option value="unchecked">Sin comprobar</option><option value="yes">Sí</option><option value="no">No</option></select></label>)}
      <label>Batería aparente (provisional)<input name="battery" className={inputClass} /></label>
      <label>Cargador recibido<select name="charger" defaultValue="unchecked" className={inputClass}><option value="unchecked">Sin comprobar</option><option value="yes">Sí</option><option value="no">No</option><option value="not_applicable">No aplica</option></select></label>
      <label>Ubicación física<select name="location" required className={inputClass}><option value="">Seleccione</option>{locations.filter(l => l.active).map(l => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}</select></label>
      <div className="sm:col-span-2 space-y-2"><p>Componentes recibidos instalados (no disponibles como repuesto)</p>{parts.map((part, i) => <div key={i} className="flex flex-wrap gap-2 rounded border p-2">
        <span>{part.kind === "ram" ? "RAM" : part.kind === "storage" ? "Disco" : "Cargador"} #{i + 1}</span>
        {part.kind !== "charger" && <input aria-label="Capacidad GB" className="w-32 rounded border p-2" type="number" min="0.1" step="0.1" placeholder="GB desconocidos" onChange={e => update(i, { capacityGb: e.target.value ? Number(e.target.value) : null })} />}
        {part.kind === "ram" && <select aria-label="Generación RAM" className="rounded border p-2" onChange={e => update(i, { generation: (e.target.value || undefined) as Part["generation"] })}><option value="">DDR desconocida</option>{["DDR2","DDR3","DDR3L","DDR4","DDR5"].map(v => <option key={v}>{v}</option>)}</select>}
        {part.kind === "storage" && <><select aria-label="Tecnología disco" className="rounded border p-2" onChange={e => update(i, { technology: (e.target.value || undefined) as Part["technology"] })}><option value="">Tecnología desconocida</option><option>HDD</option><option>SSD</option></select><select aria-label="Interfaz disco" className="rounded border p-2" onChange={e => update(i, { interface: (e.target.value || undefined) as Part["interface"] })}><option value="">Interfaz desconocida</option>{["SATA","NVMe","IDE","SAS"].map(v => <option key={v}>{v}</option>)}</select></>}
        {part.kind === "charger" && ([['voltage','Voltaje (V)'],['current','Corriente (A)'],['watts','Potencia (W)']] as const).map(([key,label]) => <input key={key} aria-label={label} className="w-32 rounded border p-2" type="number" min="0.01" step="any" placeholder={label} onChange={e => update(i, { [key]: e.target.value ? Number(e.target.value) : null })} />)}
        <input aria-label="Formato" className="w-36 rounded border p-2" placeholder={part.kind === "ram" ? "SO-DIMM / DIMM" : "2.5 / M.2 / otro"} onChange={e => update(i, { formFactor: e.target.value })} />
        <input aria-label="Conector" className="w-36 rounded border p-2" placeholder="Conector / llave" onChange={e => update(i, { connector: e.target.value })} /><button type="button" className="text-red-700" onClick={() => setParts(v => v.filter((_, j) => i !== j))}>Quitar fila</button>
      </div>)}<div className="flex gap-2">{(["ram","storage","charger"] as const).map(kind => <button type="button" key={kind} className="rounded border px-3 py-2" onClick={() => setParts(v => [...v, { kind }])}>Agregar {kind === "ram" ? "RAM" : kind === "storage" ? "disco" : "cargador"}</button>)}</div></div>
      <label className="sm:col-span-2">Observaciones<textarea name="notes" maxLength={4000} className={inputClass} /></label>
      <p className="text-sm text-slate-600 sm:col-span-2">Si enlaza una unidad de Compras se conservan su costo y su STU. Tras guardar podrá adjuntar fotos privadas a la ficha.</p>
      <button className="rounded bg-slate-900 px-4 py-2 text-white" type="submit">Registrar y asignar QR</button>
    </fieldset>
  </form>;
}
