/**
 * Selección de upgrade dentro de una categoría (ram | storage).
 *
 * Regla (D1, confirmada): cada upgrade_option representa la CONFIGURACIÓN
 * FINAL deseada, no una transición origen→destino. "16 GB RAM +70.000"
 * significa que el equipo TERMINA en 16 GB pagando +70.000 — no "se le
 * agregan 16 GB a los que ya tenía".
 *
 * Regla de selección cuando hay varias opciones que satisfacen el mínimo:
 * se elige la de MENOR extra_cost — nunca se asume que mayor capacidad
 * implica mayor precio (ver tests: "upgrade más grande pero más barato").
 * Empate en costo → se prefiere la de menor `value` (menos sobre-
 * aprovisionamiento a igual precio). Empate también en eso → por `id`,
 * para que el resultado sea 100% determinista y reproducible.
 */
import type { CompatibleUpgrade } from "../../types/upgrade";

/**
 * @returns la opción compatible más barata cuyo `value` alcanza `minimumValue`,
 *   o null si ninguna opción activa la alcanza (compatibilidad NO confirmada
 *   para ese mínimo — nunca se asume compatibilidad "porque parece posible").
 */
export function selectCheapestSatisfyingUpgrade(
  compatibleUpgrades: CompatibleUpgrade[],
  minimumValue: number
): CompatibleUpgrade | null {
  const satisfying = compatibleUpgrades.filter(
    (c) => c.option.active && c.option.value >= minimumValue
  );

  if (satisfying.length === 0) return null;

  const sorted = [...satisfying].sort((a, b) => {
    if (a.option.extraCost !== b.option.extraCost) {
      return a.option.extraCost - b.option.extraCost;
    }
    if (a.option.value !== b.option.value) {
      return a.option.value - b.option.value;
    }
    return a.option.id.localeCompare(b.option.id);
  });

  return sorted[0];
}
