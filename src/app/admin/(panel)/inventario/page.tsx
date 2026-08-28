"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { callAdminAction } from "@/lib/callAdminAction";
import { listInventory, setProductStockMode, transitionUnit } from "@/app/admin/inventario/actions";
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

const TARGETS: Record<ProductUnitStatus, readonly ProductUnitStatus[]> = {
  received: ["inspection", "available", "retired"],
  inspection: ["available", "repair", "retired"],
  available: ["reserved", "repair", "retired"],
  reserved: ["available", "repair", "retired"],
  sold: ["warranty", "returned"],
  warranty: ["repair", "sold", "retired"],
  repair: ["available", "sold", "retired"],
  returned: ["repair", "retired"],
  retired: [],
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
    year: "numeric",
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

function actionLabel(from: ProductUnitStatus, to: ProductUnitStatus): string {
  if (from === "reserved" && to === "available") return "Liberar reserva";
  if ((from === "warranty" || from === "repair") && to === "sold") return "Devolver al cliente";
  const labels: Partial<Record<ProductUnitStatus, string>> = {
    inspection: "Enviar a inspección",
    available: "Marcar disponible",
    reserved: "Reservar",
    warranty: "Ingresar a garantía",
    repair: "Enviar a reparación",
    returned: "Registrar devolución",
    retired: "Retirar unidad",
  };
  return labels[to] ?? STATUS_LABELS[to];
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
  const [changingId, setChangingId] = useState<string | null>(null);
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

  const applyUpdatedUnit = (updated: AdminInventoryUnitDTO) => {
    setItems((prev) => prev.map((item) => {
      if (item.productId !== updated.productId) return item;
      return {
        ...item,
        ...(item.id === updated.id ? updated : {}),
        webStock: updated.webStock,
        erpStockEnabled: updated.erpStockEnabled,
        erpStockSyncedAt: updated.erpStockSyncedAt,
      };
    }));
  };

  const handleTransition = async (unit: AdminInventoryUnitDTO, toStatus: ProductUnitStatus) => {
    if (changingId) return;

    let reason: string | undefined;
    let reservationCustomerName: string | undefined;
    let reservationCustomerPhone: string | undefined;
    let reservationExpiresAt: string | undefined;

    if (toStatus === "reserved") {
      const name = window.prompt(`Reservar ${unit.unitCode}.\n\nNombre del cliente:`)?.trim();
      if (!name) return;
      reservationCustomerName = name;
      reservationCustomerPhone = window.prompt("Celular del cliente (opcional):")?.trim() || undefined;
      const hoursText = window.prompt("Duración de la reserva en horas (opcional, sugerido 24):", "24")?.trim();
      if (hoursText) {
        const hours = Number(hoursText);
        if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 30) {
          setError("La duración de la reserva debe estar entre 1 hora y 30 días.");
          return;
        }
        reservationExpiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      }
      reason = window.prompt("Nota de la reserva (opcional):")?.trim() || undefined;
    } else if (["repair", "warranty", "returned", "retired"].includes(toStatus)) {
      const value = window.prompt(`Motivo para pasar ${unit.unitCode} a ${STATUS_LABELS[toStatus]}:`)?.trim();
      if (!value) return;
      reason = value;
    } else if (toStatus === "sold") {
      const confirmed = window.confirm(
        `¿Confirmas que ${unit.unitCode} terminó garantía/reparación y fue devuelto al cliente original?\n\nEsto NO crea una venta nueva.`
      );
      if (!confirmed) return;
    }

    try {
      setChangingId(unit.id);
      setError("");
      setMessage("");
      const result = await callAdminAction(transitionUnit, {
        unitId: unit.id,
        toStatus,
        reason,
        reservationCustomerName,
        reservationCustomerPhone,
        reservationExpiresAt,
      });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? result.issues.join(" ") : "No fue posible cambiar el estado de la unidad.");
        return;
      }
      applyUpdatedUnit(result.data);
      setMessage(`${result.data.unitCode}: ${STATUS_LABELS[unit.status]} → ${STATUS_LABELS[result.data.status]}.`);
    } catch {
      setError("No fue posible cambiar el estado de la unidad.");
    } finally {
      setChangingId(null);
    }
  };

  const handleStockMode = async (summary: ProductStockSummary, enabled: boolean) => {
    if (switchingProductId) return;
    const confirmed = window.confirm(
      enabled
        ? `Activar stock ERP para ${summary.title}?\n\nEl stock web pasará de ${summary.webStock} a ${summary.availableUnits}; solo cuentan unidades Disponibles.`
        : `Volver ${summary.title} a stock manual?\n\nSe conservará el stock actual (${summary.webStock}) como punto de partida.`
    );
    if (!confirmed) return;

    try {
      setSwitchingProductId(summary.productId);
      setError("");
      setMessage("");
      const result = await callAdminAction(setProductStockMode, { productId: summary.productId, enabled });
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? result.issues.join(" ") : "No fue posible cambiar la fuente de stock.");
        return;
      }
      setItems((prev) => prev.map((item) => item.productId === result.data.productId
        ? { ...item, webStock: result.data.stock, erpStockEnabled: result.data.erpStockEnabled, erpStockSyncedAt: result.data.erpStockSyncedAt }
        : item));
      setMessage(result.data.erpStockEnabled
        ? `Stock ERP activado. Stock web: ${result.data.stock}.`
        : `Stock manual restaurado. Valor actual: ${result.data.stock}.`);
    } catch {
      setError("No fue posible cambiar la fuente de stock.");
    } finally {
      setSwitchingProductId(null);
    }
  };

  const filtered = useMemo(() => filter === "all" ? items : items.filter((item) => item.status === filter), [items, filter]);
  const counts = useMemo(() => {
    const result: Partial<Record<ProductUnitStatus, number>> = {};
    for (const item of items) result[item.status] = (result[item.status] ?? 0) + 1;
    return result;
  }, [items]);

  const productStockSummaries = useMemo<ProductStockSummary[]>(() => {
    const byProduct = new Map<string, ProductStockSummary>();
    for (const unit of items) {
      const current = byProduct.get(unit.productId);
      if (current) {
        current.totalUnits += 1;
        if (unit.status === "available") current.availableUnits += 1;
        current.webStock = unit.webStock;
        current.erpStockEnabled = unit.erpStockEnabled;
        current.erpStockSyncedAt = unit.erpStockSyncedAt;
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
            Fase 1E controla reservas, inspección, reparación, garantía, devolución y retiro. El estado Vendido solo nace de una venta real o del retorno al cliente después de garantía/reparación.
          </p>
        </div>
        <Link href="/admin/inventario/recibir" className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90">+ Recibir computador</Link>
      </div>

      {message ? <p className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</p> : null}
      {error ? <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Unidades</p><p className="mt-2 text-3xl font-bold text-text">{items.length}</p></div>
        <div className="rounded-2xl border border-border bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Disponibles</p><p className="mt-2 text-3xl font-bold text-text">{counts.available ?? 0}</p></div>
        <div className="rounded-2xl border border-border bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Reservadas</p><p className="mt-2 text-3xl font-bold text-text">{counts.reserved ?? 0}</p></div>
        <div className="rounded-2xl border border-border bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Servicio</p><p className="mt-2 text-3xl font-bold text-text">{(counts.warranty ?? 0) + (counts.repair ?? 0)}</p></div>
      </div>

      {productStockSummaries.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Fase 1D · Fuente de stock</p>
            <h2 className="mt-1 text-lg font-bold text-text">Sincronización por producto</h2>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {productStockSummaries.map((summary) => (
              <article key={summary.productId} className="rounded-xl border border-border bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="font-semibold text-text">{summary.title}</h3><p className="text-xs text-muted">{[summary.brand, summary.model].filter(Boolean).join(" · ")}</p></div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${summary.erpStockEnabled ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>{summary.erpStockEnabled ? "Stock ERP" : "Stock manual"}</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-surface p-2"><p className="text-[11px] text-muted">Stock web</p><p className="text-lg font-bold text-text">{summary.webStock}</p></div>
                  <div className="rounded-lg bg-surface p-2"><p className="text-[11px] text-muted">Disponibles</p><p className="text-lg font-bold text-green-700">{summary.availableUnits}</p></div>
                  <div className="rounded-lg bg-surface p-2"><p className="text-[11px] text-muted">Registradas</p><p className="text-lg font-bold text-text">{summary.totalUnits}</p></div>
                </div>
                {summary.erpStockEnabled ? <p className="mt-3 text-xs text-muted">Última sincronización: {formatDateTime(summary.erpStockSyncedAt)}</p> : null}
                <button type="button" onClick={() => void handleStockMode(summary, !summary.erpStockEnabled)} disabled={switchingProductId !== null} className={`mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${summary.erpStockEnabled ? "border border-border text-text hover:border-primary" : "bg-primary text-white hover:opacity-90"}`}>
                  {switchingProductId === summary.productId ? "Actualizando..." : summary.erpStockEnabled ? "Volver a stock manual" : "Activar stock ERP"}
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
          const targets = TARGETS[unit.status].filter((target) => !(target === "sold" && !unit.reservedAt && unit.status === "repair"));
          const expiredReservation = unit.status === "reserved" && unit.reservationExpiresAt && new Date(unit.reservationExpiresAt).getTime() < Date.now();
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
                <div className="flex justify-between gap-4"><dt className="text-muted">Stock web</dt><dd className="text-right font-semibold text-text">{unit.webStock} · {unit.erpStockEnabled ? "ERP" : "Manual"}</dd></div>
              </dl>

              {details ? <p className="mt-4 rounded-xl bg-surface px-3 py-2 text-xs text-muted">Configuración física: {details}</p> : null}

              {unit.status === "reserved" ? (
                <div className={`mt-4 rounded-xl border p-3 text-xs ${expiredReservation ? "border-red-200 bg-red-50 text-red-800" : "border-violet-200 bg-violet-50 text-violet-800"}`}>
                  <p className="font-semibold">Reserva: {unit.reservationCustomerName ?? "Cliente sin nombre"}</p>
                  {unit.reservationCustomerPhone ? <p>Celular: {unit.reservationCustomerPhone}</p> : null}
                  <p>{unit.reservationExpiresAt ? `Vence: ${formatDateTime(unit.reservationExpiresAt)}` : "Sin vencimiento definido"}</p>
                  {expiredReservation ? <p className="mt-1 font-semibold">Reserva vencida: sigue bloqueada hasta liberarla manualmente.</p> : null}
                  {unit.reservationNote ? <p className="mt-1">Nota: {unit.reservationNote}</p> : null}
                </div>
              ) : null}

              {unit.notes ? <p className="mt-3 text-xs text-muted">{unit.notes}</p> : null}

              {targets.length > 0 ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {targets.map((target) => (
                    <button key={target} type="button" onClick={() => void handleTransition(unit, target)} disabled={changingId !== null} className="rounded-xl border border-border px-3 py-2.5 text-xs font-semibold text-text transition hover:border-primary hover:text-primary disabled:opacity-60">
                      {changingId === unit.id ? "Actualizando..." : actionLabel(unit.status, target)}
                    </button>
                  ))}
                </div>
              ) : <p className="mt-4 rounded-xl bg-surface px-3 py-2 text-xs text-muted">Sin transiciones operativas pendientes.</p>}
            </article>
          );
        })}
      </div>
    </div>
  );
}
