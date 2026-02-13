export default function BigCTA() {
  return (
    <section className="mt-16">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-8 md:p-12">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary opacity-20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-accent opacity-10 blur-3xl" />

        <div className="relative">
          <h2 className="text-2xl font-semibold text-text md:text-3xl">
            ¿Listo para elegir tu próximo portátil?
          </h2>

          <p className="mt-3 max-w-2xl text-sm text-muted md:text-base">
            Más de 1000 equipos vendidos y 8 meses de garantía real.
            Asesoría personalizada y envíos a toda Colombia.
          </p>

          <div className="mt-6 flex flex-wrap gap-4">
            <a
              href="/catalog"
              className="rounded-xl bg-primary px-6 py-3 font-medium text-white transition hover:opacity-90"
            >
              Ver catálogo
            </a>

            <a
              href="/contact"
              className="rounded-xl border border-border px-6 py-3 font-medium text-muted transition hover:bg-bg/40"
            >
              Contactar
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
