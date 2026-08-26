import type { SalesRepository } from "../repositories/sales.repository";
import { listSalesFilterSchema, formatZodIssues } from "./validation";
import { toAdminSaleListItemDTO } from "./dto";
import type { AdminResult, AdminSaleListResultDTO } from "./types";

export async function listSalesAdmin(
  rawFilter: unknown,
  repo: SalesRepository
): Promise<AdminResult<AdminSaleListResultDTO>> {
  const parsed = listSalesFilterSchema.safeParse(rawFilter ?? {});
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_ERROR", issues: formatZodIssues(parsed.error) };
  }

  const { items, total } = await repo.list(parsed.data);
  return { ok: true, data: { items: items.map(toAdminSaleListItemDTO), total } };
}
