export default function Gallery() {
  return (
    <section>
      <h2 className="text-2xl font-semibold text-slate-900">Galería</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="flex h-32 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500"
          >
            Imagen {item}
          </div>
        ))}
      </div>
    </section>
  );
}
