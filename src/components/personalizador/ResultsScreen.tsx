"use client";

import StepShell from "./StepShell";
import CandidateCard from "./CandidateCard";
import { formatCOP } from "@/lib/personalizadorUi";
import type { AsyncStatus, CustomerRequirements } from "@/lib/personalizadorUi";
import type { SearchOptionDTO, SearchOptionsResponse } from "@/lib/personalizadorServer";

interface ResultsScreenProps {
  progress: { current: number; total: number } | null;
  onBack: () => void;
  status: AsyncStatus;
  errorMessage: string | null;
  result: SearchOptionsResponse | null;
  staleSelectionMessage: string | null;
  requirements: CustomerRequirements | null;
  onSelectCandidate: (candidate: SearchOptionDTO) => void;
  onRequestSpecialQuote: () => void;
  onRetry: () => void;
}

function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-border bg-white">
      <div className="aspect-video bg-surface" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-2/5 rounded-md bg-border" />
        <div className="h-4 w-4/5 rounded-md bg-border" />
        <div className="h-6 w-2/5 rounded-md bg-border" />
      </div>
    </div>
  );
}

export default function ResultsScreen({
  progress,
  onBack,
  status,
  errorMessage,
  result,
  staleSelectionMessage,
  requirements,
  onSelectCandidate,
  onRequestSpecialQuote,
  onRetry,
}: ResultsScreenProps) {
  return (
    <StepShell title="Resultados" progress={progress} onBack={onBack}>
      {staleSelectionMessage ? (
        <div role="status" className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {staleSelectionMessage}
        </div>
      ) : null}

      {status === "loading" ? (
        <div className="space-y-4">
          <p className="text-center text-sm text-muted">Buscando las mejores opciones para ti…</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      ) : null}

      {status === "error" ? (
        <div role="alert" className="space-y-3 rounded-2xl border border-red-100 bg-red-50 p-5 text-center">
          <p className="text-sm text-red-600">{errorMessage ?? "No se pudo completar la búsqueda."}</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {status === "success" && result ? (
        <div className="space-y-6">
          {result.specialQuoteRequired ? (
            <div className="space-y-4 rounded-2xl border border-border bg-surface p-6 text-center">
              <p className="text-3xl" aria-hidden="true">🔍</p>
              <p className="font-semibold text-text">No encontramos exactamente esa configuración</p>
              <p className="text-sm text-muted">Podemos ayudarte a buscar una opción especial.</p>

              {requirements ? (
                <dl className="mx-auto max-w-xs space-y-1 rounded-xl bg-white p-4 text-left text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted">Presupuesto</dt>
                    <dd className="font-medium text-text">{formatCOP(requirements.budgetMax)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">RAM mínima</dt>
                    <dd className="font-medium text-text">{requirements.ramMinGb} GB</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Almacenamiento mínimo</dt>
                    <dd className="font-medium text-text">{requirements.storageMinGb} GB</dd>
                  </div>
                </dl>
              ) : null}

              <button
                type="button"
                onClick={onRequestSpecialQuote}
                className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary/90"
              >
                Solicitar cotización especial
              </button>
            </div>
          ) : (
            <>
              {result.available.length > 0 ? (
                <section>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Disponibles</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {result.available.map((option) => (
                      <CandidateCard key={option.productId} option={option} onSelect={() => onSelectCandidate(option)} />
                    ))}
                  </div>
                </section>
              ) : null}

              {result.referenceOnly.length > 0 ? (
                <section>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                    Referencia / agotados
                  </h2>
                  <p className="mb-3 text-xs text-muted">
                    Estos equipos coinciden con lo que buscas, pero están agotados por ahora.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {result.referenceOnly.map((option) => (
                      <CandidateCard key={option.productId} option={option} onSelect={() => onSelectCandidate(option)} />
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </StepShell>
  );
}
