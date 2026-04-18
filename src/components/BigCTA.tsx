import Link from "next/link";

export default function BigCTA() {
  return (
    <section>
      <div className="relative overflow-hidden rounded-3xl bg-text px-8 py-14 text-center md:px-16">
        {/* Decorative blobs */}
        <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-primary opacity-20 blur-3xl" />
        <div className="absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-primary opacity-10 blur-3xl" />

        <div className="relative">
          <span className="inline-block rounded-full bg-primary/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
            Disponibles ahora
          </span>

          <h2 className="mt-4 text-2xl font-bold text-white md:text-4xl">
            ¿Listo para elegir tu próximo portátil?
          </h2>

          <p className="mx-auto mt-3 max-w-xl text-sm text-white/60 md:text-base">
            Más de 1000 equipos vendidos. Garantía real de 8 meses y envíos a toda Colombia.
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-4">
            <Link
              href="/catalog"
              className="rounded-full bg-primary px-8 py-3 text-sm font-semibold text-white transition hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30"
            >
              Ver catálogo
            </Link>
            <Link
              href="/contact"
              className="rounded-full border border-white/20 bg-white/10 px-8 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Contactar
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
