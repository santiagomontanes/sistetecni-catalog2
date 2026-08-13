/**
 * Punto 12 del pedido: botón "Continuar por WhatsApp" preparado, sin
 * integrar WhatsApp Cloud API todavía — mismo mecanismo wa.me que ya usa
 * WhatsAppButton.tsx (no se toca ese componente: el mensaje de una
 * cotización tiene una forma distinta a los dos modos que ya soporta).
 * El número de teléfono NUNCA se hardcodea aquí — se recibe como parámetro,
 * ya resuelto por el llamador vía getBusinessProfile() (fuente central
 * existente, ver src/supabase/db.ts).
 */
import { formatCOP } from "./format";

export function buildQuoteWhatsAppMessage(code: string, finalPrice: number | null): string {
  const priceLine = finalPrice !== null ? `\nPrecio estimado: ${formatCOP(finalPrice)}` : "";
  return `Hola, quiero continuar con mi cotización de portátil personalizado.\nCódigo: ${code}${priceLine}`;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
