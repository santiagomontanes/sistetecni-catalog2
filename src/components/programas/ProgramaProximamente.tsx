import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { programas, whatsappLink, type ProgramaSlug } from "@/lib/programas";
import ProgramaIcono from "@/components/programas/ProgramaIcono";

const copy: Record<Exclude<ProgramaSlug, "lavanderia">, { title: string; line: string; description: string }> = {
  bar: {
    title: "Programa para bar",
    line: "Pedidos, cuentas y caja de tu bar en un solo lugar.",
    description: "Programa para bares: cuentas, inventario de licor y caja. Muy pronto en Sistetecni.",
  },
  restaurante: {
    title: "Programa para restaurante",
    line: "Mesas, comandas y caja del restaurante, sin enredos.",
    description: "Programa para restaurantes: mesas, comandas, cocina y caja. Muy pronto en Sistetecni.",
  },
  negocios: {
    title: "Programa para tu negocio",
    line: "Ventas, inventario y caja para tienda, papelería o cualquier negocio.",
    description: "Programa de ventas e inventario para negocios de barrio. Muy pronto en Sistetecni.",
  },
};

export function proximamenteMetadata(slug: Exclude<ProgramaSlug, "lavanderia">): Metadata {
  const { title, description } = copy[slug];
  const url = `/programas/${slug}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "website", locale: "es_CO" } };
}

// Página base de un programa que aún no está listo: mismo estilo que la portada del sitio.
export default function ProgramaProximamente({ slug }: { slug: Exclude<ProgramaSlug, "lavanderia"> }) {
  const { title, line } = copy[slug];
  const programa = programas.find((p) => p.slug === slug)!;

  return (
    <section className="bleed relative isolate -mt-8 overflow-hidden bg-primary text-white">
      <div className="mx-auto flex min-h-[calc(100svh-12rem)] max-w-6xl flex-col justify-center px-4 py-16 md:py-24">
        <Link
          href="/"
          className="mb-10 inline-flex h-11 w-fit items-center gap-2 font-body text-sm font-semibold text-white/80 transition-colors hover:text-tape"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver al inicio
        </Link>

        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-white text-primary">
            <ProgramaIcono slug={slug} className="h-7 w-7" />
          </span>
          <p className="inline-block -rotate-2 rounded-sm bg-tape px-3 py-1 font-display text-xl font-extrabold uppercase leading-none text-ink">
            Próximamente
          </p>
        </div>

        <h1 className="mt-6 max-w-3xl text-balance font-display text-[clamp(3rem,10vw,5.5rem)] font-extrabold uppercase leading-[0.92] tracking-[-0.01em]">
          {title}
        </h1>
        <p className="mt-5 max-w-xl text-pretty font-body text-lg leading-relaxed text-white/85 md:text-xl">{line}</p>

        <a
          href={whatsappLink(programa.message)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-9 inline-flex h-14 w-fit items-center justify-center gap-2 rounded-xl bg-white px-8 font-display text-xl font-bold uppercase tracking-wide text-primary transition duration-200 hover:bg-tape hover:text-ink active:scale-[0.97] motion-reduce:transition-none"
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          Pregúntanos por WhatsApp
        </a>
      </div>
    </section>
  );
}
