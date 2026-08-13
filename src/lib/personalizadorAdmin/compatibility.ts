/**
 * Orquestación de compatibilidad producto↔upgrade para el panel admin
 * (B6). "Copiar compatibilidad" (D3) copia RELACIONES — lee el conjunto
 * actual del producto origen y crea filas nuevas e independientes para el
 * destino (setCompatibility internamente hace diffing sin duplicar, ver
 * ProductUpgradeOptionsRepository) — nunca comparte una referencia
 * dinámica entre ambos productos: modificar uno después no afecta al otro.
 */
import type { ProductUpgradeOptionsRepository } from "../repositories/productUpgradeOptions.repository";
import { setCompatibilitySchema, copyCompatibilitySchema, formatZodIssues } from "./validation";
import type { AdminResult } from "./types";

export async function setProductCompatibilityAdmin(
  rawInput: unknown,
  repo: ProductUpgradeOptionsRepository
): Promise<AdminResult<{ productId: string; count: number }>> {
  const parsed = setCompatibilitySchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_ERROR", issues: formatZodIssues(parsed.error) };
  }
  await repo.setCompatibility(parsed.data.productId, parsed.data.upgradeOptionIds);
  return { ok: true, data: { productId: parsed.data.productId, count: parsed.data.upgradeOptionIds.length } };
}

export async function copyProductCompatibilityAdmin(
  rawInput: unknown,
  repo: ProductUpgradeOptionsRepository
): Promise<AdminResult<{ targetProductId: string; copiedCount: number }>> {
  const parsed = copyCompatibilitySchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_ERROR", issues: formatZodIssues(parsed.error) };
  }
  const { sourceProductId, targetProductId } = parsed.data;

  const sourceCompatible = await repo.findCompatibleUpgradesForProduct(sourceProductId);
  const upgradeOptionIds = sourceCompatible.map((c) => c.option.id);

  await repo.setCompatibility(targetProductId, upgradeOptionIds);

  return { ok: true, data: { targetProductId, copiedCount: upgradeOptionIds.length } };
}
