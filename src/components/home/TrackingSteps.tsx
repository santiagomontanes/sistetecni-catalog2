import { BadgeCheck, Headphones, ShieldCheck, Truck } from "lucide-react";

const steps = [
  { icon: ShieldCheck, title: "Garantía real", text: "8 meses de garantía en todos nuestros equipos certificados." },
  { icon: Truck, title: "Envío seguro", text: "Despacho en 24–48 h en Bogotá y envíos nacionales asegurados." },
  { icon: Headphones, title: "Soporte técnico", text: "Atención post-venta por WhatsApp. Te respondemos en minutos." },
  { icon: BadgeCheck, title: "Precio justo", text: "Sin letra pequeña. El precio que ves es el precio que pagas." },
];

// Seguimiento de envío: cuatro paradas en una línea, no cuatro tarjetas iguales.
export default function TrackingSteps() {
  return (
    <section className="bleed on-paper bg-paper pb-20 pt-24">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="max-w-xl font-display text-4xl font-extrabold uppercase leading-none text-ink md:text-5xl">
          Por qué comprarnos
        </h2>
        <p className="mt-3 max-w-xl font-body text-lg text-ink/70">
          Más de 1000 empresas y profesionales confían en Sistetecni.
        </p>

        <ol className="relative mt-12 grid gap-10 md:grid-cols-4 md:gap-6">
          <span className="absolute left-[19px] top-2 h-[calc(100%-1rem)] w-0.5 bg-primary/25 md:left-0 md:top-[19px] md:h-0.5 md:w-full" aria-hidden="true" />
          {steps.map(({ icon: Icon, title, text }) => (
            <li key={title} className="relative pl-14 md:pl-0 md:pt-14">
              <span className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white ring-4 ring-paper">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="font-display text-2xl font-bold uppercase text-ink">{title}</h3>
              <p className="mt-1.5 max-w-xs font-body text-base leading-relaxed text-ink/75">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
