import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Banknote,
  BadgeCheck,
  Barcode as BarcodeIcon,
  ChevronDown,
  ClipboardList,
  CloudUpload,
  HandCoins,
  MessageCircle,
  PackageCheck,
  Receipt,
  Ruler,
  Scale,
  Users,
  WifiOff,
} from "lucide-react";
import TiqueteLavanderia from "@/components/programas/TiqueteLavanderia";
import VideoPrograma from "@/components/programas/VideoPrograma";
import { programas, whatsappLink } from "@/lib/programas";

const TITLE = "Programa para lavanderías, lavasecos y sastrerías";
const DESCRIPTION =
  "Controla las prendas de cada cliente, lo que te deben y la caja del día. Funciona sin internet. Agenda tu demo gratis por WhatsApp.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/programas/lavanderia" },
  openGraph: {
    title: "Tu lavandería organizada: sin cuaderno y sin internet",
    description: DESCRIPTION,
    url: "/programas/lavanderia",
    type: "website",
    locale: "es_CO",
    siteName: "Sistetecni",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tu lavandería organizada: sin cuaderno y sin internet",
    description: DESCRIPTION,
  },
};

const DEMO_URL = whatsappLink(programas.find((p) => p.slug === "lavanderia")!.message);

// VIDEO_LAVANDERIA_AQUI
// Cuando tengas el video, pega el enlace del reel o video en UNO de los dos campos (el otro puede quedar vacío).
//   instagram: "https://www.instagram.com/reel/XXXXXXXXXXX/"
//   facebook:  "https://www.facebook.com/reel/XXXXXXXXXXXXXXX"
// Se incrusta con el mismo embed oficial de la sección «Lo último en nuestras redes» de la portada.
const VIDEO_LAVANDERIA = {
  instagram: "https://www.instagram.com/reel/DfQbN1WxJhN/",
  facebook: "",
};

// TESTIMONIO_AQUI
// Reemplaza cada tarjeta con un testimonio REAL (nombre y negocio autorizados por la persona).
// Mientras `real` no exista, la tarjeta se muestra como espacio reservado. No inventes testimonios.
const TESTIMONIOS: { real?: { quote: string; name: string; business: string } }[] = [{}, {}, {}];

const problems = [
  { title: "Prendas perdidas y tiquetes escritos a mano", text: "Una letra borrosa y ya no sabes de quién es esa camisa." },
  { title: "No saber quién debe ni cuánto", text: "Las deudas viven en el cuaderno, y el cuaderno no avisa." },
  { title: "La caja no cuadra al final del día", text: "Sobra, falta, y nadie sabe en qué momento pasó." },
  { title: "Clientes que llaman a preguntar «¿ya está mi ropa?»", text: "Cada llamada te saca de lo que estás haciendo." },
];

const features = [
  { icon: BarcodeIcon, title: "Órdenes con código de barras y tiquete impreso", text: "No se pierden prendas." },
  { icon: HandCoins, title: "Abonos, saldos pendientes y entregas parciales", text: "Sabes quién te debe." },
  { icon: Banknote, title: "Caja, arqueo y gastos del día", text: "Cuadras la caja en minutos." },
  { icon: PackageCheck, title: "Lista de «listos para entregar»", text: "Entregas más rápido." },
  { icon: MessageCircle, title: "Mensajes de WhatsApp con plantillas", text: "Avisas «tu ropa está lista» con un clic." },
  { icon: Scale, title: "Garantías y reclamos", text: "Controlas los reprocesos." },
  { icon: Ruler, title: "Medidas de clientes para sastrería", text: "No vuelves a medir." },
  { icon: Receipt, title: "Reportes de ventas, gastos y utilidad", text: "Sabes si el negocio está ganando." },
  { icon: Users, title: "Usuarios con roles y registro de quién hizo qué", text: "Controlas a tus empleados aunque no estés." },
  { icon: CloudUpload, title: "Copias de seguridad en Google Drive", text: "No pierdes nada si se daña el computador." },
];

const steps = [
  { title: "Agendas una demo de 15 minutos", text: "En tu local o por videollamada." },
  { title: "Te lo instalo y te enseño a usarlo", text: "A ti y a tus empleados." },
  { title: "Lo pruebas 15 días gratis", text: "Con tus datos reales." },
];

const faqs = [
  { q: "¿Necesito internet?", a: "No. El programa funciona sin internet." },
  { q: "¿Necesito un computador especial?", a: "No. Funciona en cualquier computador con Windows." },
  { q: "¿Y si no sé de computadores?", a: "Yo te lo instalo y te enseño. Si sabes usar WhatsApp, sabes usar esto." },
  { q: "¿Se pierde la información si se daña el computador?", a: "No. Se hace copia de seguridad en Google Drive." },
  { q: "¿Sirve para sastrería?", a: "Sí. Guarda las medidas de cada cliente." },
];

const ctaPrimary =
  "inline-flex h-14 items-center justify-center gap-2 rounded-xl px-8 font-display text-xl font-bold uppercase tracking-wide transition duration-200 active:scale-[0.97] motion-reduce:transition-none";

export default function LavanderiaPage() {
  const videoNet = VIDEO_LAVANDERIA.instagram ? "instagram" : "facebook";
  const videoPost = VIDEO_LAVANDERIA.instagram || VIDEO_LAVANDERIA.facebook;

  return (
    <div>
      {/* 1. Portada */}
      <section className="bleed relative isolate -mt-8 overflow-hidden bg-primary text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:pb-28 lg:pt-16">
          <div>
            <Link
              href="/"
              className="mb-8 inline-flex h-11 items-center gap-2 font-body text-sm font-semibold text-white/80 transition-colors hover:text-tape"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver al inicio
            </Link>

            <h1 className="text-balance font-display text-[clamp(3rem,10.5vw,5.75rem)] font-extrabold uppercase leading-[0.92] tracking-[-0.01em]">
              Tu lavandería organizada:
              <span className="block text-tape">sin cuaderno y sin internet</span>
            </h1>
            <p className="mt-6 max-w-lg text-pretty font-body text-lg leading-relaxed text-white/85 md:text-xl">
              Sabe qué prenda tiene cada cliente, cuánto te debe y cuánto entró hoy a la caja.
            </p>

            <div className="mt-9">
              <a
                href={DEMO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`${ctaPrimary} bg-white text-primary hover:bg-tape hover:text-ink`}
              >
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
                Agenda tu demo gratis
              </a>
              <p className="mt-5 flex items-center gap-2 font-body text-sm font-medium text-white/85">
                <BadgeCheck className="h-4 w-4 text-tape" aria-hidden="true" />
                Ya lo usan lavanderías en Colombia
              </p>
            </div>
          </div>

          <TiqueteLavanderia />
        </div>
      </section>

      {/* 2. Video */}
      <section className="bleed bg-ink py-20 text-white" aria-labelledby="video-titulo">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 md:grid-cols-[1fr_auto] md:gap-20">
          <div className="max-w-xl">
            <h2 id="video-titulo" className="text-balance font-display text-4xl font-extrabold uppercase leading-none md:text-5xl">
              Míralo funcionando
            </h2>
            <p className="mt-3 font-body text-lg text-white/75">
              Mira cómo se ve el programa. Si te gusta, agenda tu demo y lo probamos con tus propias prendas.
            </p>
            <a
              href={DEMO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`${ctaPrimary} mt-8 bg-tape text-ink hover:bg-white`}
            >
              Agenda tu demo gratis
            </a>
          </div>

          {/* VIDEO_LAVANDERIA_AQUI — el enlace se configura arriba, en VIDEO_LAVANDERIA */}
          <VideoPrograma net={videoNet} post={videoPost} title="Programa para lavanderías" />
        </div>
      </section>

      {/* 3. El problema */}
      <section className="bleed on-paper bg-paper py-20" aria-labelledby="problema-titulo">
        <div className="mx-auto max-w-6xl px-4">
          <h2 id="problema-titulo" className="max-w-2xl text-balance font-display text-4xl font-extrabold uppercase leading-none text-ink md:text-5xl">
            Si llevas todo en cuaderno, esto te suena
          </h2>
          <ul className="mt-12 grid gap-x-12 gap-y-2 md:grid-cols-2">
            {problems.map((p) => (
              <li key={p.title} className="border-t-2 border-ink py-6">
                <h3 className="text-balance font-display text-2xl font-bold uppercase leading-tight text-ink md:text-3xl">{p.title}</h3>
                <p className="mt-2 max-w-md font-body text-base leading-relaxed text-ink/70">{p.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 4. Qué hace el programa */}
      <section className="bleed on-white bg-white py-20" aria-labelledby="funciones-titulo">
        <div className="mx-auto max-w-6xl px-4">
          <h2 id="funciones-titulo" className="max-w-2xl text-balance font-display text-4xl font-extrabold uppercase leading-none text-ink md:text-5xl">
            Todo lo que tu lavandería necesita
          </h2>
          <ul className="mt-12 grid gap-x-14 md:grid-cols-2">
            {features.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4 border-t border-ink/15 py-5">
                <Icon className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h3 className="text-pretty font-body text-lg font-bold leading-snug text-ink">{title}</h3>
                  <p className="mt-0.5 font-body text-base text-ink/70">{text}</p>
                </div>
              </li>
            ))}
            <li className="flex gap-4 rounded-xl bg-primary p-6 text-white md:col-span-2 md:mt-5">
              <WifiOff className="mt-1 h-7 w-7 shrink-0 text-tape" aria-hidden="true" />
              <div>
                <h3 className="font-display text-2xl font-bold uppercase leading-tight md:text-3xl">Funciona sin internet y se actualiza solo</h3>
                <p className="mt-1 font-body text-base text-white/85">Si se cae el internet, tú sigues atendiendo.</p>
              </div>
            </li>
          </ul>
        </div>
      </section>

      {/* 5. Cómo funciona */}
      <section className="bleed bg-ink py-20 text-white" aria-labelledby="pasos-titulo">
        <div className="mx-auto max-w-6xl px-4">
          <h2 id="pasos-titulo" className="max-w-2xl text-balance font-display text-4xl font-extrabold uppercase leading-none md:text-5xl">
            Empezar es así de fácil
          </h2>
          <ol className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-6">
            <span className="absolute left-[19px] top-2 h-[calc(100%-1rem)] w-0.5 bg-white/20 md:left-0 md:top-[19px] md:h-0.5 md:w-full" aria-hidden="true" />
            {steps.map((s, i) => (
              <li key={s.title} className="relative pl-14 md:pl-0 md:pt-14">
                <span className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-tape font-data text-lg font-bold text-ink ring-4 ring-ink">
                  {i + 1}
                </span>
                <h3 className="font-display text-2xl font-bold uppercase leading-tight">{s.title}</h3>
                <p className="mt-1.5 max-w-xs font-body text-base leading-relaxed text-white/75">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 6. Precios */}
      <section className="bleed on-paper bg-paper py-20" aria-labelledby="precios-titulo">
        <div className="mx-auto max-w-6xl px-4">
          <h2 id="precios-titulo" className="max-w-2xl text-balance font-display text-4xl font-extrabold uppercase leading-none text-ink md:text-5xl">
            Precios claros, sin letra pequeña
          </h2>

          <div className="mt-12 grid gap-8 md:grid-cols-2 md:items-stretch">
            <article className="flex flex-col rounded-2xl border-2 border-ink/15 bg-white p-7">
              <h3 className="font-display text-3xl font-extrabold uppercase leading-none text-ink">Mensual</h3>
              <p className="mt-5 flex items-baseline gap-2 text-ink">
                <span className="tnum font-display text-6xl font-extrabold leading-none">$89.000</span>
                <span className="font-body text-lg font-medium text-ink/70">al mes</span>
              </p>
              <p className="mt-1 font-body text-base text-ink/70">el primer año</p>
              <ul className="mb-8 mt-6 space-y-2 font-body text-base text-ink">
                <li className="flex gap-2"><BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />Instalación y capacitación incluidas</li>
                <li className="flex gap-2"><BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />Desde el segundo año: <span className="tnum font-bold">$60.000</span> al mes</li>
              </ul>
              <a
                href={DEMO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`${ctaPrimary} mt-auto w-full border-2 border-ink text-ink hover:bg-ink hover:text-white `}
              >
                Agenda tu demo gratis
              </a>
            </article>

            <article className="relative flex flex-col rounded-2xl bg-primary p-7 text-white shadow-[0_24px_40px_-22px_rgba(26,86,219,0.7)]">
              <p className="absolute -top-4 right-6 rotate-3 rounded-sm bg-tape px-3 py-1.5 font-display text-lg font-extrabold uppercase leading-none text-ink">
                Recomendado
              </p>
              <h3 className="font-display text-3xl font-extrabold uppercase leading-none">Anual</h3>
              <p className="mt-5 flex items-baseline gap-2">
                <span className="tnum font-display text-6xl font-extrabold leading-none">$890.000</span>
                <span className="font-body text-lg font-medium text-white/80">el primer año</span>
              </p>
              <p className="mt-1 font-body text-base font-semibold text-tape">2 meses gratis</p>
              <ul className="mb-8 mt-6 space-y-2 font-body text-base">
                <li className="flex gap-2"><BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-tape" aria-hidden="true" />Instalación incluida</li>
                <li className="flex gap-2"><BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-tape" aria-hidden="true" />Desde el segundo año: <span className="tnum font-bold">$600.000</span> al año</li>
              </ul>
              <a
                href={DEMO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`${ctaPrimary} mt-auto w-full bg-white text-primary hover:bg-tape hover:text-ink `}
              >
                Agenda tu demo gratis
              </a>
            </article>
          </div>

          <p className="mt-8 text-center font-body text-base font-medium text-ink/75">15 días de prueba gratis. Precios en pesos colombianos.</p>
        </div>
      </section>

      {/* 7. Testimonios */}
      <section className="bleed on-white bg-white py-20" aria-labelledby="testimonios-titulo">
        <div className="mx-auto max-w-6xl px-4">
          <h2 id="testimonios-titulo" className="max-w-2xl text-balance font-display text-4xl font-extrabold uppercase leading-none text-ink md:text-5xl">
            Lo que dicen los dueños
          </h2>
          <ul className="mt-12 grid gap-6 md:grid-cols-3">
            {TESTIMONIOS.map((t, i) =>
              t.real ? (
                <li key={i} className="flex flex-col rounded-2xl bg-paper p-6">
                  <blockquote className="font-body text-lg leading-relaxed text-ink">“{t.real.quote}”</blockquote>
                  <p className="mt-5 font-body text-base font-bold text-ink">{t.real.name}</p>
                  <p className="font-body text-sm text-ink/70">{t.real.business}</p>
                </li>
              ) : (
                // TESTIMONIO_AQUI
                <li key={i} className="flex min-h-48 flex-col justify-between rounded-2xl border-2 border-dashed border-ink/25 bg-paper p-6">
                  <p className="font-body text-lg leading-relaxed text-ink/60">Aquí va el testimonio de un dueño de lavandería.</p>
                  <p className="mt-5 font-body text-sm text-ink/60">Nombre y negocio</p>
                </li>
              ),
            )}
          </ul>
        </div>
      </section>

      {/* 8. Preguntas frecuentes */}
      <section className="bleed on-paper bg-paper py-20" aria-labelledby="faq-titulo">
        <div className="mx-auto max-w-3xl px-4">
          <h2 id="faq-titulo" className="text-balance font-display text-4xl font-extrabold uppercase leading-none text-ink md:text-5xl">
            Preguntas frecuentes
          </h2>
          <div className="mt-10 divide-y divide-ink/15 border-y border-ink/15">
            {faqs.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 font-body text-lg font-bold text-ink transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown className="h-5 w-5 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                </summary>
                <p className="animate-fade-up pb-5 font-body text-lg leading-relaxed text-ink/80 motion-reduce:animate-none">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 9. Cierre */}
      <section className="bleed bg-primary py-24 text-center text-white" aria-labelledby="cierre-titulo">
        <div className="mx-auto max-w-3xl px-4">
          <ClipboardList className="mx-auto h-9 w-9 text-tape" aria-hidden="true" />
          <h2 id="cierre-titulo" className="mt-5 text-balance font-display text-[clamp(2.5rem,8vw,4.5rem)] font-extrabold uppercase leading-[0.95]">
            Deja el cuaderno. Organiza tu lavandería hoy.
          </h2>
          <a
            href={DEMO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${ctaPrimary} mt-10 h-16 bg-white px-10 text-2xl text-primary hover:bg-tape hover:text-ink`}
          >
            <MessageCircle className="h-6 w-6" aria-hidden="true" />
            Agenda tu demo gratis
          </a>
        </div>
      </section>
    </div>
  );
}
