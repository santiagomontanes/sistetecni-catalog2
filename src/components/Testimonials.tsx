import type { Testimonial } from '@/types/testimonial';

interface TestimonialsProps {
  testimonials: Testimonial[];
}

export default function Testimonials({ testimonials }: TestimonialsProps) {
  return (
    <section>
      <h2 className="text-2xl font-semibold text-slate-900">Testimonios</h2>
      {testimonials.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          No hay testimonios todavía.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {testimonials.map((testimonial) => (
            <article key={testimonial.id} className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm text-slate-600">“{testimonial.text}”</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{testimonial.clientName}</p>
              <p className="text-xs text-slate-500">{testimonial.source} · {testimonial.rating}/5</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
