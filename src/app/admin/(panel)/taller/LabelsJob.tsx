"use client";
import { useEffect, useRef, useState } from "react";
import { callAdminAction } from "@/lib/callAdminAction";
import { createWorkshopLabelsJobPdf, type LabelsJobResult } from "@/app/admin/taller/actions";
import { sizes, captions, pdfUrl, type LabelSizeId } from "./labelOptions";

const field = "rounded border px-3 py-2";
const button = "rounded border px-3 py-2 disabled:opacity-50";
interface Line { id: number; mode: "new" | "reprint"; count: number; codes: string; from: string; to: string; size: LabelSizeId; caption: string; layout: "square" | "strip"; qrCm: number }
const blank = (id: number, over: Partial<Line> = {}): Line => ({ id, mode: "new", count: 10, codes: "", from: "", to: "", size: "medium", caption: "", layout: "square", qrCm: 4, ...over });

// Una sola hoja de trabajo: varias líneas (p. ej. 10 QR de equipos, 10 de memorias y 10 reimpresos) en un único PDF.
export default function LabelsJob({ enabled, isAdmin, onDone }: { enabled: boolean; isAdmin: boolean; onDone: () => void }) {
  const next = useRef(3);
  const [lines, setLines] = useState<Line[]>([blank(1, { size: "medium", caption: "Equipo" }), blank(2, { size: "ram", caption: "" })]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [pdf, setPdf] = useState<{ url: string; info: LabelsJobResult }>();
  const frame = useRef<HTMLIFrameElement>(null); const current = useRef<string | undefined>(undefined);
  useEffect(() => () => { if (current.current) URL.revokeObjectURL(current.current); }, []);
  const update = (id: number, over: Partial<Line>) => setLines(ls => ls.map(l => l.id === id ? { ...l, ...over } : l));
  const reserves = lines.some(l => l.mode === "new");
  const planned = lines.reduce((n, l) => n + (l.mode === "new" ? l.count : 0), 0);

  async function generate() {
    if (busy) return; setBusy(true); setError("");
    try {
      const payload = lines.map(l => {
        const look = { size: l.size, ...(l.caption.trim() ? { caption: l.caption.trim() } : {}), ...(l.size === "custom" ? { layout: l.layout, qrCm: Math.min(8, Math.max(0.6, l.qrCm || 4)) } : {}) };
        return l.mode === "new" ? { mode: "new" as const, count: l.count, ...look }
          : { mode: "reprint" as const, codes: l.codes, ...(l.from ? { from: Number(l.from) } : {}), ...(l.to ? { to: Number(l.to) } : {}), ...look };
      });
      const result = await callAdminAction(createWorkshopLabelsJobPdf, { lines: payload });
      if (!result.ok) { setError(result.message); return; }
      if (current.current) URL.revokeObjectURL(current.current);
      const url = pdfUrl(result.data.pdfBase64); current.current = url;
      setPdf({ url, info: { ...result.data, pdfBase64: "" } }); onDone();
    } catch { setError("No se pudo generar el PDF. Si reservó números, aparecen en «Lotes anteriores» para reimprimir."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-3 rounded border border-primary/40 bg-slate-50 p-3">
    <div><h3 className="font-semibold">Hoja combinada: varios tipos en un solo PDF</h3>
      <p className="text-sm text-slate-600">Agregue una línea por cada tipo: por ejemplo 10 QR nuevos de equipos, 10 nuevos de memorias RAM y 10 reimpresiones. Cada línea usa su propio tamaño y empieza en una hoja nueva. Los números «nuevos» se reservan al generar.</p></div>
    {lines.map((l, i) => <fieldset key={l.id} className="flex flex-wrap items-end gap-3 rounded border bg-white p-3"><legend className="px-1 text-xs font-medium text-slate-500">Línea {i + 1}</legend>
      <label className="text-sm">Qué imprimir<select aria-label={`Qué imprimir, línea ${i + 1}`} value={l.mode} onChange={e => update(l.id, { mode: e.target.value as Line["mode"] })} className={`${field} block`}><option value="new">QR nuevos (reserva números)</option><option value="reprint">Reimprimir QR anteriores</option></select></label>
      {l.mode === "new"
        ? <label className="text-sm">Cantidad<input aria-label={`Cantidad, línea ${i + 1}`} type="number" min={1} max={200} value={l.count} onChange={e => update(l.id, { count: Math.max(1, Math.min(200, Number(e.target.value) || 1)) })} className={`${field} block w-24`} /></label>
        : <>
          <label className="text-sm">STU (varios, con espacio o coma)<textarea aria-label={`STU de la hoja, línea ${i + 1}`} rows={2} value={l.codes} onChange={e => update(l.id, { codes: e.target.value })} placeholder="STU-000225, 27" className={`${field} block w-56`} /></label>
          <label className="text-sm">o rango: desde<input aria-label={`Rango desde, línea ${i + 1}`} inputMode="numeric" value={l.from} onChange={e => update(l.id, { from: e.target.value.replace(/\D/g, "") })} placeholder="225" className={`${field} block w-24`} /></label>
          <label className="text-sm">hasta<input aria-label={`Rango hasta, línea ${i + 1}`} inputMode="numeric" value={l.to} onChange={e => update(l.id, { to: e.target.value.replace(/\D/g, "") })} placeholder="234" className={`${field} block w-24`} /></label></>}
      <label className="text-sm">Tamaño<select aria-label={`Tamaño, línea ${i + 1}`} value={l.size} onChange={e => update(l.id, { size: e.target.value as LabelSizeId })} className={`${field} block`}>{sizes.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
      <label className="text-sm">Texto (opcional)<input aria-label={`Texto, línea ${i + 1}`} list="etiqueta-textos-job" maxLength={24} value={l.caption} onChange={e => update(l.id, { caption: e.target.value })} className={`${field} block w-40`} /></label>
      {l.size === "custom" && <>
        <label className="text-sm">Disposición<select value={l.layout} onChange={e => update(l.id, { layout: e.target.value as Line["layout"] })} className={`${field} block`}><option value="square">Cuadrada</option><option value="strip">Horizontal</option></select></label>
        <label className="text-sm">QR (cm)<input type="number" min={0.6} max={8} step={0.1} value={l.qrCm} onChange={e => update(l.id, { qrCm: Number(e.target.value) })} className={`${field} block w-24`} /></label></>}
      {lines.length > 1 && <button type="button" className="text-sm underline" onClick={() => setLines(ls => ls.filter(x => x.id !== l.id))}>Quitar línea</button>}
    </fieldset>)}
    <datalist id="etiqueta-textos-job">{captions.map(c => <option key={c} value={c} />)}</datalist>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={lines.length >= 10} className={button} onClick={() => setLines(ls => [...ls, blank(next.current++)])}>Agregar línea</button>
      <button type="button" disabled={busy || !enabled || (reserves && !isAdmin)} className={`${button} bg-slate-900 text-white`} onClick={() => void generate()}>{busy ? "Generando…" : reserves ? `Generar hoja (reserva ${planned} números nuevos)` : "Generar hoja de reimpresión"}</button>
      {reserves && !isAdmin && <span className="text-xs text-amber-900">Solo el administrador reserva números nuevos; use líneas de reimpresión.</span>}
    </div>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {pdf && <div className="space-y-2">
      <p className="text-sm"><strong>{pdf.info.count} etiquetas en total</strong>{pdf.info.reserved ? ` · ${pdf.info.reserved} números nuevos reservados` : ""}.</p>
      <ul className="list-disc pl-5 text-sm text-slate-700">{pdf.info.lines.map((x, i) => <li key={i}>{x.count} · {x.label}</li>)}</ul>
      <div className="flex flex-wrap gap-2">
        <button className={button} onClick={() => frame.current?.contentWindow?.print()}>Imprimir</button>
        <a className={button} href={pdf.url} download="etiquetas-hoja-combinada.pdf">Descargar PDF</a>
        <a className={button} href={pdf.url} target="_blank" rel="noreferrer">Abrir en otra pestaña</a>
      </div>
      <iframe ref={frame} title="Vista previa de la hoja combinada" src={pdf.url} className="h-[70vh] w-full rounded border" />
    </div>}
  </div>;
}
