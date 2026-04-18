import Image from "next/image";
import Link from "next/link";

interface HeroProps {
  companyName: string;
  description: string;
  heroVideoUrl?: string;
  heroMediaType?: "image" | "video";
}

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  return match ? match[1] : null;
}

function getVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/);
  return match ? match[1] : null;
}

function HeroMedia({
  heroVideoUrl,
  heroMediaType,
}: {
  heroVideoUrl?: string;
  heroMediaType?: "image" | "video";
}) {
  if (heroMediaType === "video" && heroVideoUrl) {
    const ytId = getYouTubeId(heroVideoUrl);
    if (ytId) {
      return (
        <iframe
          className="absolute inset-0 h-full w-full object-cover opacity-50"
          src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}&controls=0&showinfo=0&rel=0`}
          allow="autoplay; encrypted-media"
          allowFullScreen
          title="Video de fondo"
          style={{ border: "none", pointerEvents: "none" }}
        />
      );
    }

    const vimeoId = getVimeoId(heroVideoUrl);
    if (vimeoId) {
      return (
        <iframe
          className="absolute inset-0 h-full w-full object-cover opacity-50"
          src={`https://player.vimeo.com/video/${vimeoId}?autoplay=1&muted=1&loop=1&background=1`}
          allow="autoplay; fullscreen"
          title="Video de fondo"
          style={{ border: "none", pointerEvents: "none" }}
        />
      );
    }

    return (
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 h-full w-full object-cover opacity-50"
        src={heroVideoUrl}
      />
    );
  }

  return (
    <Image
      src="/hero.jpg"
      alt="Sistetecni equipos corporativos"
      fill
      priority
      className="object-cover opacity-40"
    />
  );
}

export default function Hero({
  companyName,
  description,
  heroVideoUrl,
  heroMediaType,
}: HeroProps) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-text">
      {/* Background media */}
      <div className="absolute inset-0">
        <HeroMedia heroVideoUrl={heroVideoUrl} heroMediaType={heroMediaType} />
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
          <a
            href="https://wa.me/573202210698?text=Hola%20%F0%9F%91%8B%20quiero%20m%C3%A1s%20informaci%C3%B3n%20sobre%20sus%20productos%20disponibles."
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-white/30 bg-white/10 px-7 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
          >
            Contactar
          </a>
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
