"use client";

import StepShell from "./StepShell";
// Import puntual a schemas.ts (no al barrel @/lib/personalizador) — el
// barrel también reexporta code.ts, que importa node:crypto a nivel de
// módulo; eso rompe el bundle de cliente si se arrastra desde aquí.
import { HONEYPOT_FIELD_NAME } from "@/lib/personalizador/schemas";
import type { AsyncStatus } from "@/lib/personalizadorUi";

interface QuoteFormScreenProps {
  progress: { current: number; total: number } | null;
  onBack: () => void;
  isSpecialQuote: boolean;
  city: string;
  onCityChange: (city: string) => void;
  honeypot: string;
  onHoneypotChange: (value: string) => void;
  status: AsyncStatus;
  errorMessage: string | null;
  onSubmit: () => void;
}

/** Punto 11 del pedido: ciudad opcional, honeypot invisible, nunca nombre/teléfono/correo. */
export default function QuoteFormScreen({
  progress,
  onBack,
  isSpecialQuote,
  city,
  onCityChange,
  honeypot,
  onHoneypotChange,
  status,
  errorMessage,
  onSubmit,
}: QuoteFormScreenProps) {
  return (
    <StepShell
      title={isSpecialQuote ? "Solicitar cotización especial" : "Solicitar cotización"}
      subtitle="Un dato opcional para ayudarte mejor — nada más."
      progress={progress}
      onBack={onBack}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="quote-city" className="mb-1.5 block text-sm font-medium text-text">
            Ciudad (opcional)
          </label>
          <input
            id="quote-city"
            type="text"
            autoComplete="address-level2"
            maxLength={80}
            placeholder="Ej. Bogotá"
            value={city}
            onChange={(e) => onCityChange(e.target.value)}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Honeypot — invisible para una persona, visible para un bot que rellena todo. */}
        <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-0 w-0 overflow-hidden">
          <label htmlFor={HONEYPOT_FIELD_NAME}>Sitio web de tu empresa</label>
          <input
            id={HONEYPOT_FIELD_NAME}
            name={HONEYPOT_FIELD_NAME}
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => onHoneypotChange(e.target.value)}
          />
        </div>

        {status === "error" ? (
          <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {errorMessage ?? "No se pudo crear la cotización. Intenta de nuevo."}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full rounded-full bg-primary py-3.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? "Enviando…" : "Solicitar cotización"}
        </button>
      </form>
    </StepShell>
  );
}
