/**
 * Réplica pura en TS del formato que genera set_sale_number() en
 * supabase/migrations/20260826000000_ventas_comprobantes.sql — usada solo
 * para previews/tests. El número REAL de una venta siempre lo asigna la
 * base de datos (atómicamente, ver la migración); esta función nunca se
 * usa para decidir el número de una venta real.
 */
export function formatSaleNumber(year: number, seq: number): string {
  return `SV-${year}-${String(seq).padStart(6, "0")}`;
}

const SALE_NUMBER_PATTERN = /^SV-\d{4}-\d{6}$/;

export function isValidSaleNumberFormat(value: string): boolean {
  return SALE_NUMBER_PATTERN.test(value);
}
