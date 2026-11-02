import type { Testimonial } from "@/types/testimonial";

interface TestimonialsProps {
  testimonials: Testimonial[];
}

function getInitials(name: string) {
  const parts = name.trim().split(" ").filter(Boolean);
  const first = parts[0]?.[0] ?? "S";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export default function Testimonials({ testimonials }: TestimonialsProps) {
  // Sin testimonios cargados no se muestra nada al público (antes salía un aviso para el administrador).
  if (testimonials.length === 0) return null;

  return (
    <section className="on-white pb-20">
      <h2 className="font-display text-4xl font-extrabold uppercase leading-none text-ink md:text-5xl">Testimonios</h2>
      <p className="mt-3 max-w-xl font-body text-lg text-ink/70">
        Opiniones reales de clientes que han comprado en Sistetecni.
      </p>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {testimonials.map((t) => (
          <article key={t.id} className="rounded-md border-2 border-ink bg-white p-6">
            <p className="font-body text-xl leading-snug text-ink">“{t.text}”</p>
            <div className="mt-5 flex items-center gap-3 border-t border-ink/15 pt-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-display text-lg font-bold text-white">
                {getInitials(t.clientName || "Cliente")}
              </div>
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-bold uppercase text-ink">{t.clientName || "Cliente"}</p>
                <p className="font-data text-[11px] font-medium uppercase tracking-wider text-ink/65">
                  {t.source ? t.source : "Compra verificada"} {t.rating ? `· ${t.rating}/5` : ""}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
