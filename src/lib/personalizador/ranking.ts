/**
 * Ranking determinista — sin IA, sin heurísticas difusas.
 *
 * Tiers dentro de `available` (todas ya AVAILABLE — stockStatus se separa
 * antes, en matchProducts()):
 *
 *   1. DIRECT_MATCH,                dentro de presupuesto
 *   2. 1 upgrade (RAM o storage),   dentro de presupuesto
 *   3. 2 upgrades (RAM + storage),  dentro de presupuesto
 *   4. cualquier clasificación,     dentro de tolerancia +15% (D8)
 *   5. cualquier clasificación,     sobre presupuesto más allá de la
 *      tolerancia — NO estaba nombrado como tier explícito en el brief
 *      (que solo definía 1–4 + agotados + cotización especial); se
 *      añade aquí porque un candidato "disponible, compatible, pero caro"
 *      es un caso real que puede ocurrir y necesita un lugar determinista
 *      en el orden — por debajo de la tolerancia, por encima de agotados.
 *
 * `referenceOnly` (agotados) se ordena con el mismo criterio secundario
 * (precio, upgrades, id) pero SIN mezclarse jamás con `available` — ya
 * llegan segregados desde matchProducts() (D7).
 *
 * Criterio secundario, dentro del mismo tier: menor precio final primero,
 * luego menor cantidad de upgrades, luego product.id (orden estable,
 * reproducible byte a byte ante empates exactos).
 */
import type { MatchResult } from "./types";

function computeTier(result: MatchResult): number {
  const upgradeCount = result.selectedUpgrades.length;

  if (result.budgetStatus === "WITHIN_BUDGET") {
    if (result.classification === "DIRECT_MATCH") return 1;
    if (upgradeCount === 1) return 2;
    return 3; // RAM_AND_STORAGE_UPGRADE_MATCH
  }
  if (result.budgetStatus === "WITHIN_TOLERANCE") return 4;
  return 5; // OVER_BUDGET, todavía disponible
}

function compareResults(a: MatchResult, b: MatchResult): number {
  const tierA = computeTier(a);
  const tierB = computeTier(b);
  if (tierA !== tierB) return tierA - tierB;

  if (a.finalPrice !== b.finalPrice) return a.finalPrice - b.finalPrice;

  const upgradesA = a.selectedUpgrades.length;
  const upgradesB = b.selectedUpgrades.length;
  if (upgradesA !== upgradesB) return upgradesA - upgradesB;

  return a.product.id.localeCompare(b.product.id);
}

/** Ordena en el lugar una copia — nunca muta el array de entrada. */
export function rankResults(results: MatchResult[]): MatchResult[] {
  return [...results].sort(compareResults);
}

/** Expuesto para tests e inspección — no es parte del contrato público del motor. */
export const _internal = { computeTier, compareResults };
