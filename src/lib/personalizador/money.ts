/**
 * Estrategia monetaria del motor.
 *
 * SISTETECNI opera en pesos colombianos (COP), que no tiene subunidad
 * fraccionaria de uso real (no existen "centavos" en el flujo de este
 * negocio — Product.price y UpgradeOption.extra_cost ya llegan como
 * enteros desde la base, confirmado en supabase/migrations/). Por eso:
 *
 *   - Todo valor monetario se trata como un entero de JavaScript
 *     (Number.isInteger). Nunca como float con fracción.
 *   - La suma de enteros en JS es EXACTA hasta Number.MAX_SAFE_INTEGER
 *     (2^53-1) — muchísimo más de lo que cualquier precio real alcanzará
 *     — así que sumar basePrice + extraCost + extraCost nunca introduce
 *     error de redondeo, sin necesitar BigInt ni una librería de dinero.
 *   - La única operación que SÍ podría introducir error flotante es el
 *     cálculo de tolerancia de presupuesto (+15%, D8), porque multiplicar
 *     por 1.15 es multiplicar por una fracción decimal no exacta en
 *     binario. Se evita por completo: en vez de `budgetMax * 1.15`, se
 *     calcula `Math.floor((budgetMax * 115) / 100)` — multiplicación y
 *     división de enteros, con un único floor final. Ver
 *     calculateBudgetToleranceLimit() abajo.
 */

/** Lanza si el valor no es un entero — nunca se acepta un precio fraccionario. */
export function assertIntegerMoney(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`[money] "${label}" debe ser un entero (COP no tiene subunidad). Recibido: ${value}`);
  }
}

/** Suma de valores monetarios enteros — exacta, sin punto flotante fraccionario. */
export function sumMoney(values: number[]): number {
  for (const v of values) assertIntegerMoney(v, "sumMoney(valor)");
  return values.reduce((acc, v) => acc + v, 0);
}

const TOLERANCE_PERCENT = 15;

/**
 * Límite superior de la tolerancia de presupuesto (+15%, D8), calculado
 * con aritmética entera para evitar cualquier imprecisión de coma
 * flotante en la frontera exacta (ver tests: "exactamente +15%").
 */
export function calculateBudgetToleranceLimit(budgetMax: number): number {
  assertIntegerMoney(budgetMax, "budgetMax");
  return Math.floor((budgetMax * (100 + TOLERANCE_PERCENT)) / 100);
}
