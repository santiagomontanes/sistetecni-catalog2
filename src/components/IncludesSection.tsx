import { CheckCircle2, Shield, Truck, Wrench } from "lucide-react";

const items = [
  { icon: Shield, title: "Garantía 8 meses", desc: "Respaldo real en tu compra." },
  { icon: Wrench, title: "Revisión y pruebas", desc: "Equipo verificado y listo para usar." },
  { icon: CheckCircle2, title: "Asesoría", desc: "Te ayudamos antes y después de la compra." },
  { icon: Truck, title: "Envíos nacionales", desc: "Despachamos a toda Colombia." },
];

export default function IncludesSection() {
  return (
    <section className="mt-12">
      <h2 className="text-xl font-semibold text-text">Incluye</h2>
      <p className="mt-2 text-sm text-muted">
        Beneficios y respaldo de Sistetecni.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <div
              key={it.title}
              className="rounded-2xl border border-border bg-surface p-5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg/40">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <div className="font-semibold text-text">{it.title}</div>
              </div>
              <p className="mt-3 text-sm text-muted">{it.desc}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
