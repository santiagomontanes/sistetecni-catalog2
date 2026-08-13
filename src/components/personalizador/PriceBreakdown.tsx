"use client";

import { useState } from "react";
import { formatCOP } from "@/lib/personalizadorUi";
import type { PriceBreakdownViewModel } from "@/lib/personalizadorUi";

/**
 * D13: el precio final es el dato principal, siempre visible. El
 * desglose está detrás de "Ver desglose" — y muestra EXACTAMENTE lo que
 * B4 devolvió (breakdown ya viene calculado, este componente no suma nada).
 */
export default function PriceBreakdown({ breakdown }: { breakdown: PriceBreakdownViewModel }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <p className="text-2xl font-bold text-primary">{formatCOP(breakdown.total)}</p>
      <p className="text-xs text-muted">Precio estimado</p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-1 text-xs font-semibold text-primary underline underline-offset-2"
      >
        {open ? "Ocultar desglose" : "Ver desglose"}
      </button>

      {open ? (
        <dl className="mt-2 space-y-1 rounded-xl bg-surface p-3 text-sm">
          {breakdown.rows.map((row, idx) => (
            <div key={`${row.label}-${idx}`} className="flex items-center justify-between">
              <dt className="text-muted">{row.label}</dt>
              <dd className="font-medium text-text">
                {idx === 0 ? formatCOP(row.amount) : `+${formatCOP(row.amount)}`}
              </dd>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-border pt-1 font-semibold">
            <dt>Estimado</dt>
            <dd>{formatCOP(breakdown.total)}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
