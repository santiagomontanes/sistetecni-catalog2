"use server";

import { requireErpPermission } from "@/lib/erpAuth/auth";
import { mapUnexpectedError } from "@/lib/personalizadorAdmin/errorMapping";
import type { AdminResult } from "@/lib/personalizadorAdmin/types";
import { issues, reportSchema } from "@/lib/adminPhase2/validation";
import type { BusinessReportDTO } from "@/lib/adminPhase2/types";

function asNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, asNumber(item)])
  );
}

export async function getBusinessReport(payload: {
  accessToken: unknown;
  from: unknown;
  to: unknown;
}): Promise<AdminResult<BusinessReportDTO>> {
  const parsed = reportSchema.safeParse({ from: payload.from, to: payload.to });
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_ERROR", issues: issues(parsed.error) };
  }

  try {
    const { client } = await requireErpPermission(payload.accessToken, "reports.view");
    const { data, error } = await client.rpc("erp_business_report", {
      p_from: parsed.data.from,
      p_to: parsed.data.to,
    });
    if (error) throw error;

    const report =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};

    return {
      ok: true,
      data: {
        from: asString(report.from, parsed.data.from),
        to: asString(report.to, parsed.data.to),
        salesCount: asNumber(report.salesCount),
        salesRevenueCop: asNumber(report.salesRevenueCop),
        unitsSold: asNumber(report.unitsSold),
        operatingExpensesCop: asNumber(report.operatingExpensesCop),
        purchaseCount: asNumber(report.purchaseCount),
        purchasesCop: asNumber(report.purchasesCop),
        cashInCop: asNumber(report.cashInCop),
        cashOutCop: asNumber(report.cashOutCop),
        openAfterSalesCases: asNumber(report.openAfterSalesCases),
        inventoryAcquisitionValueCop: asNumber(report.inventoryAcquisitionValueCop),
        soldAcquisitionCostCop: asNumber(report.soldAcquisitionCostCop),
        extraCostsCop: asNumber(report.extraCostsCop),
        knownNetResultCop: asNumber(report.knownNetResultCop),
        inventoryByStatus: asNumberRecord(report.inventoryByStatus),
        salesByPaymentMethod: asNumberRecord(report.salesByPaymentMethod),
      },
    };
  } catch (error) {
    return mapUnexpectedError(error);
  }
}
