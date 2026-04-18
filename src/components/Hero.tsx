import Image from "next/image";
import Link from "next/link";

interface HeroProps {
  companyName: string;
  description: string;
}

export default function Hero({ companyName, description }: HeroProps) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-text">
      {/* Background image */}
      <div className="absolute inset-0">
        <Image
          src="/hero.jpg"
          alt="Sistetecni equipos corporativos"
          fill
          priority
          className="object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-text/95 via-text/80 to-text/30" />
      </div>

      {/* Content */}
      <div className="relative px-8 py-20 md:py-28 lg:py-32">
        <span className="inline-block rounded-full bg-primary/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
          Tecnología Certificada · Bogotá
        </span>

        <h1 className="mt-5 max-w-2xl text-4xl font-bold leading-tight text-white md:text-5xl lg:text-6xl">
          {companyName}
          <span className="block text-primary">Confiable</span>
        </h1>

        <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/70 md:text-base">
          {description ||
            "Laptops corporativas reacondicionadas con garantía real. Envíos nacionales desde Bogotá."}
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/catalog"
            className="rounded-full bg-primary px-7 py-3 text-sm font-semibold text-white transition hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/30"
          >
            Ver catálogo →
          </Link>
          <Link
            href="/contact"
            className="rounded-full border border-white/30 bg-white/10 px-7 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
          >
            Contactar
          </Link>
        </div>

        {/* Mini trust bar */}
        <div className="mt-10 flex flex-wrap gap-6">
          {[
            { icon: "🛡️", text: "8 meses garantía" },
            { icon: "🚚", text: "Envío nacional" },
            { icon: "✅", text: "+1000 equipos vendidos" },
          ].map((item) => (
            <div key={item.text} className="flex items-center gap-2 text-xs text-white/60">
              <span>{item.icon}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
