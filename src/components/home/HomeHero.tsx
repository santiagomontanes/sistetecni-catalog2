"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { BadgeCheck, MessageCircle, ShieldCheck, Truck } from "lucide-react";
import Barcode from "@/components/home/Barcode";

interface HomeHeroProps {
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

// Medio de fondo configurable desde el admin (misma lógica de siempre).
function HeroMedia({ heroVideoUrl, heroMediaType }: Pick<HomeHeroProps, "heroVideoUrl" | "heroMediaType">) {
  const cls = "absolute inset-0 h-full w-full object-cover";
  if (heroMediaType === "video" && heroVideoUrl) {
    const ytId = getYouTubeId(heroVideoUrl);
    if (ytId) {
      return (
        <iframe
          className={cls}
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
          className={cls}
          src={`https://player.vimeo.com/video/${vimeoId}?autoplay=1&muted=1&loop=1&background=1`}
          allow="autoplay; fullscreen"
          title="Video de fondo"
          style={{ border: "none", pointerEvents: "none" }}
        />
      );
    }
    return <video autoPlay muted loop playsInline className={cls} src={heroVideoUrl} />;
  }
  return <Image src="/hero.jpg" alt="" fill priority sizes="100vw" className="object-cover" />;
}

const WHATSAPP_URL =
  "https://wa.me/573115996339?text=Hola%20%F0%9F%91%8B%20quiero%20m%C3%A1s%20informaci%C3%B3n%20sobre%20sus%20productos%20disponibles.";

const ease = [0.22, 1, 0.36, 1] as const;

export default function HomeHero({ companyName, description, heroVideoUrl, heroMediaType }: HomeHeroProps) {
  const reduce = useReducedMotion();

  return (
    <section className="bleed relative isolate -mt-8 overflow-hidden bg-primary text-white">
      {/* Medio de fondo, teñido de azul de marca para que mande el color */}
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        <div className="absolute inset-0 opacity-30 mix-blend-multiply grayscale">
          <HeroMedia heroVideoUrl={heroVideoUrl} heroMediaType={heroMediaType} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-primary/0 via-primary/40 to-primary" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-24 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:pb-28 lg:pt-20">
        <div>
          <h1 className="font-display text-[clamp(3.25rem,11vw,6rem)] font-extrabold uppercase leading-[0.9] tracking-[-0.01em]">
            Laptops con garantía real,
            <span className="block text-tape">listas para salir.</span>
          </h1>

          <p className="mt-6 max-w-lg font-body text-lg leading-relaxed text-white/85">
            {description ||
              "Laptops corporativas reacondicionadas con garantía real. Envíos nacionales desde Bogotá."}
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/catalog"
              className="inline-flex h-14 items-center justify-center rounded-xl bg-white px-9 font-display text-xl font-bold uppercase tracking-wide text-primary transition duration-200 hover:-translate-y-0.5 hover:bg-tape hover:text-ink active:translate-y-0 motion-reduce:transition-none"
            >
              Ver catálogo
            </Link>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border-2 border-white/70 px-7 font-display text-xl font-bold uppercase tracking-wide text-white transition duration-200 hover:bg-white/10 motion-reduce:transition-none"
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              Escríbenos
            </a>
          </div>

          <ul className="mt-10 flex flex-wrap gap-x-7 gap-y-3 font-body text-sm font-medium text-white/85">
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-tape" aria-hidden="true" />8 meses de garantía</li>
            <li className="flex items-center gap-2"><Truck className="h-4 w-4 text-tape" aria-hidden="true" />Envío nacional</li>
            <li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-tape" aria-hidden="true" />+1000 equipos vendidos</li>
          </ul>
        </div>

        {/* Guía de envío: se imprime de arriba hacia abajo */}
        <div className="relative mx-auto w-full max-w-[420px] lg:mx-0 lg:justify-self-end">
          <div className="relative -rotate-2">
          <motion.div
            initial={reduce ? false : { clipPath: "inset(0 0 100% 0)" }}
            animate={{ clipPath: "inset(-40px -40px -60px -40px)" }}
            transition={{ duration: 0.9, ease, delay: 0.15 }}
            className="relative rounded-md bg-white p-6 text-ink shadow-[0_24px_40px_-18px_rgba(5,12,40,0.55)]"
          >
            <div className="flex items-start justify-between border-b-2 border-ink pb-3">
              <div>
                <p className="font-display text-3xl font-extrabold uppercase leading-none">{companyName}</p>
                <p className="mt-1 font-data text-[11px] font-medium uppercase tracking-wider text-ink/70">Remite · San Diego, Bogotá</p>
              </div>
              <p className="border-2 border-ink px-2 py-1 font-display text-sm font-bold uppercase leading-none">Frágil</p>
            </div>

            <dl className="divide-y divide-ink/15 font-body">
              {[
                ["Destino", "Toda Colombia"],
                ["Garantía", "8 meses"],
                ["Despacho", "24–48 h en Bogotá"],
                ["Contenido", "Laptop corporativa verificada"],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[6.5rem_1fr] items-baseline gap-3 py-2.5">
                  <dt className="font-data text-[11px] font-medium uppercase tracking-wider text-ink/60">{k}</dt>
                  <dd className="text-lg font-semibold leading-tight">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="relative mt-2 overflow-hidden text-ink">
              <Barcode seed={companyName + "8m-bog"} className="h-16 w-full" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-3 animate-scan bg-gradient-to-b from-transparent via-primary/50 to-transparent motion-reduce:hidden" aria-hidden="true" />
            </div>
            <p className="mt-1 text-center font-data text-[11px] font-medium uppercase tracking-[0.3em] text-ink/70">sistetecni · 8m · bog</p>
          </motion.div>

            {/* Sticker de garantía: se despega al tocar o pasar el cursor */}
            <motion.div
              tabIndex={0}
              role="img"
              aria-label="Sello: 8 meses de garantía"
              whileHover={reduce ? undefined : { rotate: 20, x: 10, y: -10, scale: 1.04 }}
              whileFocus={reduce ? undefined : { rotate: 20, x: 10, y: -10, scale: 1.04 }}
              whileTap={reduce ? undefined : { rotate: 26, x: 14, y: -14 }}
              initial={reduce ? false : { scale: 0.4, rotate: -30, opacity: 0 }}
              animate={{ scale: 1, rotate: 9, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18, delay: 1.0 }}
              className="absolute -right-4 -top-6 flex h-28 w-28 cursor-pointer select-none flex-col items-center justify-center rounded-full bg-tape text-center text-ink shadow-[0_10px_18px_-8px_rgba(0,0,0,0.55)]"
            >
              <span className="font-display text-5xl font-extrabold leading-none">8</span>
              <span className="font-display text-base font-bold uppercase leading-tight">meses de<br />garantía</span>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
