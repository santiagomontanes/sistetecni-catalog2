import { ShieldCheck, Truck, Headphones, BadgeCheck } from "lucide-react";

const trustItems = [
  {
    icon: ShieldCheck,
    title: "Garantía Real",
    description: "8 meses de garantía en todos nuestros equipos certificados.",
    iconColor: "text-primary",
    iconBg: "bg-primary/10",
  },
  {
    icon: Truck,
    title: "Envío Seguro",
    description: "Despacho en 24–48h en Bogotá y envíos nacionales asegurados.",
    iconColor: "text-blue-600",
    iconBg: "bg-blue-50",
  },
  {
    icon: Headphones,
    title: "Soporte Técnico",
    description: "Atención post-venta por WhatsApp. Te respondemos en minutos.",
    iconColor: "text-purple-600",
    iconBg: "bg-purple-50",
  },
  {
    icon: BadgeCheck,
    title: "Precio Justo",
    description: "Sin letra pequeña. El precio que ves es el precio que pagas.",
    iconColor: "text-success",
    iconBg: "bg-green-50",
  },
];

export default function Benefits() {
  return (
    <section>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-text md:text-3xl">
          ¿Por qué comprarnos?
        </h2>
        <p className="mt-2 text-sm text-muted">
          Más de 1000 empresas y profesionales confían en Sistetecni.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {trustItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="group rounded-2xl border border-border bg-white p-6 text-center transition hover:border-primary/30 hover:shadow-lg"
            >
              <div
                className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${item.iconBg}`}
              >
                <Icon className={`h-7 w-7 ${item.iconColor}`} strokeWidth={1.5} />
              </div>
              <h3 className="font-semibold text-text">{item.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                {item.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
