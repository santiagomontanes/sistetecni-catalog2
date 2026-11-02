// Programas para tu negocio: rutas, textos del menú y enlaces de WhatsApp.
// Un solo lugar para el número y los mensajes (menú, páginas y botón flotante).

export const PROGRAMAS_WHATSAPP = "573115996339";

export type ProgramaSlug = "bar" | "restaurante" | "lavanderia" | "negocios";

export interface Programa {
  slug: ProgramaSlug;
  href: string;
  label: string;
  /** Mensaje de WhatsApp de la página (en las 3 básicas pregunta por información). */
  message: string;
}

export const programas: Programa[] = [
  { slug: "bar", href: "/programas/bar", label: "Bar", message: "Hola, quiero información del programa para bar" },
  { slug: "restaurante", href: "/programas/restaurante", label: "Restaurante", message: "Hola, quiero información del programa para restaurante" },
  { slug: "lavanderia", href: "/programas/lavanderia", label: "Lavandería", message: "Hola, vi la página y quiero ver la demo del programa para lavanderías" },
  { slug: "negocios", href: "/programas/negocios", label: "Negocios", message: "Hola, quiero información del programa para mi negocio" },
];

export const whatsappLink = (message: string) =>
  `https://wa.me/${PROGRAMAS_WHATSAPP}?text=${encodeURIComponent(message)}`;

/** Mensaje de la página de programas que corresponde a una ruta, o null si no es de programas. */
export function programaMessageFor(pathname: string): string | null {
  return programas.find((p) => pathname === p.href || pathname.startsWith(`${p.href}/`))?.message ?? null;
}
