"use client";

import StepShell from "./StepShell";
import Badge from "./Badge";
import PriceBreakdown from "./PriceBreakdown";
import { budgetBadge, stockBadge, buildPriceBreakdown, resolveImageUrl } from "@/lib/personalizadorUi";
import type { SearchOptionDTO } from "@/lib/personalizadorServer";

interface ConfigurationScreenProps {
  progress: { current: number; total: number } | null;
  onBack: () => void;
  candidate: SearchOptionDTO;
  onRequestQuote: () => void;
}

function gpuLabel(gpuType: "integrada" | "dedicada" | null): string {
  if (gpuType === "dedicada") return "Dedicada";
  if (gpuType === "integrada") return "Integrada";
  return "No confirmado";
}

/** Punto 10 del pedido: qué traía el equipo (base) vs. tu configuración final — deja claro qué cambió. */
export default function ConfigurationScreen({ progress, onBack, candidate, onRequestQuote }: ConfigurationScreenProps) {
  const budget = budgetBadge(candidate.budgetStatus);
  const stock = stockBadge(candidate.stockStatus);
  const breakdown = buildPriceBreakdown({
    basePrice: candidate.basePrice,
    selectedUpgrades: candidate.selectedUpgrades,
    finalPrice: candidate.finalPrice,
  });
  const isOutOfStock = candidate.stockStatus === "OUT_OF_STOCK";

  return (
    <StepShell title="Tu configuración" progress={progress} onBack={onBack}>
      <div className="space-y-5">
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen dinámica con fallback, mismo criterio que ProductCard.tsx */}
          <img
            src={resolveImageUrl(candidate.images)}
            alt={candidate.title}
            className="aspect-video w-full object-cover"
          />
          <div className="space-y-1 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {candidate.brand} · {candidate.model}
            </p>
            <h2 className="text-base font-semibold text-text">{candidate.title}</h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge label={budget.label} tone={budget.tone} />
          <Badge label={stock.label} tone={stock.tone} />
        </div>

        {isOutOfStock ? (
          <div className="rounded-xl bg-surface p-3 text-sm text-muted">
            Podemos ayudarte a buscar uno similar disponible.
          </div>
        ) : null}

        <section className="grid grid-cols-2 gap-4 rounded-2xl border border-border bg-white p-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Portátil base</h3>
            <dl className="space-y-1.5 text-sm">
              <div>
                <dt className="text-muted">Procesador</dt>
                <dd className="font-medium text-text">{candidate.cpu}</dd>
              </div>
              <div>
                <dt className="text-muted">RAM original</dt>
                <dd className="font-medium text-text">{candidate.baseRamGb} GB</dd>
              </div>
              <div>
                <dt className="text-muted">Almacenamiento original</dt>
                <dd className="font-medium text-text">{candidate.baseStorage}</dd>
              </div>
              <div>
                <dt className="text-muted">Pantalla</dt>
                <dd className="font-medium text-text">{candidate.screen}</dd>
              </div>
              <div>
                <dt className="text-muted">Gráfica</dt>
                <dd className="font-medium text-text">{gpuLabel(candidate.gpuType)}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">Tu configuración</h3>
            <dl className="space-y-1.5 text-sm">
              <div>
                <dt className="text-muted">RAM final</dt>
                <dd className="font-semibold text-primary">{candidate.finalConfiguration.ramGb} GB</dd>
              </div>
              <div>
                <dt className="text-muted">Almacenamiento final</dt>
                <dd className="font-semibold text-primary">{candidate.finalConfiguration.storageGb} GB</dd>
              </div>
            </dl>
            {candidate.selectedUpgrades.length > 0 ? (
              <ul className="mt-3 space-y-1 text-xs text-muted">
                {candidate.selectedUpgrades.map((u, idx) => (
                  <li key={idx}>+ {u.label}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-muted">Sin cambios — ya cumple lo que buscas.</p>
            )}
          </div>
        </section>

        {breakdown ? (
          <div className="rounded-2xl border border-border bg-white p-4">
            <PriceBreakdown breakdown={breakdown} />
          </div>
        ) : null}

        <button
          type="button"
          onClick={onRequestQuote}
          className="w-full rounded-full bg-primary py-3.5 text-sm font-semibold text-white transition hover:bg-primary/90"
        >
          Solicitar cotización
        </button>
      </div>
    </StepShell>
  );
}
