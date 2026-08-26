/**
 * Cálculos monetarios del módulo de ventas — SIEMPRE en pesos colombianos
 * enteros (COP no tiene centavos de uso práctico), nunca floats. El
 * servidor SIEMPRE recalcula esto desde los ítems ya validados; nunca
 * confía en un subtotal/total que mande el navegador (punto 22 del
 * pedido).
 */

export class NonIntegerMoneyError extends Error {
  constructor(label: string, value: number) {
    super(`${label} debe ser un entero (COP no usa decimales); recibido: ${value}.`);
    this.name = "NonIntegerMoneyError";
  }
}

function assertInteger(label: string, value: number): void {
  if (!Number.isInteger(value)) {
    throw new NonIntegerMoneyError(label, value);
  }
}

export function computeItemSubtotalCop(unitPriceCop: number, quantity: number): number {
  assertInteger("unitPriceCop", unitPriceCop);
  assertInteger("quantity", quantity);
  return unitPriceCop * quantity;
}

export interface SaleTotals {
  subtotalCop: number;
  discountCop: number;
  totalCop: number;
}

/** discountCop se recorta a [0, subtotal] — un descuento mayor al subtotal nunca produce un total negativo. */
export function computeSaleTotalsCop(
  items: Array<{ unitPriceCop: number; quantity: number }>,
  discountCop: number
): SaleTotals {
  assertInteger("discountCop", discountCop);

  const subtotalCop = items.reduce(
    (sum, item) => sum + computeItemSubtotalCop(item.unitPriceCop, item.quantity),
    0
  );
  const clampedDiscount = Math.max(0, Math.min(discountCop, subtotalCop));

  return {
    subtotalCop,
    discountCop: clampedDiscount,
    totalCop: subtotalCop - clampedDiscount,
  };
}
