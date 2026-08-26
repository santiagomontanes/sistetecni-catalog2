/**
 * Enmascarado de datos sensibles para el Historial (punto 14/23 del
 * pedido) — el celular completo no debe aparecer en un listado que se ve
 * de un vistazo. El detalle de la venta sí muestra el dato completo (ya
 * está detrás de requireAdmin()).
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "*".repeat(digits.length);
  const visibleStart = digits.slice(0, 3);
  const visibleEnd = digits.slice(-2);
  const maskedMiddle = "*".repeat(digits.length - visibleStart.length - visibleEnd.length);
  return `${visibleStart}${maskedMiddle}${visibleEnd}`;
}
