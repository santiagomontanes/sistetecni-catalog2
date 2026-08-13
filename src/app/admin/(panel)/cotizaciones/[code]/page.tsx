"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { callAdminAction } from "@/lib/callAdminAction";
import { getQuoteDetail, updateQuoteStatus } from "@/app/admin/personalizador/actions";
import { formatCOP } from "@/lib/personalizadorUi";
import type { AdminQuoteDetailDTO } from "@/lib/personalizadorAdmin/types";
import type { QuoteStatus } from "@/types/quote";

const QUOTE_STATUSES: QuoteStatus[] = [
  "nueva",
  "en_revision",
  "contactada",
  "cotizada",
  "aceptada",
  "rechazada",
  "expirada",
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

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export default function AdminCotizacionDetallePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = decodeURIComponent(params.code);

  const [quote, setQuote] = useState<AdminQuoteDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotFound(false);
    try {
      const result = await callAdminAction(getQuoteDetail, { code });
      if (!result.ok) {
        if (result.error === "NOT_FOUND") setNotFound(true);
        else setError(result.error === "FORBIDDEN" ? "No tienes permisos de administrador." : "No se pudo cargar la cotización.");
        return;
      }
      setQuote(result.data);
    } catch {
      setError("No se pudo cargar la cotización.");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleStatusChange(newStatus: QuoteStatus) {
    if (!quote) return;
    setStatusSaving(true);
    setError("");
    try {
      const result = await callAdminAction(updateQuoteStatus, { quoteId: quote.id, status: newStatus });
      if (!result.ok) {
        setError("No se pudo cambiar el estado.");
        return;
      }
      setQuote(result.data);
    } catch {
      setError("No se pudo cambiar el estado.");
    } finally {
      setStatusSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted">Cargando...</p>;

  if (notFound) {
    return (
      <div className="space-y-4">
        <p className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
          No se encontró ninguna cotización con el código &quot;{code}&quot;.
        </p>
        <button type="button" onClick={() => router.push("/admin/cotizaciones")} className="text-sm font-semibold text-primary underline">
          Volver al listado
        </button>
      </div>
    );
  }

  if (error && !quote) {
    return <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>;
  }

  if (!quote) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/cotizaciones" className="text-xs font-semibold text-primary hover:underline">
            ← Volver al listado
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-text">{quote.code}</h1>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="status-select" className="text-sm text-muted">
            Estado
          </label>
          <select
            id="status-select"
            value={quote.status}
            disabled={statusSaving}
            onChange={(e) => void handleStatusChange(e.target.value as QuoteStatus)}
            className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-text outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          >
            {QUOTE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {quote.isVisuallyExpired ? (
        <span className="inline-block rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">Expirada</span>
      ) : null}
      {error ? <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1 rounded-2xl border border-border bg-white p-4 text-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Datos generales</p>
          <div className="flex justify-between">
            <span className="text-muted">Fecha</span>
            <span className="text-text">{formatDateTime(quote.createdAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Expira</span>
            <span className="text-text">{formatDateTime(quote.expiresAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Ciudad</span>
            <span className="text-text">{quote.customerCity ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Tipo</span>
            <span className="text-text">{quote.isSpecialRequest ? "Especial" : "Normal"}</span>
          </div>
          {quote.customerNote ? (
            <div className="pt-2">
              <span className="text-muted">Nota</span>
              <p className="text-text">{quote.customerNote}</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-1 rounded-2xl border border-border bg-white p-4 text-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Requisitos solicitados</p>
          <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-text">
            {JSON.stringify(quote.requestedConfig, null, 2)}
          </pre>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-white p-4 text-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
          Producto base y configuración — snapshot congelado al momento de la cotización
        </p>
        {quote.baseConfigSnapshot ? (
          <div className="grid gap-4 md:grid-cols-2">
            <dl className="space-y-1">
              <div className="flex justify-between">
                <dt className="text-muted">Producto</dt>
                <dd className="text-text">{quote.baseConfigSnapshot.title}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Marca / Modelo</dt>
                <dd className="text-text">
                  {quote.baseConfigSnapshot.brand} · {quote.baseConfigSnapshot.model}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">CPU</dt>
                <dd className="text-text">{quote.baseConfigSnapshot.cpu}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">RAM / Almacenamiento original</dt>
                <dd className="text-text">
                  {quote.baseConfigSnapshot.ram} GB · {quote.baseConfigSnapshot.storage}
                </dd>
              </div>
            </dl>

            <div>
              <p className="mb-1 text-xs font-semibold text-muted">Upgrades elegidos</p>
              {quote.selectedUpgradesSnapshot.length === 0 ? (
                <p className="text-muted">Ninguno — configuración tal cual.</p>
              ) : (
                <ul className="space-y-1">
                  {quote.selectedUpgradesSnapshot.map((u, idx) => (
                    <li key={idx} className="flex justify-between">
                      <span className="text-text">{u.label}</span>
                      <span className="text-muted">+{formatCOP(u.extra_cost)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 space-y-1 border-t border-border pt-3">
                <div className="flex justify-between">
                  <span className="text-muted">Precio base</span>
                  <span className="text-text">{quote.basePriceSnapshot !== null ? formatCOP(quote.basePriceSnapshot) : "—"}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span className="text-text">Precio estimado</span>
                  <span className="text-text">
                    {quote.estimatedPrice !== null ? formatCOP(quote.estimatedPrice) : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-muted">Cotización especial — sin producto base asignado.</p>
        )}
      </div>
    </div>
  );
}
