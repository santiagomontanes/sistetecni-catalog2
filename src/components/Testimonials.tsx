import type { Testimonial } from '@/types/testimonial';

const testimonials: Testimonial[] = [
  { id: '1', author: 'María P.', content: 'Excelente atención y productos de calidad.' },
  { id: '2', author: 'Carlos R.', content: 'La implementación fue rápida y sin complicaciones.' },
];

export default function Testimonials() {
  return (
    <section>
      <h2 className="text-2xl font-semibold text-slate-900">Testimonios</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {testimonials.map((testimonial) => (
          <article key={testimonial.id} className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-600">“{testimonial.content}”</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{testimonial.author}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
