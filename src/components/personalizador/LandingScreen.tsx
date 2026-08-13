"use client";

import type { WizardMode } from "@/lib/personalizadorUi";

export default function LandingScreen({ onSelectMode }: { onSelectMode: (mode: WizardMode) => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-6 text-center">
      <div>
        <h1 className="text-2xl font-bold text-text sm:text-3xl">Encuentra el portátil ideal para ti</h1>
        <p className="mt-2 text-sm text-muted">Elige cómo prefieres empezar.</p>
      </div>

      <div className="space-y-4 text-left">
        <button
          type="button"
          onClick={() => onSelectMode("ayudame")}
          className="group block w-full rounded-2xl border border-border bg-white p-5 text-left transition hover:border-primary hover:shadow-lg hover:shadow-primary/10"
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden="true">🙋</span>
            <div>
              <h2 className="text-lg font-semibold text-text group-hover:text-primary">Ayúdame a elegir</h2>
              <p className="mt-1 text-sm text-muted">
                Cuéntanos para qué lo necesitas y encontraremos opciones para ti.
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelectMode("personalizar")}
          className="group block w-full rounded-2xl border border-border bg-white p-5 text-left transition hover:border-primary hover:shadow-lg hover:shadow-primary/10"
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden="true">⚙️</span>
            <div>
              <h2 className="text-lg font-semibold text-text group-hover:text-primary">Personalizar características</h2>
              <p className="mt-1 text-sm text-muted">Elige las especificaciones que buscas.</p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
