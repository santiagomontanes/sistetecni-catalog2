import { MessageCircle, Zap, ShieldCheck } from "lucide-react";

const benefits = [
  {
    title: "Asesoría personalizada",
    description:
      "Te ayudamos a elegir el equipo ideal según tu presupuesto y necesidad.",
    icon: MessageCircle,
  },
  {
    title: "Atención rápida",
    description:
      "Respuestas ágiles por WhatsApp y soporte post-venta garantizado.",
    icon: Zap,
  },
  {
    title: "Equipos confiables",
    description:
      "Portátiles corporativos reacondicionados, probados y listos para durar.",
    icon: ShieldCheck,
  },
];

export default function Benefits() {
  return (
    <section className="mt-14">
      <h2 className="text-2xl font-semibold text-text">
        ¿Por qué elegir Sistetecni?
      </h2>

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        {benefits.map((benefit) => {
          const Icon = benefit.icon;

          return (
            <div
              key={benefit.title}
              className="rounded-2xl border border-border bg-surface p-6 transition hover:scale-[1.02] hover:shadow-lg"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg/40">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="font-semibold">{benefit.title}</h3>
              </div>

              <p className="mt-4 text-sm text-muted">
                {benefit.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
