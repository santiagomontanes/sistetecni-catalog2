"use client";

import Badge from "./Badge";
import { formatCOP, budgetBadge, stockBadge, resolveImageUrl, classificationLabel } from "@/lib/personalizadorUi";
import type { SearchOptionDTO } from "@/lib/personalizadorServer";

interface CandidateCardProps {
  option: SearchOptionDTO;
  onSelect: () => void;
}

/**
 * Punto 6 del pedido: nunca IDs técnicos, nunca reason codes crudos —
 * classificationLabel()/budgetBadge()/stockBadge() ya traducen todo.
 */
export default function CandidateCard({ option, onSelect }: CandidateCardProps) {
  const budget = budgetBadge(option.budgetStatus);
  const stock = stockBadge(option.stockStatus);
  const isOutOfStock = option.stockStatus === "OUT_OF_STOCK";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white">
      <div className="relative aspect-video overflow-hidden bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen dinámica con fallback, mismo criterio que ProductCard.tsx */}
        <img
          src={resolveImageUrl(option.images)}
          alt={option.title}
          loading="lazy"
          className="h-full w-full object-cover"
        />
        {isOutOfStock ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm">
            <span className="rounded-full bg-text px-4 py-1.5 text-xs font-semibold text-white">Agotado</span>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {option.brand} · {option.model}
          </p>
          <h3 className="text-sm font-semibold leading-snug text-text">{option.title}</h3>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">{option.cpu}</span>
          <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
            {option.finalConfiguration.ramGb} GB RAM
          </span>
          <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
            {option.finalConfiguration.storageGb} GB
          </span>
        </div>

        <p className="text-xs font-medium text-primary">{classificationLabel(option.classification)}</p>

        {option.selectedUpgrades.length > 0 ? (
          <ul className="space-y-0.5 text-xs text-muted">
            {option.selectedUpgrades.map((u, idx) => (
              <li key={idx}>
                + {u.label} ({formatCOP(u.extraCost)})
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Badge label={budget.label} tone={budget.tone} />
          <Badge label={stock.label} tone={stock.tone} />
        </div>

        <p className="text-xl font-bold text-text">{formatCOP(option.finalPrice)}</p>

        <button
          type="button"
          onClick={onSelect}
          className="block w-full rounded-full border border-primary py-2.5 text-center text-xs font-semibold text-primary transition hover:bg-primary hover:text-white"
        >
          Ver configuración
        </button>
      </div>
    </div>
  );
}
