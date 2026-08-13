"use client";

import PriceBreakdown from "./PriceBreakdown";
import { buildPriceBreakdown, buildQuoteWhatsAppMessage, buildWhatsAppUrl } from "@/lib/personalizadorUi";
import type { PublicQuoteDTO } from "@/lib/personalizadorServer";

interface QuoteCreatedScreenProps {
  quote: PublicQuoteDTO;
  whatsappPhone: string;
  onRestart: () => void;
}

function formatExpiryDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

/** Punto 12 del pedido: código, resumen, vigencia de 7 días, botón de WhatsApp preparado (D10: sin reemplazar el WhatsAppButton actual). */
export default function QuoteCreatedScreen({ quote, whatsappPhone, onRestart }: QuoteCreatedScreenProps) {
  const breakdown = buildPriceBreakdown({
    basePrice: quote.basePrice,
    selectedUpgrades: quote.selectedUpgrades,
    finalPrice: quote.finalPrice,
  });
  const expiry = formatExpiryDate(quote.expiresAt);
  const whatsappUrl = buildWhatsAppUrl(whatsappPhone, buildQuoteWhatsAppMessage(quote.code, quote.finalPrice));

  return (
    <div className="mx-auto max-w-lg space-y-6 text-center">
      <div>
        <p className="text-4xl" aria-hidden="true">🎉</p>
        <h1 className="mt-2 text-xl font-bold text-text sm:text-2xl">¡Tu cotización está lista!</h1>
      </div>

      <div className="rounded-2xl border border-border bg-white p-6 text-left">
        <p className="text-center text-xs font-medium uppercase tracking-wide text-muted">Código de cotización</p>
        <p className="mt-1 text-center text-2xl font-bold tracking-wide text-primary">{quote.code}</p>

        {quote.product ? (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-sm font-semibold text-text">{quote.product.title}</p>
            <p className="text-xs text-muted">
              {quote.product.brand} · {quote.product.model}
            </p>
          </div>
        ) : (
          <p className="mt-4 border-t border-border pt-4 text-sm text-muted">
            Cotización especial — te contactaremos para buscar la mejor opción.
          </p>
        )}

        {breakdown ? (
          <div className="mt-4 border-t border-border pt-4">
            <PriceBreakdown breakdown={breakdown} />
          </div>
        ) : null}

        {expiry ? <p className="mt-4 border-t border-border pt-4 text-xs text-muted">Válida hasta el {expiry}.</p> : null}
      </div>

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full rounded-full bg-green-500 py-3.5 text-center text-sm font-semibold text-white shadow-lg shadow-green-500/20 transition hover:bg-green-600"
      >
        Continuar por WhatsApp
      </a>

      <button
        type="button"
        onClick={onRestart}
        className="text-sm font-semibold text-primary underline underline-offset-2"
      >
        Personalizar otro equipo
      </button>
    </div>
  );
}
