"use client";
import { useEffect, useState } from "react";
import type { Shipment, ShippingAction } from "@/lib/shipping/contracts";

type Read = (action: ShippingAction, args?: Record<string, unknown>) => Promise<{ items?: unknown[]; hasMore?: boolean } & Record<string, unknown>>;
const ZERO = BigInt(0);
const big = (v: string | null | undefined) => (v && /^\d+$/.test(v) ? BigInt(v) : ZERO);
const cop = (v: bigint) => `$ ${v.toLocaleString("es-CO")}`;
const avg = (sum: bigint, n: number) => (n ? sum / BigInt(n) : ZERO);
interface Row { carrier: string; n: number; sale: bigint; withheld: bigint; own: bigint }

export default function ShippingStats({ read }: { read: Read }) {
  const [rows, setRows] = useState<Row[] | null>(null);
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
    {rows.length > 1 && card(total)}{rows.map(card)}
  </section>;
}
