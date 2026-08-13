"use client";

import type { ReactNode } from "react";

interface StepShellProps {
  title: string;
  subtitle?: string;
  progress: { current: number; total: number } | null;
  onBack?: () => void;
  children: ReactNode;
}

/**
 * Envoltorio común de cada paso del wizard: título, barra de progreso y
 * botón "Atrás" (punto 5 del pedido). "Continuar" NO vive aquí a
 * propósito — cada paso decide cuándo está listo para avanzar (validación
 * propia), así que el botón de continuar vive dentro de cada paso.
 */
export default function StepShell({ title, subtitle, progress, onBack, children }: StepShellProps) {
  return (
    <div className="mx-auto max-w-lg space-y-5">
      {progress ? (
        <div className="space-y-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted">
            Paso {progress.current} de {progress.total}
          </p>
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver al paso anterior"
            className="mt-1 shrink-0 rounded-full border border-border p-2 text-muted transition hover:border-primary hover:text-primary"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
        <div>
          <h1 className="text-xl font-bold text-text sm:text-2xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
      </div>

      {children}
    </div>
  );
}
