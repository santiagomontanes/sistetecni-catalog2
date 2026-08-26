import type { SalesRepository } from "../repositories/sales.repository";
import { getSaleSchema } from "./validation";
import { toAdminSaleDetailDTO } from "./dto";
import type { AdminResult, AdminSaleDetailDTO } from "./types";

export async function getSaleDetailAdmin(
  rawId: unknown,
  repo: SalesRepository
): Promise<AdminResult<AdminSaleDetailDTO>> {
  const parsed = getSaleSchema.safeParse(rawId);
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_ERROR", issues: ["id: formato inválido."] };
  }

  const sale = await repo.findById(parsed.data);
  if (!sale) {
    return { ok: false, error: "NOT_FOUND" };
  }
  return { ok: true, data: toAdminSaleDetailDTO(sale) };
}
