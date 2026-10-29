"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { callAdminAction } from "@/lib/callAdminAction";
import { licenseAction, type License, type LicenseAction, type LicenseState, type LicenseSummary } from "@/app/admin/licencias/actions";
import { listCustomers } from "@/app/admin/clientes/actions";
import type { AdminCustomerDTO } from "@/lib/erpAdmin/types";
import { getErpProfile } from "@/supabase/auth";
import { roleHasPermission, type ErpRole } from "@/lib/erpAuth/types";

const field = "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text";
const button = "rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const ghost = "rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-50";
const cop = (v: string | number | bigint | null) => v == null ? "—" : "$ " + BigInt(v).toLocaleString("es-CO");
const PLAN: Record<string, string> = { monthly: "Mensual", annual: "Anual", one_time: "Pago único" };
const STATE: Record<LicenseState, [string, string]> = {
  current: ["Al día", "bg-emerald-100 text-emerald-800"], due_soon: ["Vence pronto", "bg-amber-100 text-amber-800"], overdue: ["Vencida", "bg-red-100 text-red-800"],
  paid: ["Pagada", "bg-emerald-100 text-emerald-800"], pending_payment: ["Pago pendiente", "bg-amber-100 text-amber-800"], suspended: ["Suspendida", "bg-slate-200 text-slate-700"], cancelled: ["Cancelada", "bg-slate-200 text-slate-700"],
};
const METHODS = ["efectivo", "transferencia", "nequi", "daviplata", "tarjeta", "otro"];
const today = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);

export default function LicenciasPage() {
  const [role, setRole] = useState<ErpRole | null>(null);
  const [items, setItems] = useState<License[]>([]); const [summary, setSummary] = useState<LicenseSummary | null>(null);
  const [search, setSearch] = useState(""); const [stateFilter, setStateFilter] = useState("");
  const [selected, setSelected] = useState<License | null>(null); const [showKey, setShowKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const keys = useRef(new Map<string, string>());
  const canManage = role ? roleHasPermission(role, "sales.manage") : false; const canCash = role ? roleHasPermission(role, "cash.manage") : false;

  const call = useCallback(async (action: LicenseAction, args: Record<string, unknown>, idempotent = false) => {
    const fp = JSON.stringify([action, args]); let requestId: string | undefined;
    if (idempotent) { requestId = keys.current.get(fp) ?? crypto.randomUUID(); keys.current.set(fp, requestId); }
    const r = await callAdminAction(licenseAction, { action, args, requestId });
    if (r.ok && idempotent) keys.current.delete(fp);
    return r;
  }, []);
  const load = useCallback(async () => {
    const r = await call("list", { search: search || undefined, state: stateFilter || undefined, limit: 100 });
    if (!r.ok) { setError(r.message); return; }
    setItems(r.data.items as License[]); setSummary(r.data.summary as LicenseSummary);
  }, [call, search, stateFilter]);
  useEffect(() => { void getErpProfile().then(p => setRole(p?.role ?? null)); }, []);
  useEffect(() => { void load(); }, [load]);

  const open = async (id: string) => { setShowKey(null); setError(""); const r = await call("detail", { id }); if (r.ok) setSelected(r.data as unknown as License); else setError(r.message); };
  const run = async (action: LicenseAction, args: Record<string, unknown>, ok: string, idempotent = true) => {
    if (busy) return false; setBusy(true); setError(""); setMessage("");
    try {
      const r = await call(action, args, idempotent);
      if (!r.ok) { setError(r.message); return false; }
      setMessage(ok); await load(); if (selected) await open(selected.id); return true;
    } finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-primary">ERP · Clientes</p><h1 className="text-2xl font-bold text-text">Licencias de software</h1>
      <p className="text-sm text-muted">Quién tiene qué software, cuánto paga, hasta cuándo está al día y cada pago registrado en Caja.</p></div>
      {canManage && <button className={button} onClick={() => { setCreating(v => !v); setSelected(null); }}>{creating ? "Cerrar" : "Nueva licencia"}</button>}</div>
    {error && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</p>}

    {summary && <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <Card label="Activas" value={String(summary.active)} /><Card label="Al día" value={String(summary.current + 0)} /><Card label="Vencen pronto" value={String(summary.due_soon)} tone="amber" />
      <Card label="Vencidas" value={String(summary.overdue)} tone={summary.overdue ? "red" : undefined} /><Card label="Ingreso mensual estimado" value={cop(summary.monthly_recurring_cop)} /><Card label="Cobrado este mes" value={cop(summary.collected_month_cop)} />
    </div>}

    {creating && canManage && <NewLicense busy={busy} onCreate={async (args) => { if (await run("create", args, "Licencia creada.")) setCreating(false); }} />}

    <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void load(); }}>
      <label className="text-sm">Buscar<input aria-label="Buscar licencia" className={field} placeholder="Cliente, software o LIC-" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label className="text-sm">Estado<select className={field} value={stateFilter} onChange={e => setStateFilter(e.target.value)}><option value="">Todos</option>{(Object.keys(STATE) as LicenseState[]).map(s => <option key={s} value={s}>{STATE[s][0]}</option>)}</select></label>
      <button className={ghost}>Buscar</button>
    </form>

    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">{!items.length && <p className="text-sm text-muted">No hay licencias que coincidan.</p>}
        {items.map(l => <button key={l.id} onClick={() => void open(l.id)} className={`block w-full rounded-2xl border bg-white p-4 text-left transition hover:border-primary ${selected?.id === l.id ? "border-primary" : "border-border"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{l.software_name}</p><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATE[l.state][1]}`}>{STATE[l.state][0]}</span></div>
          <p className="text-sm text-muted">{l.customer_name_snapshot} · {l.license_number}</p>
          <p className="text-sm">{PLAN[l.plan]} · {cop(l.price_cop)}{l.plan === "one_time" ? <> · Saldo {cop(l.balance_cop)}</> : <> · {l.paid_until ? `Pagada hasta ${l.paid_until}` : "Sin pagos"}</>}</p></button>)}
      </div>
      {selected && <Detail key={selected.id + selected.version} l={selected} busy={busy} canManage={canManage} canCash={canCash} showKey={showKey}
        onKey={async () => { const r = await call("key", { id: selected.id }); if (r.ok) setShowKey(String(r.data.licenseKey ?? "(sin clave registrada)")); else setError(r.message); }}
        onHide={() => setShowKey(null)} run={run} />}
    </div>
  </div>;
}

function Card({ label, value, tone }: { label: string; value: string; tone?: "amber" | "red" }) {
  return <div className={`rounded-2xl border p-4 ${tone === "red" ? "border-red-200 bg-red-50" : tone === "amber" ? "border-amber-200 bg-amber-50" : "border-border bg-white"}`}><p className="text-xs font-semibold uppercase text-muted">{label}</p><p className="mt-1 text-xl font-bold text-text">{value}</p></div>;
}

function NewLicense({ busy, onCreate }: { busy: boolean; onCreate: (args: Record<string, unknown>) => Promise<void> }) {
  const [q, setQ] = useState(""); const [customers, setCustomers] = useState<AdminCustomerDTO[]>([]); const [customer, setCustomer] = useState<AdminCustomerDTO | null>(null);
  const [f, setF] = useState({ software: "", licenseKey: "", plan: "monthly", price: "", startsOn: today(), notes: "" });
  useEffect(() => { if (q.trim().length < 2) { setCustomers([]); return; } const t = setTimeout(() => { void callAdminAction(listCustomers, { query: q }).then(r => { if (r.ok) setCustomers(r.data.items.slice(0, 6)); }); }, 250); return () => clearTimeout(t); }, [q]);
  return <form className="grid gap-3 rounded-2xl border border-border bg-white p-5 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); if (!customer) return; void onCreate({ customerId: customer.id, software: f.software, licenseKey: f.licenseKey || undefined, plan: f.plan, priceCop: f.price, startsOn: f.startsOn, notes: f.notes || undefined }); }}>
    <div className="sm:col-span-2"><label className="text-sm">Cliente{customer ? <span className="ml-2 font-semibold">{customer.fullName} <button type="button" className="underline" onClick={() => setCustomer(null)}>cambiar</button></span> : null}
      {!customer && <input aria-label="Buscar cliente" className={field} placeholder="Escribe nombre, cédula o celular del cliente" value={q} onChange={e => setQ(e.target.value)} />}</label>
      {!customer && customers.map(c => <button type="button" key={c.id} className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:border-primary" onClick={() => setCustomer(c)}>{c.fullName} · {c.documentNumber ?? "sin documento"} · {c.phone ?? ""}</button>)}
      {!customer && q.trim().length >= 2 && !customers.length && <p className="mt-1 text-xs text-muted">Sin resultados. Crea el cliente primero en Clientes.</p>}</div>
    <label className="text-sm">Software<input className={field} value={f.software} onChange={e => setF({ ...f, software: e.target.value })} required minLength={2} placeholder="Ej. Office 365, antivirus, ERP…" /></label>
    <label className="text-sm">Licencia / clave (opcional)<input className={field} value={f.licenseKey} onChange={e => setF({ ...f, licenseKey: e.target.value })} autoComplete="off" /></label>
    <label className="text-sm">Plan<select className={field} value={f.plan} onChange={e => setF({ ...f, plan: e.target.value })}><option value="monthly">Mensual</option><option value="annual">Anual</option><option value="one_time">Pago único</option></select></label>
    <label className="text-sm">{f.plan === "one_time" ? "Valor total (COP)" : f.plan === "annual" ? "Valor por año (COP)" : "Valor por mes (COP)"}<input className={field} inputMode="numeric" value={f.price} onChange={e => setF({ ...f, price: e.target.value.replace(/\D/g, "") })} required /></label>
    <label className="text-sm">Fecha de inicio<input className={field} type="date" value={f.startsOn} onChange={e => setF({ ...f, startsOn: e.target.value })} required /></label>
    <label className="text-sm">Notas (opcional)<input className={field} value={f.notes} maxLength={1000} onChange={e => setF({ ...f, notes: e.target.value })} /></label>
    <div className="sm:col-span-2"><button className={button} disabled={busy || !customer || !f.price}>Crear licencia</button></div>
  </form>;
}

function Detail({ l, busy, canManage, canCash, showKey, onKey, onHide, run }: { l: License; busy: boolean; canManage: boolean; canCash: boolean; showKey: string | null; onKey: () => Promise<void>; onHide: () => void; run: (a: LicenseAction, args: Record<string, unknown>, ok: string, idempotent?: boolean) => Promise<boolean> }) {
  const [periods, setPeriods] = useState("1"); const [amount, setAmount] = useState(l.plan === "one_time" ? (l.balance_cop ?? "") : l.price_cop);
  const [method, setMethod] = useState("transferencia"); const [reference, setReference] = useState(""); const [paidOn, setPaidOn] = useState(today());
  const expected = l.plan === "one_time" ? null : BigInt(l.price_cop) * BigInt(Number(periods) || 1);
  const pay = async () => {
    if (!window.confirm(`¿Registrar un pago de ${cop(amount || 0)} de ${l.customer_name_snapshot} por ${l.software_name}? Se crea una entrada en Caja (${method}).`)) return;
    await run("payment", { id: l.id, amountCop: amount, periods: l.plan === "one_time" ? undefined : Number(periods) || 1, paidOn, method, reference: reference || undefined }, "Pago registrado y asentado en Caja.");
  };
  return <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">{l.software_name}</h2><p className="text-sm text-muted">{l.license_number} · {l.customer_name_snapshot}</p></div><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATE[l.state][1]}`}>{STATE[l.state][0]}</span></div>
    <div className="grid gap-1 text-sm sm:grid-cols-2"><p>Plan: <strong>{PLAN[l.plan]}</strong> · {cop(l.price_cop)}</p><p>Inicio: {l.starts_on}</p>
      {l.plan === "one_time" ? <><p>Pagado: <strong>{cop(l.paid_total_cop)}</strong></p><p>Saldo: <strong>{cop(l.balance_cop)}</strong></p></> : <><p>Pagada hasta: <strong>{l.paid_until ?? "—"}</strong>{l.days_to_due != null && <> ({l.days_to_due < 0 ? `vencida hace ${-l.days_to_due} días` : `faltan ${l.days_to_due} días`})</>}</p><p>Total cobrado: <strong>{cop(l.paid_total_cop)}</strong></p></>}</div>
    {l.status_reason && <p className="text-sm text-muted">Motivo del estado: {l.status_reason}</p>}{l.notes && <p className="text-sm text-muted">{l.notes}</p>}
    {canManage && l.has_key && <div className="text-sm">{showKey === null ? <button className={ghost} onClick={() => void onKey()}>Ver clave de licencia</button> : <p>Clave: <code className="rounded bg-slate-100 px-2 py-1">{showKey}</code> <button className="ml-2 underline" onClick={onHide}>ocultar</button></p>}</div>}

    {canCash && l.status === "active" && (l.plan !== "one_time" || BigInt(l.balance_cop ?? 0) > BigInt(0)) && <form className="grid gap-3 rounded-xl border border-border bg-slate-50 p-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void pay(); }}>
      <h3 className="font-semibold sm:col-span-2">Registrar pago (entra a Caja)</h3>
      {l.plan !== "one_time" && <label className="text-sm">{l.plan === "annual" ? "Años que paga" : "Meses que paga"}<input aria-label="Periodos pagados" className={field} inputMode="numeric" value={periods} onChange={e => { const v = e.target.value.replace(/\D/g, ""); setPeriods(v); if (v) setAmount((BigInt(l.price_cop) * BigInt(v)).toString()); }} /></label>}
      <label className="text-sm">Valor recibido (COP)<input aria-label="Valor recibido" className={field} inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ""))} required /></label>
      <label className="text-sm">Medio de pago<select aria-label="Medio de pago" className={field} value={method} onChange={e => setMethod(e.target.value)}>{METHODS.map(m => <option key={m}>{m}</option>)}</select></label>
      <label className="text-sm">Fecha del pago<input aria-label="Fecha del pago" className={field} type="date" max={today()} value={paidOn} onChange={e => setPaidOn(e.target.value)} required /></label>
      <label className="text-sm">Referencia (opcional)<input aria-label="Referencia del pago" className={field} value={reference} maxLength={160} onChange={e => setReference(e.target.value)} /></label>
      {expected !== null && amount && BigInt(amount) !== expected && <p className="text-xs text-amber-800 sm:col-span-2">El valor no coincide con {cop(expected)} ({periods || 1} × {cop(l.price_cop)}); queda registrado tal cual lo escribes.</p>}
      <div className="sm:col-span-2"><button className={button} disabled={busy || !amount}>Registrar pago</button></div>
    </form>}

    <div><h3 className="mb-2 font-semibold">Pagos</h3>{!l.payments?.length && <p className="text-sm text-muted">Aún no hay pagos.</p>}
      <div className="space-y-2">{l.payments?.map(p => <div key={p.id} className={`rounded-xl border p-3 text-sm ${p.reversed_at ? "border-slate-200 bg-slate-50 text-slate-500" : "border-border"}`}>
        <p className={p.reversed_at ? "line-through" : "font-semibold"}>{cop(p.amount_cop)} · {p.payment_method} · {p.paid_on}</p>
        <p className="text-xs text-muted">{p.period_from ? `Cubre ${p.period_from} a ${p.period_to} · ` : ""}Caja {p.cash_movement ?? "—"}{p.reference ? ` · Ref. ${p.reference}` : ""}</p>
        {p.reversed_at && <p className="text-xs">Reversado: {p.reversal_reason}</p>}
        {canCash && !p.reversed_at && <button className="mt-1 text-xs text-red-600 underline" disabled={busy} onClick={() => { const reason = window.prompt("Motivo del reverso (queda en Caja y se conserva el pago original):"); if (reason && reason.trim().length >= 3) void run("payment_reverse", { id: l.id, paymentId: p.id, reason: reason.trim() }, "Pago reversado en Caja."); }}>Reversar pago</button>}
      </div>)}</div></div>

    {canManage && <div className="flex flex-wrap gap-2 border-t border-border pt-3">
      {l.status === "active" && <button className={ghost} disabled={busy} onClick={() => { const r = window.prompt("Motivo de la suspensión:"); if (r) void run("status", { id: l.id, version: l.version, status: "suspended", reason: r }, "Licencia suspendida."); }}>Suspender</button>}
      {l.status !== "active" && l.status !== "cancelled" && <button className={ghost} disabled={busy} onClick={() => { const r = window.prompt("Motivo de la reactivación:"); if (r) void run("status", { id: l.id, version: l.version, status: "active", reason: r }, "Licencia reactivada."); }}>Reactivar</button>}
      {l.status !== "cancelled" && <button className={ghost} disabled={busy} onClick={() => { if (!window.confirm("¿Cancelar esta licencia? Los pagos y movimientos de Caja se conservan.")) return; const r = window.prompt("Motivo de la cancelación:"); if (r) void run("status", { id: l.id, version: l.version, status: "cancelled", reason: r }, "Licencia cancelada."); }}>Cancelar licencia</button>}
    </div>}
  </section>;
}
