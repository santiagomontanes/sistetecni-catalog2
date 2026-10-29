"use client";
import { useEffect, useState } from "react";
import type { Shipment, ShippingAction } from "@/lib/shipping/contracts";
import { callAdminAction } from "@/lib/callAdminAction";
import { listProfitability } from "@/app/admin/rentabilidad/actions";

type Read = (action: ShippingAction, args?: Record<string, unknown>) => Promise<{ items?: unknown[]; hasMore?: boolean } & Record<string, unknown>>;
const ZERO = BigInt(0);
const big = (v: string | null | undefined) => (v && /^\d+$/.test(v) ? BigInt(v) : ZERO);
const cop = (v: bigint) => `$ ${v.toLocaleString("es-CO")}`;
const avg = (sum: bigint, n: number) => (n ? sum / BigInt(n) : ZERO);
interface Row { carrier: string; n: number; sale: bigint; withheld: bigint; own: bigint }
interface Month { key: string; n: number; sale: bigint; withheld: bigint; equipment: bigint; costed: number; saleCosted: bigint; withheldCosted: bigint }
const monthName = (key: string) => { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" }); };
const monthKey = (iso: string | null) => { if (!iso) return "sin-fecha"; const p = new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Bogota" }); return p.slice(0, 7); };

export default function ShippingStats({ read }: { read: Read }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [months, setMonths] = useState<Month[]>([]);
  const [noCosts, setNoCosts] = useState(false);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      const all: Shipment[] = []; let offset = 0, more = true;
      while (more && offset < 500) {
        const page = await read("list", { status: "delivered", offset, limit: 100 });
        all.push(...((page.items ?? []) as Shipment[])); more = Boolean(page.hasMore); offset += 100;
      }
      if (!live) return;
      setTruncated(more);
      let costBySale = new Map<string, number>(); let costsOk = false;
      try {
        const prof = await callAdminAction(listProfitability, { limit: 200 });
        if (prof.ok) { costsOk = true; costBySale = new Map(prof.data.sales.filter((x) => x.costingStatus !== "missing_acquisition_cost").map((x) => [x.saleId, x.acquisitionCostCop + x.unitExtraCostsCop])); }
      } catch { /* sin permiso de rentabilidad: solo promedios de envío */ }
      const perMonth = new Map<string, Month>();
      for (const sh of all) {
        const key = monthKey(sh.delivered_at); const m = perMonth.get(key) ?? { key, n: 0, sale: ZERO, withheld: ZERO, equipment: ZERO, costed: 0, saleCosted: ZERO, withheldCosted: ZERO };
        m.n += 1; m.sale += big(sh.sale_value_cop); m.withheld += big(sh.carrier_withheld_cop);
        const eq = costBySale.get(sh.sale_id); if (eq !== undefined) { m.costed += 1; m.equipment += BigInt(Math.round(eq)); m.saleCosted += big(sh.sale_value_cop); m.withheldCosted += big(sh.carrier_withheld_cop); }
        perMonth.set(key, m);
      }
      setNoCosts(!costsOk); setMonths([...perMonth.values()].sort((a, b) => b.key.localeCompare(a.key)));
      const by = new Map<string, Row>();
      for (const s of all) {
        const key = s.carrier.trim().toLowerCase();
        const row = by.get(key) ?? { carrier: s.carrier, n: 0, sale: ZERO, withheld: ZERO, own: ZERO };
        row.n += 1; row.sale += big(s.sale_value_cop); row.withheld += big(s.carrier_withheld_cop); row.own += big(s.transport_company_cost_cop);
        by.set(key, row);
      }
      setRows([...by.values()].sort((a, b) => b.n - a.n));
    })().catch(() => { if (live) setError("No se pudieron calcular las estadísticas."); });
    return () => { live = false; };
  }, [read]);
  if (error) return <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>;
  if (!rows) return <p role="status" className="text-sm text-muted">Calculando estadísticas…</p>;
  if (!rows.length) return <p className="rounded-xl border border-border bg-white p-4 text-sm">Todavía no hay envíos entregados para calcular promedios.</p>;
  const total = rows.reduce((t, r) => ({ carrier: "Todas", n: t.n + r.n, sale: t.sale + r.sale, withheld: t.withheld + r.withheld, own: t.own + r.own }), { carrier: "Todas", n: 0, sale: ZERO, withheld: ZERO, own: ZERO });
  const card = (r: Row) => {
    const net = r.sale - r.withheld; const pct = r.sale > ZERO ? Number((r.withheld * BigInt(1000)) / r.sale) / 10 : 0;
    return <div key={r.carrier} className="space-y-2 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between"><h3 className="font-semibold">{r.carrier}</h3><span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium">{r.n} envío(s) entregado(s)</span></div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-muted">Valor promedio por el que se envía</dt><dd className="text-lg font-semibold">{cop(avg(r.sale, r.n))}</dd></div>
        <div><dt className="text-muted">Cobro promedio de la transportadora por envío</dt><dd className="text-lg font-semibold">{cop(avg(r.withheld, r.n))} <span className="text-sm font-normal text-muted">({pct}% de la venta)</span></dd></div>
        <div><dt className="text-muted">Promedio que te llega por envío</dt><dd className="text-lg font-semibold text-green-700">{cop(avg(net, r.n))}</dd></div>
        <div><dt className="text-muted">Costo de transporte que asumes tú (promedio)</dt><dd className="text-lg font-semibold">{cop(avg(r.own, r.n))}</dd></div>
      </dl></div>;
  };
  return <section className="space-y-3">
    <p className="text-sm text-muted">Calculado con los envíos <strong>entregados</strong>. «Te llega» = valor de la venta menos lo que la transportadora descuenta del recaudo. No descuenta el costo de los equipos: la utilidad final por equipo está en Rentabilidad.</p>
    {truncated && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Se usaron los 500 envíos entregados más recientes.</p>}
    {rows.length > 1 && card(total)}
    <h3 className="pt-2 text-lg font-semibold">Por mes: lo que se queda la transportadora y tu rentabilidad</h3>
    {noCosts && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Tu rol no ve costos de equipos: se muestran solo los valores de envío.</p>}
    <div className="overflow-x-auto rounded-2xl border border-border bg-white"><table className="w-full min-w-[820px] text-sm"><thead className="bg-surface text-left"><tr>{["Mes", "Envíos", "Ventas", "Se queda la transportadora", "Te llega", "Costo de equipos", "Utilidad bruta", "Utilidad neta", "Margen neto"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead><tbody>
      {[...months, ...(months.length > 1 ? [months.reduce((t, m) => ({ key: "total", n: t.n + m.n, sale: t.sale + m.sale, withheld: t.withheld + m.withheld, equipment: t.equipment + m.equipment, costed: t.costed + m.costed, saleCosted: t.saleCosted + m.saleCosted, withheldCosted: t.withheldCosted + m.withheldCosted }), { key: "total", n: 0, sale: ZERO, withheld: ZERO, equipment: ZERO, costed: 0, saleCosted: ZERO, withheldCosted: ZERO } as Month)] : [])].map((m) => {
        const complete = m.costed === m.n; const gross = m.saleCosted - m.equipment; const net = gross - m.withheldCosted; const pct = m.saleCosted > ZERO ? Number((net * BigInt(1000)) / m.saleCosted) / 10 : 0;
        return <tr key={m.key} className={`border-t border-border ${m.key === "total" ? "bg-surface font-semibold" : ""}`}><td className="px-3 py-2">{m.key === "total" ? "Total" : m.key === "sin-fecha" ? "Sin fecha" : monthName(m.key)}</td><td className="px-3 py-2">{m.n}</td><td className="px-3 py-2">{cop(m.sale)}</td><td className="px-3 py-2">{cop(m.withheld)}</td><td className="px-3 py-2 text-green-700">{cop(m.sale - m.withheld)}</td><td className="px-3 py-2">{m.costed ? cop(m.equipment) : "—"}</td><td className="px-3 py-2">{m.costed ? cop(gross) : "—"}</td><td className="px-3 py-2">{m.costed ? cop(net) : "—"}</td><td className="px-3 py-2">{m.costed ? `${pct}%` : "—"}{m.costed > 0 && !complete && <span title="Hay envíos sin costo de compra registrado" className="ml-1 text-amber-700">*</span>}</td></tr>;
      })}</tbody></table></div>
    <p className="text-sm text-muted"><strong>Utilidad bruta</strong> = venta − costo del equipo (compra + mejoras). <strong>Utilidad neta</strong> = bruta − lo que la transportadora descuenta (comisión y envío). <strong>Total</strong> = suma de todos los meses. Con <span className="text-amber-700">*</span>, algunos envíos no tienen costo de compra y esa parte no cuenta en bruta ni neta.</p>
    {rows.length > 1 && <h3 className="pt-2 text-lg font-semibold">Por transportadora</h3>}{rows.length > 1 ? rows.map(card) : null}
  </section>;
}
