"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { callAdminAction } from "@/lib/callAdminAction";
import { createWorkshopLabelsPdf, listWorkshopLabelBatches, reprintWorkshopLabelsPdf, type LabelBatch, type LabelsPdfResult } from "@/app/admin/taller/actions";

const field = "rounded border px-3 py-2";
const button = "rounded border px-3 py-2 disabled:opacity-50";
const sizes = [["small", "Pequeña · QR 3 cm (más etiquetas por hoja)"], ["medium", "Mediana · QR 4 cm"], ["large", "Grande · QR 5 cm (fácil de leer)"]] as const;

function toUrl(base64: string) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

export default function LabelsPanel({ enabled, hasLocations }: { enabled: boolean; hasLocations: boolean }) {
  const [count, setCount] = useState(10); const [size, setSize] = useState<(typeof sizes)[number][0]>("medium");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [pdf, setPdf] = useState<{ url: string; info: LabelsPdfResult }>();
  const [batches, setBatches] = useState<LabelBatch[]>([]);
  const frame = useRef<HTMLIFrameElement>(null); const current = useRef<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    const result = await callAdminAction(listWorkshopLabelBatches, {});
    if (result.ok) setBatches(result.data);
  }, []);
  useEffect(() => { void refresh(); return () => { if (current.current) URL.revokeObjectURL(current.current); }; }, [refresh]);

  function show(info: LabelsPdfResult) {
    if (current.current) URL.revokeObjectURL(current.current);
    const url = toUrl(info.pdfBase64); current.current = url;
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
  return <section className="space-y-4 rounded border bg-white p-4">
    <div><h2 className="text-lg font-semibold">1. Etiquetas QR</h2>
      <p className="text-sm text-slate-600">Cada etiqueta es un código STU único: el mismo que tendrá el equipo en todo el sistema. Al generar se <strong>reservan</strong> esos números y se abre el PDF para revisar e imprimir. Si lo pierde, lo recupera en «Lotes anteriores».</p></div>
    {!hasLocations && <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">Aún no hay ubicaciones. Puede imprimir etiquetas, pero para recibir equipos primero cree al menos una ubicación (paso 2).</p>}
    <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void run(() => callAdminAction(createWorkshopLabelsPdf, { count, size })); }}>
      <label className="text-sm">¿Cuántos equipos llegaron?<input type="number" min={1} max={200} value={count} onChange={e => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} className={`${field} block w-32`} /></label>
      <label className="text-sm">Tamaño de etiqueta<select value={size} onChange={e => setSize(e.target.value as typeof size)} className={`${field} block`}>{sizes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <button disabled={busy || !enabled} className={`${button} bg-slate-900 text-white`}>{busy ? "Generando…" : `Generar ${count} QR y ver PDF`}</button>
    </form>
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
          <td><button disabled={busy || b.free === 0} className="underline disabled:no-underline disabled:opacity-40" onClick={() => void run(() => callAdminAction(reprintWorkshopLabelsPdf, { batchId: b.batchId, size }))}>{b.free ? "Reimprimir libres" : "Sin libres"}</button></td></tr>)}
      </tbody></table></details>}
  </section>;
}
