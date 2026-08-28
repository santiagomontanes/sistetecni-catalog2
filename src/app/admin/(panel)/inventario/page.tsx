"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { callAdminAction } from "@/lib/callAdminAction";
import { listInventory, markUnitAvailable, setProductStockMode } from "@/app/admin/inventario/actions";
import { formatCOP } from "@/lib/personalizadorUi";
import type { AdminInventoryUnitDTO } from "@/lib/erpAdmin/types";
import type { ProductUnitStatus } from "@/types/erp";

const STATUS_LABELS: Record<ProductUnitStatus, string> = {
  received: "Recibido",
  inspection: "Inspección",
  available: "Disponible",
  reserved: "Reservado",
  sold: "Vendido",
  warranty: "Garantía",
  repair: "Reparación",
  returned: "Devuelto",
  retired: "Retirado",
};

const STATUS_STYLES: Record<ProductUnitStatus, string> = {
  received: "bg-blue-50 text-blue-700",
  inspection: "bg-amber-50 text-amber-700",
  available: "bg-green-50 text-green-700",
  reserved: "bg-violet-50 text-violet-700",
  sold: "bg-slate-100 text-slate-700",
  warranty: "bg-orange-50 text-orange-700",
  repair: "bg-red-50 text-red-700",
  returned: "bg-cyan-50 text-cyan-700",
  retired: "bg-neutral-100 text-neutral-600",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function overrideText(unit: AdminInventoryUnitDTO): string {
  const parts: string[] = [];
  const ram = unit.specOverrides.ramGb;
  const storage = unit.specOverrides.storageGb;
  const storageType = unit.specOverrides.storageType;
  if (typeof ram === "number") parts.push(`${ram} GB RAM`);
  if (typeof storage === "number") parts.push(`${storage} GB${typeof storageType === "string" ? ` ${storageType}` : ""}`);
  return parts.join(" · ");
}

interface ProductStockSummary {
  productId: string;
  title: string;
  brand: string;
  model: string;
  webStock: number;
  erpStockEnabled: boolean;
  erpStockSyncedAt: string | null;
  totalUnits: number;
  availableUnits: number;
}

export default function AdminInventarioPage() {
  const [items, setItems] = useState<AdminInventoryUnitDTO[]>([]);
  const [filter, setFilter] = useState<"all" | ProductUnitStatus>("all");
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [switchingProductId, setSwitchingProductId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result = await callAdminAction(listInventory, { limit: 150 });
      if (!result.ok) {
        setError(result.error === "FORBIDDEN" ? "No tienes permisos de administrador." : "No fue posible cargar el inventario.");
        return;
      }
      setItems(result.data.items);
    } catch {
      setError("No fue posible cargar el inventario.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleMarkAvailable = async (unit: AdminInventoryUnitDTO) => {
    if (markingId) return;
    try {
      setMarkingId(unit.id);
      setError("");
      setMessage("");
      const result = await callAdminAction(markUnitAvailable, { unitId: unit.id });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? result.issues.join(" ") : "No fue posible marcar la unidad como disponible.");
        return;
      }
      // El trigger 1D puede haber cambiado products.stock; propagar ese valor
      // a todas las tarjetas del mismo producto, no solo a la unidad tocada.
      setItems((prev) => prev.map((item) => {
        if (item.productId !== result.data.productId) return item;
        return {
          ...item,
          ...(item.id === result.data.id ? result.data : {}),
          webStock: result.data.webStock,
          erpStockEnabled: result.data.erpStockEnabled,
          erpStockSyncedAt: result.data.erpStockSyncedAt,
        };
      }));
      setMessage(`${result.data.unitCode} quedó disponible para venta.`);
    } catch {
      setError("No fue posible marcar la unidad como disponible.");
    } finally {
      setMarkingId(null);
    }
  };

  const handleStockMode = async (summary: ProductStockSummary, enabled: boolean) => {
    if (switchingProductId) return;

    if (enabled) {
      const confirmed = window.confirm(
        `Activar stock ERP para ${summary.title}?\n\nEl stock web pasará de ${summary.webStock} a ${summary.availableUnits}, porque solo cuentan las unidades físicas Disponibles.`
      );
      if (!confirmed) return;
    } else {
      const confirmed = window.confirm(
        `Volver ${summary.title} a stock manual?\n\nSe conservará el stock actual (${summary.webStock}) como punto de partida, pero después dejará de sincronizarse automáticamente.`
      );
      if (!confirmed) return;
    }

    try {
      setSwitchingProductId(summary.productId);
      setError("");
      setMessage("");
      const result = await callAdminAction(setProductStockMode, {
        productId: summary.productId,
        enabled,
      });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? result.issues.join(" ") : "No fue posible cambiar la fuente de stock.");
        return;
      }

      setItems((prev) => prev.map((item) => item.productId === result.data.productId
        ? {
            ...item,
            webStock: result.data.stock,
            erpStockEnabled: result.data.erpStockEnabled,
            erpStockSyncedAt: result.data.erpStockSyncedAt,
          }
        : item));

      setMessage(
        result.data.erpStockEnabled
          ? `Stock ERP activado. Stock web sincronizado: ${result.data.stock}.`
          : `Stock manual restaurado. Valor actual: ${result.data.stock}.`
      );
    } catch {
      setError("No fue posible cambiar la fuente de stock.");
    } finally {
      setSwitchingProductId(null);
    }
  };

  const filtered = useMemo(() => (filter === "all" ? items : items.filter((item) => item.status === filter)), [items, filter]);
  const counts = useMemo(() => {
    const result: Partial<Record<ProductUnitStatus, number>> = {};
    for (const item of items) result[item.status] = (result[item.status] ?? 0) + 1;
    return result;
  }, [items]);

  const productStockSummaries = useMemo<ProductStockSummary[]>(() => {
    const byProduct = new Map<string, ProductStockSummary>();
    for (const unit of items) {
      const existing = byProduct.get(unit.productId);
      if (existing) {
        existing.totalUnits += 1;
        if (unit.status === "available") existing.availableUnits += 1;
        existing.webStock = unit.webStock;
        existing.erpStockEnabled = unit.erpStockEnabled;
        existing.erpStockSyncedAt = unit.erpStockSyncedAt;
      } else {
        byProduct.set(unit.productId, {
          productId: unit.productId,
          title: unit.productTitle,
          brand: unit.productBrand,
          model: unit.productModel,
          webStock: unit.webStock,
          erpStockEnabled: unit.erpStockEnabled,
          erpStockSyncedAt: unit.erpStockSyncedAt,
          totalUnits: 1,
          availableUnits: unit.status === "available" ? 1 : 0,
        });
      }
    }
    return [...byProduct.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [items]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">ERP · Inventario físico</p>
          <h1 className="mt-1 text-2xl font-bold text-text">Inventario por serial</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Cada registro representa un computador físico. En productos con Stock ERP activo, el stock web se calcula automáticamente contando únicamente unidades Disponibles.
          </p>
        </div>
        <Link href="/admin/inventario/recibir" className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90">
          + Recibir computador
        </Link>
      </div>

      {message ? <p className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</p> : null}
      {error ? <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Unidades registradas</p><p className="mt-2 text-3xl font-bold text-text">{items.length}</p></div>
        <div className="rounded-2xl border border-border bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Disponibles</p><p className="mt-2 text-3xl font-bold text-text">{counts.available ?? 0}</p></div>
        <div className="rounded-2xl border border-border bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Recibidos / inspección</p><p className="mt-2 text-3xl font-bold text-text">{(counts.received ?? 0) + (counts.inspection ?? 0)}</p></div>
        <div className="rounded-2xl border border-border bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Vendidos</p><p className="mt-2 text-3xl font-bold text-text">{counts.sold ?? 0}</p></div>
      </div>

      {productStockSummaries.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Fase 1D · Fuente de stock</p>
            <h2 className="mt-1 text-lg font-bold text-text">Sincronización por producto</h2>
            <p className="mt-1 text-sm text-muted">
              Migra cada modelo cuando sus unidades físicas ya estén registradas. Activar ERP reemplaza el stock manual por el número real de unidades Disponibles.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {productStockSummaries.map((summary) => (
              <article key={summary.productId} className="rounded-xl border border-border bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-text">{summary.title}</h3>
                    <p className="text-xs text-muted">{[summary.brand, summary.model].filter(Boolean).join(" · ")}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${summary.erpStockEnabled ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                    {summary.erpStockEnabled ? "Stock ERP" : "Stock manual"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-surface p-2"><p className="text-[11px] text-muted">Stock web</p><p className="text-lg font-bold text-text">{summary.webStock}</p></div>
                  <div className="rounded-lg bg-surface p-2"><p className="text-[11px] text-muted">Disponibles</p><p className="text-lg font-bold text-green-700">{summary.availableUnits}</p></div>
                  <div className="rounded-lg bg-surface p-2"><p className="text-[11px] text-muted">Registradas</p><p className="text-lg font-bold text-text">{summary.totalUnits}</p></div>
                </div>

                {summary.erpStockEnabled ? (
                  <p className="mt-3 text-xs text-muted">Última sincronización: {formatDateTime(summary.erpStockSyncedAt)}</p>
                ) : summary.webStock !== summary.availableUnits ? (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Al activar ERP, el stock cambiará de {summary.webStock} a {summary.availableUnits}.
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={() => void handleStockMode(summary, !summary.erpStockEnabled)}
                  disabled={switchingProductId !== null}
                  className={`mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${summary.erpStockEnabled ? "border border-border text-text hover:border-primary" : "bg-primary text-white hover:opacity-90"}`}
                >
                  {switchingProductId === summary.productId
                    ? "Actualizando..."
                    : summary.erpStockEnabled
                      ? "Volver a stock manual"
                      : "Activar stock ERP"}
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter("all")} className={`rounded-full px-3 py-2 text-xs font-semibold ${filter === "all" ? "bg-primary text-white" : "bg-surface text-muted"}`}>Todos ({items.length})</button>
        {(["received", "inspection", "available", "reserved", "sold", "warranty", "repair", "returned", "retired"] as ProductUnitStatus[]).map((status) => (
          <button key={status} onClick={() => setFilter(status)} className={`rounded-full px-3 py-2 text-xs font-semibold ${filter === status ? "bg-primary text-white" : "bg-surface text-muted"}`}>{STATUS_LABELS[status]} ({counts[status] ?? 0})</button>
        ))}
      </div>

      {loading ? <p className="text-sm text-muted">Cargando inventario...</p> : null}
      {!loading && !error && filtered.length === 0 ? <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">No hay unidades en este estado.</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((unit) => {
          const details = overrideText(unit);
          const canMarkAvailable = unit.status === "received" || unit.status === "inspection";
          return (
            <article key={unit.id} className="rounded-2xl border border-border bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-mono text-sm font-bold text-primary">{unit.unitCode}</p><h2 className="mt-1 font-semibold text-text">{unit.productTitle}</h2><p className="text-xs text-muted">{[unit.productBrand, unit.productModel].filter(Boolean).join(" · ")}</p></div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[unit.status]}`}>{STATUS_LABELS[unit.status]}</span>
              </div>

              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-muted">Serial</dt><dd className="break-all text-right font-medium text-text">{unit.serialNumber ?? "Sin registrar"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Recibido</dt><dd className="text-right text-text">{formatDate(unit.receivedAt)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Costo</dt><dd className="text-right text-text">{unit.acquisitionCostCop == null ? "—" : formatCOP(unit.acquisitionCostCop)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Batería</dt><dd className="text-right text-text">{unit.batteryHealthPercent == null ? "—" : `${unit.batteryHealthPercent}%`}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Disco</dt><dd className="text-right text-text">{unit.storageHealthPercent == null ? "—" : `${unit.storageHealthPercent}% salud`}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Stock web actual</dt><dd className="text-right font-semibold text-text">{unit.webStock} {unit.erpStockEnabled ? "· ERP" : "· Manual"}</dd></div>
              </dl>

              {details ? <p className="mt-4 rounded-xl bg-surface px-3 py-2 text-xs text-muted">Configuración física: {details}</p> : null}
              {unit.notes ? <p className="mt-3 text-xs text-muted">{unit.notes}</p> : null}

              {canMarkAvailable ? (
                <button
                  type="button"
                  onClick={() => void handleMarkAvailable(unit)}
                  disabled={markingId !== null}
                  className="mt-4 w-full rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {markingId === unit.id ? "Marcando..." : "Marcar disponible para venta"}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
