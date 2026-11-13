"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { callAdminAction } from "@/lib/callAdminAction";
import { confirmReservation, listReservableUnits, listReservations, releaseReservation, reserveUnit, type ReservableUnitDTO, type ReservationDTO } from "@/app/admin/reservas/actions";
import { downloadAdminSalePdf } from "@/lib/downloadAdminSalePdf";
import { formatCOP } from "@/lib/personalizadorUi";
import { COMPANY } from "@/config/company";
import { PAYMENT_METHODS, PAYMENT_STATUSES, type PaymentMethod, type PaymentStatus } from "@/types/sale";
import type { AdminSaleDetailDTO } from "@/lib/salesAdmin/types";

const field = "rounded-lg border border-border bg-white px-3 py-2 text-sm";
const button = "rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold hover:bg-surface disabled:opacity-50";
const primary = "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const methodLabels: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", nequi: "Nequi", daviplata: "Daviplata", tarjeta: "Tarjeta", otro: "Otro" };
const statusLabels: Record<string, string> = { pagado: "Pagado", pendiente: "Pendiente", parcial: "Parcial" };
const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(iso)) : "Sin vencimiento");
const errorText = (r: { error: string; issues?: string[] }) => r.issues?.join(" ") || (r.error === "FORBIDDEN" ? "Solo el administrador puede reservar y confirmar ventas." : "No se pudo completar la acción. Intente de nuevo.");

export default function ReservasPage() {
  const [items, setItems] = useState<ReservationDTO[]>([]); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""); const [done, setDone] = useState<AdminSaleDetailDTO>();
  const [open, setOpen] = useState<string>(); const [busy, setBusy] = useState(false);
  const [units, setUnits] = useState<ReservableUnitDTO[]>([]); const [search, setSearch] = useState("");
  const keys = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    const r = await callAdminAction(listReservations, {});
    if (r.ok) setItems(r.data.items); else setError(errorText(r));
    setLoading(false);
  }, []);
  const loadUnits = useCallback(async (query: string) => {
    const r = await callAdminAction(listReservableUnits, { query });
    if (r.ok) setUnits(r.data.items);
  }, []);
  useEffect(() => { void load(); void loadUnits(""); }, [load, loadUnits]);

  async function reserve(form: HTMLFormElement) {
    const fd = new FormData(form); setBusy(true); setError(""); setDone(undefined);
    const r = await callAdminAction(reserveUnit, { unitId: String(fd.get("unit")), customerName: String(fd.get("name")), customerPhone: String(fd.get("phone")), hours: Number(fd.get("hours")), note: String(fd.get("note") ?? "") || undefined });
    setBusy(false);
    if (!r.ok) { setError(errorText(r)); return; }
    form.reset(); await Promise.all([load(), loadUnits(search)]);
  }
  async function release(unitId: string) {
    const reason = window.prompt("Motivo para liberar la reserva:")?.trim();
    if (!reason) return;
    setBusy(true); setError(""); setDone(undefined);
    const r = await callAdminAction(releaseReservation, { unitId, reason });
    setBusy(false);
    if (!r.ok) { setError(errorText(r)); return; }
    await Promise.all([load(), loadUnits(search)]);
  }
  async function confirm(unitId: string, form: HTMLFormElement) {
    const fd = new FormData(form); setBusy(true); setError("");
    // La misma llave por reserva: si se repite el clic o se reintenta, no se crea una segunda venta.
    const key = keys.current.get(unitId) ?? crypto.randomUUID(); keys.current.set(unitId, key);
    const r = await callAdminAction(confirmReservation, {
      unitId, customerDocument: String(fd.get("document")), priceCop: Number(fd.get("price")), discountCop: Number(fd.get("discount") || 0), paymentMethod: String(fd.get("method")),
      paymentStatus: String(fd.get("status")), warrantyMonths: Number(fd.get("warranty")), notes: String(fd.get("notes") ?? "") || undefined, idempotencyKey: key,
    });
    setBusy(false);
    if (!r.ok) { setError(errorText(r)); return; }
    keys.current.delete(unitId); setOpen(undefined); setDone(r.data); await load();
  }

  return <main className="mx-auto max-w-5xl space-y-6 p-4">
    <header><p className="text-xs font-semibold uppercase tracking-widest text-primary">ERP · Ventas</p><h1 className="text-2xl font-bold">Reservas</h1>
      <p className="text-sm text-muted">Aparta un equipo para un cliente y, cuando pague, confirma la venta: se genera el comprobante y el equipo pasa a Vendido.</p></header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {done && <div role="status" className="space-y-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
      <p className="font-semibold">Venta {done.saleNumber} confirmada · {done.customerName} · {formatCOP(done.totalCop)}</p>
      <div className="flex flex-wrap gap-2"><button className={primary} onClick={() => void downloadAdminSalePdf(done.id, done.saleNumber).catch(() => setError("No fue posible descargar el comprobante."))}>Descargar comprobante</button><Link className={button} href={`/admin/ventas/${done.id}`}>Ver la venta</Link></div></div>}

    <section className="rounded-2xl border border-border bg-white p-4"><h2 className="text-lg font-semibold">Reservar un equipo</h2>
      <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void reserve(e.currentTarget); }}>
        <div className="flex gap-2 sm:col-span-2"><input aria-label="Buscar equipo por STU" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por STU (ej. 123)" className={`${field} flex-1`} /><button type="button" className={button} onClick={() => void loadUnits(search)}>Buscar</button></div>
        <select name="unit" aria-label="Equipo a reservar" required className={`${field} sm:col-span-2`} defaultValue=""><option value="" disabled>{units.length ? "Elige el equipo…" : "No hay equipos disponibles"}</option>{units.map(u => <option key={u.unitId} value={u.unitId}>{u.unitCode} · {u.productTitle} · {formatCOP(u.priceCop)}</option>)}</select>
        <input name="name" aria-label="Nombre del cliente" required minLength={2} placeholder="Nombre del cliente" className={field} />
        <input name="phone" aria-label="Celular del cliente" required inputMode="tel" placeholder="Celular del cliente" className={field} />
        <label className="text-sm">Duración de la reserva (horas)<input name="hours" type="number" min={1} max={720} defaultValue={24} className={`${field} mt-1 block w-full`} /></label>
        <label className="text-sm">Nota (opcional)<input name="note" maxLength={300} placeholder="Ej. envío a Mocoa" className={`${field} mt-1 block w-full`} /></label>
        <div className="sm:col-span-2"><button disabled={busy || !units.length} className={primary}>Reservar equipo</button></div>
      </form></section>

    <section className="space-y-3"><h2 className="text-lg font-semibold">Reservas activas {loading ? "" : `(${items.length})`}</h2>
      {!loading && items.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">No hay equipos reservados.</p>}
      {items.map(r => <article key={r.unitId} className={`rounded-2xl border p-4 ${r.expired ? "border-red-200 bg-red-50/40" : "border-border bg-white"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{r.unitCode} · {r.productTitle}</p><p className="text-sm text-muted">Cliente: <strong>{r.customerName ?? "sin nombre"}</strong>{r.customerPhone ? ` · ${r.customerPhone}` : ""}</p>
          <p className={`text-sm ${r.expired ? "font-semibold text-red-700" : "text-muted"}`}>{r.expired ? "Reserva vencida (sigue bloqueada): " : "Vence: "}{when(r.expiresAt)}</p>{r.note && <p className="text-sm text-muted">Nota: {r.note}</p>}</div>
          <div className="text-right"><p className="text-lg font-bold">{formatCOP(r.priceCop)}</p>
            <div className="mt-2 flex flex-wrap justify-end gap-2"><button className={primary} disabled={busy} onClick={() => setOpen(open === r.unitId ? undefined : r.unitId)}>Confirmar venta</button><button className={button} disabled={busy} onClick={() => void release(r.unitId)}>Liberar</button></div></div></div>
        {open === r.unitId && <form className="mt-4 grid gap-3 rounded-xl bg-surface p-3 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); void confirm(r.unitId, e.currentTarget); }}>
          <label className="text-sm">Documento del cliente<input name="document" required minLength={4} maxLength={20} placeholder="Cédula o NIT" className={`${field} mt-1 block w-full`} /></label>
          <label className="text-sm">Precio (COP)<input name="price" type="number" min={0} step={1} required defaultValue={r.priceCop} className={`${field} mt-1 block w-full`} /></label>
          <label className="text-sm">Descuento (COP)<input name="discount" type="number" min={0} step={1} defaultValue={0} className={`${field} mt-1 block w-full`} /></label>
          <label className="text-sm">Método de pago<select name="method" defaultValue={"efectivo" satisfies PaymentMethod} className={`${field} mt-1 block w-full`}>{PAYMENT_METHODS.map(m => <option key={m} value={m}>{methodLabels[m]}</option>)}</select></label>
          <label className="text-sm">Estado del pago<select name="status" defaultValue={"pagado" satisfies PaymentStatus} className={`${field} mt-1 block w-full`}>{PAYMENT_STATUSES.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}</select></label>
          <label className="text-sm">Garantía (meses)<input name="warranty" type="number" min={0} max={120} required defaultValue={COMPANY.defaultWarrantyMonths} className={`${field} mt-1 block w-full`} /></label>
          <label className="text-sm sm:col-span-3">Notas del comprobante (opcional)<input name="notes" maxLength={1000} className={`${field} mt-1 block w-full`} /></label>
          <div className="sm:col-span-3"><button disabled={busy} className={primary}>{busy ? "Confirmando…" : "Confirmar venta y generar comprobante"}</button></div>
        </form>}
      </article>)}
    </section>
  </main>;
}
