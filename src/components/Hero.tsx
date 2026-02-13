import Image from "next/image";

interface HeroProps {
  companyName: string;
  description: string;
}

export default function Hero({ companyName, description }: HeroProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border">

      {/* Imagen de fondo */}
      <div className="absolute inset-0">
        <Image
          src="/hero.jpg"
          alt="Sistetecni equipos corporativos"
          fill
          priority
          className="object-cover"
        />
        {/* Overlay oscuro */}
        <div className="absolute inset-0 bg-gradient-to-r from-bg/95 via-bg/80 to-bg/60" />
      </div>

      {/* Contenido */}
      <div className="relative px-8 py-20 md:py-28">
        <p className="text-sm uppercase tracking-widest text-muted">
          SISTETECNI
        </p>

        <h1 className="mt-4 max-w-3xl text-3xl font-bold md:text-5xl">
          {companyName}
        </h1>

        <p className="mt-6 max-w-2xl text-muted md:text-lg">
          {description ||
            "Computadores corporativos reacondicionados con garantía real, soporte post-venta y envíos nacionales desde Bogotá."}
        </p>

        <div className="mt-8 flex flex-wrap gap-4">
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
            Contacto
          </a>
        </div>
      </div>
    </section>
  );
}
