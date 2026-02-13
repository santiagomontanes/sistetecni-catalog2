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
  return (
    <section className="mt-14">
      <h2 className="text-2xl font-semibold text-text">Testimonios</h2>
      <p className="mt-2 text-sm text-muted">
        Opiniones reales de clientes que han comprado en Sistetecni.
      </p>

      {testimonials.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
          <p className="text-sm text-muted">
            Aún no hay testimonios públicos disponibles.
          </p>
          <p className="mt-2 text-xs text-muted">
            (Cuando agregues testimonios desde el admin o la base de datos, se verán aquí.)
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {testimonials.map((t) => (
            <article
              key={t.id}
              className="rounded-2xl border border-border bg-surface p-6 transition hover:shadow-lg"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg/40 text-sm font-semibold text-text">
                  {getInitials(t.clientName || "Cliente")}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">
                    {t.clientName || "Cliente"}
                  </p>
                  <p className="text-xs text-muted">
                    {t.source ? t.source : "Compra verificada"}{" "}
                    {t.rating ? `· ${t.rating}/5` : ""}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm text-muted">“{t.text}”</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
