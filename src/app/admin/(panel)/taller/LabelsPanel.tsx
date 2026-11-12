"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { callAdminAction } from "@/lib/callAdminAction";
import { getErpProfile } from "@/supabase/auth";
import { sizes, captions, pdfUrl, type LabelSizeId } from "./labelOptions";
import LabelsJob from "./LabelsJob";
import { createWorkshopLabelsPdf, listWorkshopLabelBatches, reprintUnitLabelsPdf, reprintWorkshopLabelsPdf, type LabelBatch, type LabelsPdfResult } from "@/app/admin/taller/actions";

const field = "rounded border px-3 py-2";
const button = "rounded border px-3 py-2 disabled:opacity-50";

export default function LabelsPanel({ enabled, hasLocations, presetSize }: { enabled: boolean; hasLocations: boolean; presetSize?: { size: LabelSizeId; n: number } }) {
  const [count, setCount] = useState(10); const [size, setSize] = useState<LabelSizeId>("medium");
  useEffect(() => { if (presetSize) setSize(presetSize.size); }, [presetSize]);
  const [caption, setCaption] = useState(""); const [layout, setLayout] = useState<"square" | "strip">("square"); const [qrCm, setQrCm] = useState(4);
  const look = { size, caption: caption.trim() || undefined, ...(size === "custom" ? { layout, qrCm: Math.min(8, Math.max(0.6, qrCm || 4)) } : {}) };
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [pdf, setPdf] = useState<{ url: string; info: LabelsPdfResult }>();
  const [codes, setCodes] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [batches, setBatches] = useState<LabelBatch[]>([]);
  const frame = useRef<HTMLIFrameElement>(null); const current = useRef<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    const result = await callAdminAction(listWorkshopLabelBatches, {});
    if (result.ok) setBatches(result.data);
  }, []);
  useEffect(() => { void getErpProfile().then(p => setIsAdmin(p?.role === "admin")); }, []);
  useEffect(() => { void refresh(); return () => { if (current.current) URL.revokeObjectURL(current.current); }; }, [refresh]);

  function show(info: LabelsPdfResult) {
    if (current.current) URL.revokeObjectURL(current.current);
    const url = pdfUrl(info.pdfBase64); current.current = url;
    setPdf({ url, info: { ...info, pdfBase64: "" } });
  }
  async function run(work: () => Promise<{ ok: true; data: LabelsPdfResult } | { ok: false; message: string }>) {
    if (busy) return; setBusy(true); setError("");
    try {
      const result = await work();
      if (!result.ok) { setError(result.message); return; }
      show(result.data); await refresh();
    } catch { setError("No se pudo generar el PDF. Revise la conexión; si reservó números, aparecen en «Lotes anteriores» para reimprimir."); }
    finally { setBusy(false); }
  }
  const fileName = pdf ? `etiquetas-${pdf.info.first}-a-${pdf.info.last}.pdf` : "etiquetas.pdf";
  return <section id="etiquetas-qr" className="space-y-4 rounded border bg-white p-4">
    <div><h2 className="text-lg font-semibold">1. Etiquetas QR</h2>
      <p className="text-sm text-slate-600">Cada etiqueta es un código STU único: el mismo que tendrá el equipo en todo el sistema. Al generar se <strong>reservan</strong> esos números y se abre el PDF para revisar e imprimir. Si lo pierde, lo recupera en «Lotes anteriores».</p></div>
    {!hasLocations && <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">Aún no hay ubicaciones. Puede imprimir etiquetas, pero para recibir equipos primero cree al menos una ubicación (paso 2).</p>}
    <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void run(() => callAdminAction(createWorkshopLabelsPdf, { count, ...look })); }}>
      <label className="text-sm">¿Cuántos equipos llegaron?<input type="number" min={1} max={200} value={count} onChange={e => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} className={`${field} block w-32`} /></label>
      <label className="text-sm">Tamaño de etiqueta<select value={size} onChange={e => setSize(e.target.value as typeof size)} className={`${field} block`}>{sizes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="text-sm">Texto en la etiqueta (opcional)<input list="etiqueta-textos" maxLength={24} value={caption} onChange={e => setCaption(e.target.value)} placeholder="Disco, Cargador…" className={`${field} block w-48`} /></label>
      <datalist id="etiqueta-textos">{captions.map(c => <option key={c} value={c} />)}</datalist>
      {size === "custom" && <>
        <label className="text-sm">Disposición<select value={layout} onChange={e => setLayout(e.target.value as typeof layout)} className={`${field} block`}><option value="square">Cuadrada (código debajo)</option><option value="strip">Horizontal (código al lado)</option></select></label>
        <label className="text-sm">Lado del QR (cm, 0,6 a 8)<input type="number" min={0.6} max={8} step={0.1} value={qrCm} onChange={e => setQrCm(Number(e.target.value))} className={`${field} block w-28`} /></label>
      </>}
      <button disabled={busy || !enabled || !isAdmin} className={`${button} bg-slate-900 text-white`}>{busy ? "Generando…" : `Generar ${count} QR y ver PDF`}</button>
    </form>
    <p className="text-xs text-slate-500">El QR siempre contiene solo el código STU. El tamaño y el texto de arriba también se usan al reimprimir.</p>
    <LabelsJob enabled={enabled} isAdmin={isAdmin} onDone={refresh} />
    <details className="rounded border bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-medium">Reimprimir etiquetas (registradas o aún sin usar)</summary>
      <p className="mt-2 text-slate-600">Para una etiqueta rota, borrada o que no se lee. Se imprime el mismo STU de la unidad; no se reservan números nuevos.</p>
      <form className="mt-2 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void run(() => callAdminAction(reprintUnitLabelsPdf, { codes, from: from ? Number(from) : undefined, to: to ? Number(to) : undefined, ...look })); }}>
        <label>STU a reimprimir (varios, separados por espacio o coma)<textarea value={codes} onChange={e => setCodes(e.target.value)} rows={2} placeholder="STU-000225, 27, STU-000230" className={`${field} block w-72`} /></label>
        <label>O rango: desde<input inputMode="numeric" value={from} onChange={e => setFrom(e.target.value.replace(/\D/g, ""))} placeholder="225" className={`${field} block w-24`} /></label>
        <label>hasta<input inputMode="numeric" value={to} onChange={e => setTo(e.target.value.replace(/\D/g, ""))} placeholder="240" className={`${field} block w-24`} /></label>
        <button disabled={busy || !enabled || (!codes.trim() && !from && !to)} className={`${button} bg-slate-900 text-white`}>{busy ? "Generando…" : "Ver PDF para reimprimir"}</button>
      </form></details>
    {!isAdmin && <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">Solo el administrador puede generar números QR nuevos (también desde «Ingreso de remate»). Puede reimprimir etiquetas de equipos ya registrados.</p>}
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {pdf && <div className="space-y-2">
      <p className="text-sm"><strong>{pdf.info.count} etiquetas</strong> · {pdf.info.first} a {pdf.info.last}. Revise la hoja y luego imprima. Corte por las líneas punteadas.</p>
      <div className="flex flex-wrap gap-2">
        <button className={button} onClick={() => frame.current?.contentWindow?.print()}>Imprimir</button>
        <a className={button} href={pdf.url} download={fileName}>Descargar PDF</a>
        <a className={button} href={pdf.url} target="_blank" rel="noreferrer">Abrir en otra pestaña</a>
      </div>
      <iframe ref={frame} title="Vista previa de etiquetas" src={pdf.url} className="h-[70vh] w-full rounded border" />
      <p className="text-xs text-slate-500">¿Prefiere Word? Descargue el PDF y ábralo con Word (Archivo → Abrir) o imprímalo directo; el PDF conserva tamaños exactos.</p>
    </div>}
    {batches.length > 0 && <details className="text-sm"><summary className="cursor-pointer font-medium">Lotes anteriores ({batches.length})</summary>
      <table className="mt-2 w-full text-left"><thead><tr><th>Fecha</th><th>Rango</th><th>Libres</th><th>Usadas</th><th /></tr></thead><tbody>
        {batches.map(b => <tr key={b.batchId} className="border-t"><td className="py-1">{new Date(b.createdAt).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })}</td><td>{b.first} – {b.last}</td><td>{b.free} de {b.total}</td><td>{b.assigned}{b.void ? ` · ${b.void} anuladas` : ""}</td>
          <td><button disabled={busy || b.free === 0} className="underline disabled:no-underline disabled:opacity-40" onClick={() => void run(() => callAdminAction(reprintWorkshopLabelsPdf, { batchId: b.batchId, ...look }))}>{b.free ? "Reimprimir libres" : "Sin libres"}</button></td></tr>)}
      </tbody></table></details>}
  </section>;
}
