"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { callAdminAction } from "@/lib/callAdminAction";
import { createAuctionLot, listAuctionLots, reprintAuctionLot, type AuctionLot } from "@/app/admin/remates/actions";
import { getErpProfile } from "@/supabase/auth";

const field = "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text";
const button = "rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const sizes = [["small", "Pequeña · QR 3 cm"], ["medium", "Mediana · QR 4 cm"], ["large", "Grande · QR 5 cm"]] as const;
const cop = (v: string | number | bigint) => "$ " + BigInt(v).toLocaleString("es-CO");
const today = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
const toUrl = (base64: string) => URL.createObjectURL(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: "application/pdf" }));

export default function RematesPage() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [form, setForm] = useState({ supplier: "", purchasedOn: today(), machines: "", memories: "", disks: "", price: "", notes: "" });
  const [size, setSize] = useState<(typeof sizes)[number][0]>("medium");
  const [lots, setLots] = useState<AuctionLot[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [pdf, setPdf] = useState<{ url: string; title: string }>();
  const key = useRef(crypto.randomUUID()); const frame = useRef<HTMLIFrameElement>(null); const current = useRef<string | undefined>(undefined);
  const n = (v: string) => Math.max(0, Math.min(200, Number(v) || 0));
  const total = n(form.machines) + n(form.memories) + n(form.disks);
  const price = /^\d{1,12}$/.test(form.price) ? BigInt(form.price) : null;

  const refresh = useCallback(async () => { const r = await callAdminAction(listAuctionLots, {}); if (r.ok) setLots(r.data); }, []);
  useEffect(() => { void getErpProfile().then(p => setAdmin(p?.role === "admin")); }, []);
  useEffect(() => { if (admin) void refresh(); return () => { if (current.current) URL.revokeObjectURL(current.current); }; }, [admin, refresh]);
  const show = (base64: string, title: string) => { if (current.current) URL.revokeObjectURL(current.current); current.current = toUrl(base64); setPdf({ url: current.current, title }); };

  const submit = async () => {
    if (busy || !total || price === null) return; setBusy(true); setError(""); setMessage("");
    try {
      const r = await callAdminAction(createAuctionLot, { supplier: form.supplier, purchasedOn: form.purchasedOn, machines: n(form.machines), memories: n(form.memories), disks: n(form.disks), totalPriceCop: form.price, notes: form.notes, size, requestKey: key.current });
      if (!r.ok) { setError(r.message); return; }
      key.current = crypto.randomUUID();
      setMessage(`Remate ${r.data.lot.lotNumber} registrado: ${r.data.lot.labels.length} QR generados (${r.data.lot.labels[0]?.code} a ${r.data.lot.labels[r.data.lot.labels.length - 1]?.code}).`);
      show(r.data.pdfBase64, `${r.data.lot.lotNumber}`); setForm({ supplier: "", purchasedOn: today(), machines: "", memories: "", disks: "", price: "", notes: "" }); await refresh();
    } catch { setError("No se pudo registrar el remate. Revise la conexión; reintentar no duplica el registro."); } finally { setBusy(false); }
  };
  const reprint = async (lot: AuctionLot) => {
    if (busy) return; setBusy(true); setError("");
    try { const r = await callAdminAction(reprintAuctionLot, { lotId: lot.id, size }); if (!r.ok) setError(r.message); else show(r.data.pdfBase64, lot.lotNumber); } finally { setBusy(false); }
  };

  if (admin === null) return <p className="text-sm text-muted">Cargando…</p>;
  if (!admin) return <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Solo el administrador registra remates y genera números QR.</p>;
  return <div className="space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">ERP · Abastecimiento</p><h1 className="text-2xl font-bold text-text">Ingreso de remate</h1>
      <p className="text-sm text-muted">Registra lo que compraste y su precio total. Al guardar se reserva un QR (STU) por cada computador, memoria o disco, listo para imprimir y pegar. Solo el administrador puede hacerlo.</p></div>
    <form className="grid gap-3 rounded-2xl border border-border bg-white p-5 sm:grid-cols-2 lg:grid-cols-3" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <label className="text-sm">Remate / proveedor (opcional)<input className={field} value={form.supplier} maxLength={160} onChange={e => setForm({ ...form, supplier: e.target.value })} /></label>
      <label className="text-sm">Fecha de compra<input className={field} type="date" value={form.purchasedOn} onChange={e => setForm({ ...form, purchasedOn: e.target.value })} required /></label>
      <label className="text-sm">Precio total del remate (COP)<input className={field} inputMode="numeric" value={form.price} onChange={e => setForm({ ...form, price: e.target.value.replace(/\D/g, "") })} required /></label>
      <label className="text-sm">Computadores comprados<input className={field} inputMode="numeric" value={form.machines} onChange={e => setForm({ ...form, machines: e.target.value.replace(/\D/g, "") })} placeholder="0" /></label>
      <label className="text-sm">Memorias compradas<input className={field} inputMode="numeric" value={form.memories} onChange={e => setForm({ ...form, memories: e.target.value.replace(/\D/g, "") })} placeholder="0" /></label>
      <label className="text-sm">Discos comprados<input className={field} inputMode="numeric" value={form.disks} onChange={e => setForm({ ...form, disks: e.target.value.replace(/\D/g, "") })} placeholder="0" /></label>
      <label className="text-sm sm:col-span-2">Notas (opcional)<input className={field} value={form.notes} maxLength={1000} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
      <label className="text-sm">Tamaño de etiqueta<select className={field} value={size} onChange={e => setSize(e.target.value as typeof size)}>{sizes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <div className="rounded-xl bg-slate-50 p-3 text-sm sm:col-span-2 lg:col-span-3">
        {total > 0 ? <>Se generarán <strong>{total} QR</strong> ({n(form.machines)} computadores + {n(form.memories)} memorias + {n(form.disks)} discos).{price !== null && <> Costo promedio por pieza: <strong>{cop(price / BigInt(total))}</strong> (referencia; el costo real de cada STU se asigna al recibirlo).</>}</> : "Escribe cuántas piezas compraste para saber cuántos QR se generarán."}
      </div>
      <div className="sm:col-span-2 lg:col-span-3"><button className={button} disabled={busy || total < 1 || price === null || total > 200}>{busy ? "Guardando…" : `Registrar remate y generar ${total || ""} QR`}</button>{total > 200 && <span className="ml-3 text-sm text-red-700">Máximo 200 piezas por remate.</span>}</div>
    </form>
    {error && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</p>}
    {pdf && <section className="space-y-2 rounded-2xl border border-border bg-white p-5"><p className="text-sm font-semibold">Etiquetas del remate {pdf.title}</p>
      <div className="flex flex-wrap gap-2"><button className={button} onClick={() => frame.current?.contentWindow?.print()}>Imprimir</button><a className="rounded-xl border border-border px-4 py-2 text-sm" href={pdf.url} download={`remate-${pdf.title}.pdf`}>Descargar PDF</a></div>
      <iframe ref={frame} title="Vista previa de etiquetas del remate" src={pdf.url} className="h-[70vh] w-full rounded-xl border border-border" /></section>}
    <section className="space-y-2"><h2 className="text-lg font-semibold">Remates registrados</h2>
      {!lots.length && <p className="text-sm text-muted">Aún no hay remates.</p>}
      {lots.map(l => { const used = l.labels.filter(x => x.state === "assigned").length; const count = l.machines + l.memories + l.disks; return <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white p-4">
        <div className="text-sm"><p className="font-semibold">{l.lotNumber} · {cop(l.totalPriceCop)}{l.supplierName ? ` · ${l.supplierName}` : ""}</p>
          <p className="text-muted">{l.purchasedOn} · {l.machines} computadores, {l.memories} memorias, {l.disks} discos · {l.labels[0]?.code} a {l.labels[l.labels.length - 1]?.code} · {used} de {count} QR ya usados</p>{l.notes && <p className="text-muted">{l.notes}</p>}</div>
        <button className="rounded-xl border border-border px-3 py-2 text-sm" disabled={busy} onClick={() => void reprint(l)}>Reimprimir QR</button></div>; })}
    </section>
  </div>;
}
