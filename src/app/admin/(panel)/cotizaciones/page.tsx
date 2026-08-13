"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { callAdminAction } from "@/lib/callAdminAction";
import { listQuotes } from "@/app/admin/personalizador/actions";
import { formatCOP } from "@/lib/personalizadorUi";
import type { AdminQuoteListItemDTO } from "@/lib/personalizadorAdmin/types";
import type { QuoteStatus } from "@/types/quote";

const STATUS_FILTERS: { value: QuoteStatus | "todas"; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "nueva", label: "Nuevas" },
  { value: "contactada", label: "Contactadas" },
  { value: "en_revision", label: "En revisión" },
  { value: "cotizada", label: "Cotizadas" },
  { value: "aceptada", label: "Aceptadas" },
  { value: "rechazada", label: "Rechazadas" },
  { value: "expirada", label: "Expiradas" },
];

const STATUS_LABEL: Record<QuoteStatus, string> = {
  nueva: "Nueva",
  en_revision: "En revisión",
  contactada: "Contactada",
  cotizada: "Cotizada",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  expirada: "Expirada",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}

export default function AdminCotizacionesPage() {
  const [quotes, setQuotes] = useState<AdminQuoteListItemDTO[]>([]);
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "todas">("todas");
  const [codeSearch, setCodeSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (filter: { status?: QuoteStatus; codeSearch?: string }) => {
    try {
      setLoading(true);
      setError("");
      const result = await callAdminAction(listQuotes, filter);
      if (!result.ok) {
        setError(result.error === "FORBIDDEN" ? "No tienes permisos de administrador." : "No fue posible cargar las cotizaciones.");
        return;
      }
      setQuotes(result.data);
    } catch {
      setError("No fue posible cargar las cotizaciones.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(statusFilter === "todas" ? {} : { status: statusFilter });
  }, [load, statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void load({
      ...(statusFilter !== "todas" ? { status: statusFilter } : {}),
      ...(codeSearch.trim() ? { codeSearch: codeSearch.trim() } : {}),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Solicitudes de cotización</h1>
        <p className="mt-1 text-sm text-muted">{quotes.length} resultado{quotes.length !== 1 ? "s" : ""}</p>
      </div>

      <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition ${
              statusFilter === f.value
                ? "border-primary bg-primary text-white"
                : "border-border bg-white text-muted hover:border-primary hover:text-primary"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          value={codeSearch}
          onChange={(e) => setCodeSearch(e.target.value)}
          placeholder="Buscar por código (ej. COT-ABCDEFGHJ)"
          className="w-64 rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-text placeholder:text-muted outline-none focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="submit"
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Buscar
        </button>
      </form>

      {loading ? <p className="text-sm text-muted">Cargando...</p> : null}
      {error ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      ) : null}

      {!loading && !error && quotes.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
          No hay cotizaciones con esos filtros.
        </p>
      ) : null}

      {!loading && quotes.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-border bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Producto base</th>
                <th className="px-4 py-3">Precio estimado</th>
                <th className="px-4 py-3">Ciudad</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link href={`/admin/cotizaciones/${q.code}`} className="font-semibold text-primary hover:underline">
                      {q.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatDate(q.createdAt)}</td>
                  <td className="px-4 py-3 text-muted">{q.isSpecialRequest ? "Especial" : "Normal"}</td>
                  <td className="px-4 py-3 text-text">{q.productTitle ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-text">
                    {q.estimatedPrice !== null ? formatCOP(q.estimatedPrice) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">{q.customerCity ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-text w-fit">
                        {STATUS_LABEL[q.status]}
                      </span>
                      {q.isVisuallyExpired ? (
                        <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 w-fit">
                          Expirada
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
