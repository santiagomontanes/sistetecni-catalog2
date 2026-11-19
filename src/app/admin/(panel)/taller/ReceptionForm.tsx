"use client";
import { useState } from "react";
import type { WorkshopLocation } from "@/lib/workshop/types";
import { locationChoices } from "@/lib/workshop/locations";
import Pick from "@/components/workshop/Pick";
import { ramCapacityOptions, ramGenerationOptions, ramFormatOptions, storageCapacityOptions, storageTechnologyOptions, storageInterfaceOptions, storageFormatOptions, chargerVoltageOptions, chargerCurrentOptions, chargerWattsOptions, screenInchOptions, screenTypeOptions, capacityLabel } from "@/lib/workshop/presets";
import { partKinds, partKindNames, descriptiveKinds, type PartKind } from "@/lib/workshop/partKinds";
const inputClass = "mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const sectionClass = "space-y-3 rounded-xl border border-border bg-surface/40 p-4";
const smallInput = "rounded-lg border border-border bg-white p-2";
function Step({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return <div className="flex items-start gap-3"><span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{n}</span><div><h3 className="font-semibold">{title}</h3>{hint && <p className="text-sm text-slate-600">{hint}</p>}</div></div>;
}
let nextKey = 1;
interface Part { _k?: number; kind: PartKind; notes?: string; capacityGb?: number | null; generation?: "DDR2" | "DDR3" | "DDR3L" | "DDR4" | "DDR5"; formFactor?: string; technology?: "HDD" | "SSD"; interface?: "SATA" | "NVMe" | "IDE" | "SAS" | "unknown"; connector?: string; voltage?: number | null; current?: number | null; watts?: number | null }
// Datos del equipo recibido justo antes. Se copian los comunes del lote; lo propio de cada equipo (serial, estado, pruebas, observaciones) queda en blanco.
export interface ReceptionTemplate { from: string; costCop?: string; locationId?: string; snapshot: Record<string, unknown> }
export default function ReceptionForm({ qr, locations, disabled, template, onBlank, onReceive }: { qr: string; locations: WorkshopLocation[]; disabled: boolean; template?: ReceptionTemplate; onBlank?: () => void; onReceive: (payload: Record<string, unknown>) => Promise<void> }) {
  const t = template?.snapshot ?? {};
  const text = (k: string) => (typeof t[k] === "string" ? (t[k] as string) : "");
  const [parts, setParts] = useState<Part[]>(() => (Array.isArray(t.components) ? (t.components as Part[]).filter(p => partKinds.includes(p?.kind)).map(p => ({ ...p, _k: nextKey++ })) : []));
  const [costError, setCostError] = useState('');
  const update = (i: number, changes: Partial<Part>) => setParts(v => v.map((p, j) => j === i ? { ...p, ...changes } : p));
  return <form onSubmit={e => {
    e.preventDefault(); const form = new FormData(e.currentTarget); const val = (k: string) => String(form.get(k) ?? "").trim();
    if (!val("existing") && !/^\d{1,15}$/.test(val("cost"))) { setCostError("Ingrese el costo de adquisición en pesos enteros (0 si fue donación)."); return; }
    setCostError("");
    void onReceive({ qrCode: qr, locationId: val("location"), condition: val("condition"), ...(val("cost") ? { costCop: val("cost") } : {}), ...(val("existing") ? { existingUnitId: val("existing") } : {}),
      snapshot: { brand: val("brand"), model: val("model"), serial: val("serial"), source: val("source"), physical: val("physical"), screenInches: val("inches") ? Number(val("inches")) : null, screenType: val("screenType"), screenNotes: val("screenNotes"), powersOn: val("powers"), video: val("video"), apparentBattery: val("battery"), chargerReceived: val("charger"), components: parts.map(({ _k, ...part }) => { void _k; return part; }), notes: val("notes") } });
  }} className="space-y-4 rounded-xl border border-border bg-white p-5 shadow-sm">
    <div><h2 className="text-lg font-semibold">Recepción · {qr}</h2><p className="text-sm text-slate-600">Registre lo observado en 4 pasos. Deje vacío lo desconocido. La evidencia original se conserva aunque luego cambie la configuración.</p></div>
    {template && <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"><span>Datos copiados de <strong>{template.from}</strong>: marca, modelo, procedencia, costo, pantalla, ubicación y piezas. Revíselos; el serial, las pruebas y las observaciones quedan en blanco. Cada pieza recibirá su propio código nuevo.</span>{onBlank && <button type="button" className="rounded-lg border border-primary/40 px-3 py-1.5 font-medium text-primary hover:bg-primary/10" onClick={onBlank}>Empezar en blanco</button>}</div>}
    <fieldset disabled={disabled} className="space-y-4">
      <section className={sectionClass}><Step n={1} title="¿Qué equipo es?" hint="Identificación y procedencia." /><div className="grid gap-3 sm:grid-cols-2">
      {[['brand','Marca'],['model','Modelo'],['serial','Serial (opcional)'],['source','Procedencia / lote'],['cost','Costo de adquisición COP (obligatorio; 0 si fue donación)'],['existing','STU de unidad ya recibida en Compras (opcional)']].map(([name, label]) => <label key={name} className="text-sm font-medium">{label}<input className={inputClass} name={name} defaultValue={name === 'cost' ? (template?.costCop ?? '') : name === 'brand' || name === 'model' || name === 'source' ? text(name) : ''} inputMode={name === 'cost' ? 'numeric' : undefined} /></label>)}
      </div></section>
      <section className={sectionClass}><Step n={2} title="¿En qué estado llegó?" hint="Estado físico, pantalla y funcionamiento." /><div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Estado físico<select name="physical" className={inputClass} defaultValue="unknown"><option value="unknown">Sin comprobar</option><option value="perfect">Perfecto</option><option value="good">Bueno</option><option value="bad">Malo</option></select></label>
      <label className="text-sm font-medium">Clasificación preliminar<select name="condition" className={inputClass}><option value="good">Bueno</option><option value="fair">Regular</option><option value="bad">Malo → bodega</option></select></label>
      <label className="text-sm font-medium">Pantalla (pulgadas)<Pick name="inches" label="Pantalla (pulgadas)" className={inputClass} value={typeof t.screenInches === "number" ? t.screenInches : null} options={screenInchOptions} empty="Sin comprobar" show={o => `${o}"`} onPick={() => undefined} /></label>
      <label className="text-sm font-medium">Tipo de pantalla<select name="screenType" className={inputClass} defaultValue={text("screenType") || "unknown"}><option value="unknown">Sin comprobar</option>{screenTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}{text("screenType") === "special" && <option value="special">Especial</option>}</select></label>
      <label className="text-sm font-medium">Observaciones de pantalla<input name="screenNotes" defaultValue={text("screenNotes")} className={inputClass} /></label>
      {[["powers","Prende"],["video","Da video"]].map(([name,label]) => <label key={name} className="text-sm font-medium">{label}<select name={name} defaultValue="unchecked" className={inputClass}><option value="unchecked">Sin comprobar</option><option value="yes">Sí</option><option value="no">No</option></select></label>)}
      <label className="text-sm font-medium">Batería aparente (provisional)<input name="battery" className={inputClass} /></label>
      <label className="text-sm font-medium">Cargador recibido<select name="charger" defaultValue="unchecked" className={inputClass}><option value="unchecked">Sin comprobar</option><option value="yes">Sí</option><option value="no">No</option><option value="not_applicable">No aplica</option></select></label>
      </div></section>
      <section className={sectionClass}><Step n={3} title="Piezas que trae instaladas" hint="RAM, disco, cargador, batería, pantalla, ratón, forro o teclado que llegan con el equipo (no cuentan como repuesto). Cada pieza recibe su propio código y su etiqueta QR." /><div className="space-y-2">{parts.map((part, i) => <div key={part._k} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white p-3">
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-semibold text-primary">{partKindNames[part.kind]} #{i + 1}</span>
        {part.kind === "ram" && <>
          <Pick label="Capacidad GB" className={smallInput} value={part.capacityGb} options={ramCapacityOptions} empty="Capacidad desconocida" show={o => `${o} GB`} onPick={v => update(i, { capacityGb: v ? Number(v) : null })} />
          <Pick label="Generación RAM" className={smallInput} value={part.generation} options={ramGenerationOptions} empty="DDR desconocida" onPick={v => update(i, { generation: (v || undefined) as Part["generation"] })} />
          <Pick label="Formato" className={smallInput} value={part.formFactor} options={ramFormatOptions} empty="Formato desconocido" onPick={v => update(i, { formFactor: v })} /></>}
        {part.kind === "storage" && <>
          <Pick label="Capacidad GB" className={smallInput} value={part.capacityGb} options={storageCapacityOptions} empty="Capacidad desconocida" show={o => capacityLabel(Number(o))} onPick={v => update(i, { capacityGb: v ? Number(v) : null })} />
          <Pick label="Tecnología disco" className={smallInput} value={part.technology} options={storageTechnologyOptions} empty="Tecnología desconocida" onPick={v => update(i, { technology: (v || undefined) as Part["technology"] })} />
          <Pick label="Interfaz disco" className={smallInput} value={part.interface} options={storageInterfaceOptions} empty="Interfaz desconocida" onPick={v => update(i, { interface: (v || undefined) as Part["interface"] })} />
          <Pick label="Formato" className={smallInput} value={part.formFactor} options={storageFormatOptions} empty="Formato desconocido" onPick={v => update(i, { formFactor: v })} /></>}
        {part.kind === "charger" && <>
          <Pick label="Voltaje (V)" className={smallInput} value={part.voltage} options={chargerVoltageOptions} empty="Voltaje desconocido" show={o => `${o} V`} onPick={v => update(i, { voltage: v ? Number(v) : null })} />
          <Pick label="Corriente (A)" className={smallInput} value={part.current} options={chargerCurrentOptions} empty="Corriente desconocida" show={o => `${o} A`} onPick={v => update(i, { current: v ? Number(v) : null })} />
          <Pick label="Potencia (W)" className={smallInput} value={part.watts} options={chargerWattsOptions} empty="Potencia desconocida" show={o => `${o} W`} onPick={v => update(i, { watts: v ? Number(v) : null })} /></>}
        {descriptiveKinds.includes(part.kind) && <input aria-label="Descripción" className={`w-72 ${smallInput}`} placeholder="Opcional: ej. batería 6 celdas, mouse inalámbrico" defaultValue={part.notes ?? ""} onChange={e => update(i, { notes: e.target.value })} />}
        <button type="button" className="ml-auto rounded-lg px-2 py-1 text-sm text-red-700 hover:bg-red-50" onClick={() => setParts(v => v.filter((_, j) => i !== j))}>Quitar fila</button>
      </div>)}<div className="flex flex-wrap gap-2">{partKinds.map(kind => <button type="button" key={kind} className="rounded-lg border-2 border-dashed border-primary/40 px-3 py-2 font-medium text-primary hover:bg-primary/5" onClick={() => setParts(v => [...v, { kind, _k: nextKey++ }])}>Agregar {kind === "ram" ? "RAM" : partKindNames[kind].toLowerCase()}</button>)}</div></div>
      </section>
      <section className={sectionClass}><Step n={4} title="¿Dónde queda y algo más?" hint="Ubicación física y observaciones." /><div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Ubicación física<select name="location" required defaultValue={template?.locationId ?? ""} className={inputClass}><option value="">Seleccione</option>{locationChoices(locations).map(l => <option key={l.id} value={l.id}>{l.path}</option>)}</select></label>
      <label className="text-sm font-medium sm:col-span-2">Observaciones<textarea name="notes" maxLength={4000} rows={2} className={inputClass} /></label></div></section>
      {costError && <p role="alert" className="text-sm font-medium text-red-700">{costError}</p>}
      <p className="text-sm text-slate-600">Si enlaza una unidad de Compras se conservan su costo y su STU. Tras guardar podrá adjuntar fotos privadas a la ficha.</p>
      <button className="w-full rounded-lg bg-primary px-4 py-3 text-base font-semibold text-white shadow hover:opacity-90 disabled:opacity-50 sm:w-auto" type="submit">Registrar y asignar QR</button>
    </fieldset>
  </form>;
}
