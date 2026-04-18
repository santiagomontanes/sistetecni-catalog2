const stats = [
  { value: "+1000", label: "Equipos vendidos" },
  { value: "8 meses", label: "Garantía real" },
  { value: "24–48h", label: "Despacho en Bogotá" },
  { value: "Nacional", label: "Envíos a toda Colombia" },
];

export default function Stats() {
  return (
    <section className="overflow-hidden rounded-2xl bg-text">
      <div className="grid divide-y divide-white/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="px-8 py-8 text-center">
            <div className="text-3xl font-bold text-primary">{s.value}</div>
            <div className="mt-1 text-sm text-white/60">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
