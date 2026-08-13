/**
 * Formato de moneda para la UI del personalizador (Fase 2B/B5) — punto 16
 * del pedido: centralizado, sin ningún cálculo monetario aquí (los precios
 * ya vienen calculados por B3/B4; esto solo los presenta).
 *
 * No reemplaza el formatCOP() ya duplicado en ProductCard.tsx/
 * WhatsAppButton.tsx (fuera de alcance de B5 — tocarlos sería
 * refactorización global no pedida). Los componentes nuevos de B5 importan
 * este único formatCOP().
 */
export function formatCOP(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}
