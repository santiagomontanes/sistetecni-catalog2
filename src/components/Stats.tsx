const stats = [
  { value: "+100", label: "Equipos vendidos" },
  { value: "8 meses", label: "Garantía real" },
  { value: "24–48h", label: "Despacho en Bogotá" },
  { value: "Nacional", label: "Envíos a toda Colombia" },
];

export default function Stats() {
  return (
    <section className="mt-14">
      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-xl font-semibold text-text">
          Confianza que se construye con resultados
        </h2>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-border bg-bg/30 p-5 text-center"
            >
              <div className="text-2xl font-bold text-primary">{s.value}</div>
              <div className="mt-1 text-sm text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
