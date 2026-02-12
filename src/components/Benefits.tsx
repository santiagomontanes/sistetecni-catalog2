const benefits = ['Asesoría personalizada', 'Atención rápida', 'Equipos confiables'];

export default function Benefits() {
  return (
    <section>
      <h2 className="text-2xl font-semibold text-slate-900">Beneficios</h2>
      <ul className="mt-4 grid gap-3 md:grid-cols-3">
        {benefits.map((benefit) => (
          <li key={benefit} className="rounded-xl border border-slate-200 p-4 text-sm">
            {benefit}
          </li>
        ))}
      </ul>
    </section>
  );
}
