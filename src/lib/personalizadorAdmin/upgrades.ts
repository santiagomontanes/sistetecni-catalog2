/**
 * Orquestación de upgrade_options para el panel admin (B6). No decide
 * matching/precio/compatibilidad — solo valida y delega en B2. Errores
 * inesperados de Supabase (RepositoryError) se dejan propagar: el wrapper
 * "use server" es quien los atrapa y los mapea a una respuesta segura
 * (mismo criterio que B4).
 */
import type { UpgradeOptionsRepository } from "../repositories/upgradeOptions.repository";
import type { UpgradeOption } from "../../types/upgrade";
import { createUpgradeSchema, updateUpgradeSchema, formatZodIssues } from "./validation";
import type { AdminResult } from "./types";

export async function createUpgradeAdmin(
  rawInput: unknown,
  repo: UpgradeOptionsRepository
): Promise<AdminResult<UpgradeOption>> {
  const parsed = createUpgradeSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_ERROR", issues: formatZodIssues(parsed.error) };
  }
  const created = await repo.create(parsed.data);
  return { ok: true, data: created };
}

export async function updateUpgradeAdmin(
  id: unknown,
  rawInput: unknown,
  repo: UpgradeOptionsRepository
): Promise<AdminResult<UpgradeOption>> {
  if (typeof id !== "string" || id.trim().length === 0) {
    return { ok: false, error: "VALIDATION_ERROR", issues: ["id: requerido."] };
  }
  const parsed = updateUpgradeSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_ERROR", issues: formatZodIssues(parsed.error) };
  }
  const updated = await repo.update(id, parsed.data);
  return { ok: true, data: updated };
}

export async function toggleUpgradeAdmin(
  id: unknown,
  active: unknown,
  repo: UpgradeOptionsRepository
): Promise<AdminResult<UpgradeOption>> {
  if (typeof id !== "string" || id.trim().length === 0) {
    return { ok: false, error: "VALIDATION_ERROR", issues: ["id: requerido."] };
  }
  if (typeof active !== "boolean") {
    return { ok: false, error: "VALIDATION_ERROR", issues: ["active: debe ser true o false."] };
  }
  const updated = await repo.setActive(id, active);
  return { ok: true, data: updated };
}

export async function listUpgradesAdmin(repo: UpgradeOptionsRepository): Promise<AdminResult<UpgradeOption[]>> {
  const all = await repo.findAll();
  return { ok: true, data: all };
}
