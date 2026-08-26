"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { callAdminAction } from "@/lib/callAdminAction";
import { listSales } from "@/app/admin/ventas/actions";
import { downloadAdminSalePdf } from "@/lib/downloadAdminSalePdf";
import { formatCOP } from "@/lib/personalizadorUi";
import type { AdminSaleListItemDTO } from "@/lib/salesAdmin/types";

const PAGE_SIZE = 20;

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  nequi: "Nequi",
  daviplata: "Daviplata",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  pagado: "bg-green-50 text-green-700",
  pendiente: "bg-amber-50 text-amber-700",
  parcial: "bg-blue-50 text-blue-700",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pagado: "Pagado",
  pendiente: "Pendiente",
  parcial: "Parcial",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}

export default function AdminVentasPage() {
  const [sales, setSales] = useState<AdminSaleListItemDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async (searchTerm: string) => {
    try {
      setLoading(true);
      setError("");
      const result = await callAdminAction(listSales, {
        ...(searchTerm ? { search: searchTerm } : {}),
        offset: 0,
        pageSize: PAGE_SIZE,
      });
      if (!result.ok) {
        setError(result.error === "FORBIDDEN" ? "No tienes permisos de administrador." : "No fue posible cargar las ventas.");
        return;
      }
      setSales(result.data.items);
      setTotal(result.data.total);
    } catch {
      setError("No fue posible cargar las ventas.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || sales.length >= total) return;
    try {
      setLoadingMore(true);
      const result = await callAdminAction(listSales, {
        ...(search ? { search } : {}),
        offset: sales.length,
        pageSize: PAGE_SIZE,
      });
      if (result.ok) {
        setSales((prev) => [...prev, ...result.data.items]);
        setTotal(result.data.total);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, sales.length, total, search]);

  useEffect(() => {
    void load("");
  }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void load(search.trim());
  };

  const handleDownload = async (sale: AdminSaleListItemDTO) => {
    try {
      setDownloadingId(sale.id);
      await downloadAdminSalePdf(sale.id, sale.saleNumber);
    } catch {
      setError("No fue posible descargar el PDF.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">Ventas</h1>
          <p className="mt-1 text-sm text-muted">{total} comprobante{total !== 1 ? "s" : ""}</p>
        </div>
        <Link
          href="/admin/ventas/nueva"
          className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          + Nueva venta
        </Link>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por número, nombre, documento o celular"
          className="min-w-0 flex-1 rounded-xl border border-border bg-white px-4 py-3 text-sm text-text placeholder:text-muted outline-none focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Buscar
        </button>
      </form>

      {loading ? <p className="text-sm text-muted">Cargando...</p> : null}
      {error ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      ) : null}

      {!loading && !error && sales.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
          No hay ventas registradas todavía.
        </p>
      ) : null}

      {!loading && sales.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sales.map((sale) => (
            <div key={sale.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link href={`/admin/ventas/${sale.id}`} className="font-semibold text-primary hover:underline">
                    {sale.saleNumber}
                  </Link>
                  <p className="text-xs text-muted">{formatDate(sale.createdAt)}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    PAYMENT_STATUS_STYLES[sale.paymentStatus] ?? "bg-surface text-text"
                  }`}
                >
                  {PAYMENT_STATUS_LABELS[sale.paymentStatus] ?? sale.paymentStatus}
                </span>
              </div>

              <div>
                <p className="font-medium text-text">{sale.customerName}</p>
                <p className="text-xs text-muted">{sale.customerPhoneMasked}</p>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-lg font-bold text-text">{formatCOP(sale.totalCop)}</p>
                <p className="text-xs text-muted">{PAYMENT_METHOD_LABELS[sale.paymentMethod] ?? sale.paymentMethod}</p>
              </div>

              <div className="flex gap-2 pt-1">
                <Link
                  href={`/admin/ventas/${sale.id}`}
                  className="flex-1 rounded-xl border border-border py-2.5 text-center text-sm font-semibold text-text transition hover:border-primary hover:text-primary"
                >
                  Ver
                </Link>
                <button
                  type="button"
                  onClick={() => void handleDownload(sale)}
                  disabled={downloadingId === sale.id}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {downloadingId === sale.id ? "..." : "Descargar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && sales.length < total ? (
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="rounded-xl border border-border px-5 py-3 text-sm font-semibold text-text transition hover:border-primary hover:text-primary disabled:opacity-60"
          >
            {loadingMore ? "Cargando..." : `Cargar más (${total - sales.length} restantes)`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
