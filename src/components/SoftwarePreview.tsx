"use client";

import Image from "next/image";
import Link from "next/link";

const features = ["Gestión de ventas", "Control de inventario", "Administración de caja", "Facturación e impresión"];

export default function SoftwarePreview() {
  return (
    <section className="bleed on-paper bg-paper py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-4xl font-extrabold uppercase leading-[0.95] text-ink md:text-5xl">
              Sistetecni también desarrolla software para negocios
            </h2>

            <p className="mt-5 max-w-xl font-body text-lg leading-relaxed text-ink/75">
              Además de equipos corporativos reacondicionados, desarrollamos soluciones tecnológicas para
              operación comercial. Nuestro software destacado es{" "}
              <span className="font-semibold text-ink">Sistetecni POS</span>, diseñado para ventas, control e
              inventario.
            </p>

            <ul className="mt-7 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-3 border-b border-ink/15 pb-3 font-display text-xl font-bold uppercase text-ink">
                  <span className="h-2 w-2 shrink-0 rotate-45 bg-primary" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/software"
                className="inline-flex h-13 items-center rounded-xl bg-primary px-7 py-3.5 font-display text-lg font-bold uppercase tracking-wide text-white transition duration-200 hover:bg-ink motion-reduce:transition-none"
              >
                Ver software
              </Link>
              <a
                href="https://www.mediafire.com/file/0fov546fc7jm6cw/SistetecniPOS-Setup-1.0.3.exe/file"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-xl border-2 border-ink px-7 py-3 font-display text-lg font-bold uppercase tracking-wide text-ink transition duration-200 hover:bg-ink hover:text-white motion-reduce:transition-none"
              >
                Descargar
              </a>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border-2 border-ink bg-white shadow-[0_24px_40px_-24px_rgba(11,16,32,0.5)]">
            <Image
              src="/pos.png"
              alt="Sistetecni POS"
              width={1400}
              height={900}
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="h-auto w-full object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
