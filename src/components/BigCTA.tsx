import Link from "next/link";
import { MessageCircle } from "lucide-react";
import Barcode from "@/components/home/Barcode";

export default function BigCTA() {
  return (
    <section className="bleed -mb-8 bg-primary py-20 text-white">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="max-w-3xl font-display text-5xl font-extrabold uppercase leading-[0.92] md:text-7xl">
          ¿Listo para elegir tu próximo portátil?
        </h2>
        <p className="mt-5 max-w-xl font-body text-lg text-white/85">
          Más de 1000 equipos vendidos. Garantía real de 8 meses y envíos a toda Colombia.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            href="/catalog"
            className="inline-flex h-14 items-center rounded-xl bg-white px-9 font-display text-xl font-bold uppercase tracking-wide text-primary transition duration-200 hover:bg-tape hover:text-ink motion-reduce:transition-none"
          >
            Ver catálogo
          </Link>
          <Link
            href="/contact"
            className="inline-flex h-14 items-center gap-2 rounded-xl border-2 border-white/70 px-8 font-display text-xl font-bold uppercase tracking-wide text-white transition duration-200 hover:bg-white/10 motion-reduce:transition-none"
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            Contactar
          </Link>
        </div>
        <Barcode seed="sistetecni-listo" className="mt-14 h-12 w-full text-white/25" />
      </div>
    </section>
  );
}
