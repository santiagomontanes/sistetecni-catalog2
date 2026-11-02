const items = [
  "Garantía real de 8 meses",
  "Envío nacional",
  "Soporte por WhatsApp",
  "San Diego, Bogotá",
  "Precio justo, sin letra pequeña",
];

// Cinta de embalaje: solo movimiento CSS (sin JS); se detiene con "reducir movimiento".
export default function TapeMarquee() {
  const row = (
    <div className="flex shrink-0 items-center" aria-hidden="true">
      {items.map((t) => (
        <span key={t} className="flex items-center whitespace-nowrap font-display text-2xl font-extrabold uppercase tracking-wide">
          {t}
          <span className="mx-8 inline-block h-2 w-2 rotate-45 bg-ink" />
        </span>
      ))}
    </div>
  );
  return (
    <div className="bleed relative z-10 -mt-7 -rotate-1 overflow-hidden bg-tape py-3 text-ink shadow-[0_8px_16px_-10px_rgba(0,0,0,0.5)]">
      <p className="sr-only">{items.join(". ")}.</p>
      <div className="flex w-max animate-marquee motion-reduce:animate-none">
        {row}
        {row}
      </div>
    </div>
  );
}
