"use client";

import { useCallback, useEffect, useState } from "react";
import { callAdminAction } from "@/lib/callAdminAction";
import { getBusinessReport } from "@/app/admin/reportes/actions";
import { formatCOP } from "@/lib/personalizadorUi";
import type { BusinessReportDTO } from "@/lib/adminPhase2/types";

function dateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(date);
}

export default function ReportesPage() {
  const [from, setFrom] = useState(dateOffset(-30));
  const [to, setTo] = useState(dateOffset(0));
  const [data, setData] = useState<BusinessReportDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await callAdminAction(getBusinessReport, { from, to });
    if (result.ok) {
      setData(result.data);
    } else {
      setError(
        result.error === "VALIDATION_ERROR"
          ? result.issues.join(" ")
          : "No fue posible generar el reporte."
      );
    }
    setLoading(false);
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">ERP · Fase 2C</p>
        <h1 className="text-2xl font-bold text-text">Reportes y KPIs</h1>
        <p className="mt-1 text-sm text-muted">
          Ventas, costos conocidos, gastos, caja, compras, inventario y garantías en un mismo periodo.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-white p-4">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Desde</span>
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="rounded-xl border border-border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">Hasta</span>
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="rounded-xl border border-border px-3 py-2"
          />
        </label>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Calculando..." : "Actualizar"}
        </button>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card label="Ventas" value={formatCOP(data.salesRevenueCop)} sub={`${data.salesCount} ventas · ${data.unitsSold} STU`} />
            <Card label="Resultado conocido" value={formatCOP(data.knownNetResultCop)} sub="Ventas - compra STU - extras - gastos" />
            <Card label="Gastos operativos" value={formatCOP(data.operatingExpensesCop)} sub={`${formatCOP(data.cashOutCop)} salidas de flujo`} />
            <Card label="Inventario valorizado" value={formatCOP(data.inventoryAcquisitionValueCop)} sub="Costo de adquisición no vendido/retirado" />
            <Card label="Compras" value={formatCOP(data.purchasesCop)} sub={`${data.purchaseCount} lotes`} />
            <Card label="Entradas de dinero" value={formatCOP(data.cashInCop)} sub="Movimientos positivos del periodo" />
            <Card label="Garantías abiertas" value={String(data.openAfterSalesCases)} sub="Casos no cerrados/cancelados" />
            <Card label="Costos extra" value={formatCOP(data.extraCostsCop)} sub={`Compra STU vendida: ${formatCOP(data.soldAcquisitionCostCop)}`} />
          </div>

          <section className="grid gap-4 lg:grid-cols-2">
            <Breakdown title="Inventario por estado" data={data.inventoryByStatus} />
            <Breakdown title="Ventas por método de pago" data={data.salesByPaymentMethod} money />
          </section>
        </>
      ) : null}
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold text-text">{value}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </div>
  );
}

function Breakdown({
  title,
  data,
  money = false,
}: {
  title: string;
  data: Record<string, number>;
  money?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <h2 className="font-semibold text-text">{title}</h2>
      <div className="mt-3 space-y-2">
        {Object.entries(data)
          .sort((a, b) => b[1] - a[1])
          .map(([key, value]) => (
            <div key={key} className="flex justify-between gap-3 border-b border-border pb-2 text-sm">
              <span className="capitalize text-muted">{key.replace(/_/g, " ")}</span>
              <strong>{money ? formatCOP(Number(value)) : String(value)}</strong>
            </div>
          ))}
      </div>
    </div>
  );
}
