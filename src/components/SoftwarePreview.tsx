"use client";

import Image from "next/image";
import Link from "next/link";

export default function SoftwarePreview() {
  return (
    <section className="w-full bg-slate-950 py-16 px-6">
      <div className="mx-auto max-w-7xl">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="inline-block rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1 text-sm text-cyan-300">
              Software Empresarial
            </span>

            <h2 className="mt-4 text-3xl font-bold text-white md:text-4xl">
              Sistetecni también desarrolla software para negocios
            </h2>

            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-300 md:text-lg">
              Además de equipos corporativos reacondicionados, desarrollamos soluciones
              tecnológicas para operación comercial. Nuestro software destacado es
              <span className="font-semibold text-white"> Sistetecni POS</span>, diseñado
              para ventas, control e inventario.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-slate-200">
                Gestión de ventas
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-slate-200">
                Control de inventario
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-slate-200">
                Administración de caja
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-slate-200">
                Facturación e impresión
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/software"
                className="rounded-xl bg-cyan-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Ver software
              </Link>

              <a
                href="https://drive.google.com/file/d/1lC1ZzvmndUvm5zUFgZs_Yp_MbvMRwPH8/view?usp=drive_link"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-white/15 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
              >
                Descargar
              </a>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl">
            <Image
              src="/pos.png"
              alt="Sistetecni POS"
              width={1400}
              height={900}
              className="h-auto w-full object-cover"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}