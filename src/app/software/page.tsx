"use client";

import { useState } from "react";
import Image from "next/image";

const screenshots = [
  { src: "/pos.png", title: "Pantalla principal" },
  { src: "/pos1.png", title: "Proceso de venta" },
  { src: "/pos2.png", title: "Control comercial" },
  { src: "/pos3.png", title: "Gestión operativa" },
];

const features = [
  "Ventas rápidas y organizadas",
  "Control de inventario",
  "Apertura y cierre de caja",
  "Interfaz clara y profesional",
  "Impresión de facturas",
  "Pensado para negocios reales",
];

const benefits = [
  {
    title: "Fácil de usar",
    description: "Una interfaz limpia para vender rápido y sin complicaciones.",
  },
  {
    title: "Control real",
    description: "Administra inventario, caja y operación comercial en un solo lugar.",
  },
  {
    title: "Imagen profesional",
    description: "Haz que tu negocio se vea más sólido y organizado frente al cliente.",
  },
];

export default function SoftwarePage() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16">
      <div className="mx-auto max-w-7xl">
        <section className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="inline-block rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1 text-sm text-cyan-300">
              Software · Sistetecni POS
            </span>

            <h1 className="mt-4 text-4xl font-bold leading-tight text-white md:text-5xl">
              Un sistema de punto de venta moderno, práctico y profesional
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-300">
              Sistetecni POS permite vender con rapidez, controlar inventario y
              administrar tu negocio con una experiencia más organizada y profesional.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {features.map((feature) => (
                <span
                  key={feature}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200"
                >
                  {feature}
                </span>
              ))}
            </div>

            <div className="mt-8 rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-slate-900 p-6">
              <p className="text-sm uppercase tracking-wide text-cyan-300">
                Plan comercial
              </p>
              <h2 className="mt-2 text-3xl font-bold text-white">
                $1.000 diarios
              </h2>
              <p className="mt-2 text-lg font-medium text-cyan-300">
                $30.000 mensuales
              </p>
              <p className="mt-3 text-slate-300">
                Menos de lo que vale un tinto al día para darle más orden, control y
                velocidad a tu negocio.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap gap-4">
  <a
    href="https://drive.google.com/file/d/1-Z-y1D9mpW1pl1KxvPfoqATKYPx2XeOy/view?usp=drive_link"
    target="_blank"
    rel="noopener noreferrer"
    className="rounded-xl bg-cyan-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400"
  >
    Descargar software
  </a>

  <a
    href="https://drive.google.com/file/d/1G_QKRIWNGs9ZRU_S5f6WYgCBL85pfkMn/view?usp=drive_link"
    target="_blank"
    rel="noopener noreferrer"
    className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
  >
    Descargar versión sin MySQL y Workbench
  </a>

  <a
    href="https://wa.me/573043547758?text=Hola,%20quiero%20informaci%C3%B3n%20sobre%20Sistetecni%20POS"
    target="_blank"
    rel="noopener noreferrer"
    className="rounded-xl border border-white/15 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
  >
    Solicitar información
  </a>
</div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl">
            <Image
              src="/pos.png"
              alt="Vista principal de Sistetecni POS"
              width={1600}
              height={1000}
              className="h-auto w-full object-cover"
              priority
            />
          </div>
        </section>

        <section className="mt-16 grid gap-6 md:grid-cols-3">
          {benefits.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:-translate-y-1 hover:border-cyan-400/30"
            >
              <h3 className="text-xl font-semibold text-white">{item.title}</h3>
              <p className="mt-3 text-slate-300">{item.description}</p>
            </div>
          ))}
        </section>

        <section className="mt-20">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-white md:text-4xl">
              Vista del sistema
            </h2>
            <p className="mt-3 text-slate-300">
              Haz click en una imagen para verla en detalle.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {screenshots.map((img) => (
              <button
                key={img.src}
                type="button"
                onClick={() => setSelectedImage(img.src)}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-left transition hover:-translate-y-1 hover:border-cyan-400/30"
              >
                <Image
                  src={img.src}
                  alt={img.title}
                  width={1200}
                  height={800}
                  className="h-auto w-full object-cover"
                />
                <div className="p-4">
                  <h3 className="font-semibold text-white">{img.title}</h3>
                  <p className="mt-1 text-sm text-slate-400">Click para ampliar</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-20 rounded-3xl border border-cyan-500/20 bg-gradient-to-r from-slate-900 to-cyan-950/40 p-8 text-center">
          <p className="text-sm uppercase tracking-wide text-cyan-300">
            Haz crecer tu negocio
          </p>
          <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">
            Empieza hoy con Sistetecni POS
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-300">
            Más control, más orden y una mejor experiencia de venta por un valor
            mensual accesible.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <a
              href="https://wa.me/573043547758?text=Hola,%20quiero%20informaci%C3%B3n%20sobre%20Sistetecni%20POS"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-cyan-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Solicitar información
            </a>

            <a
  href="https://drive.google.com/file/d/1G_QKRIWNGs9ZRU_S5f6WYgCBL85pfkMn/view?usp=drive_link"
  target="_blank"
  rel="noopener noreferrer"
  className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
>
  Versión sin MySQL
</a>

            <a
              href="https://drive.google.com/file/d/1-Z-y1D9mpW1pl1KxvPfoqATKYPx2XeOy/view?usp=drive_link"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-white/15 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
            >
              Descargar ahora
            </a>
          </div>
        </section>
      </div>

      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
        >
          <div className="w-full max-w-6xl">
            <Image
              src={selectedImage}
              alt="Vista ampliada"
              width={2000}
              height={1400}
              className="h-auto w-full rounded-xl"
            />
          </div>
        </div>
      )}
    </main>
  );
}