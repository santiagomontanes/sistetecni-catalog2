if (typeof window !== "undefined") {
  throw new Error("src/lib/erpAgent/salesReceipt.ts es server-only.");
}

import { getAdminClient } from "../../supabase/admin";
import { createSalesRepository } from "../repositories/sales.repository";
import { getSaleDetailAdmin } from "../salesAdmin/getSale";
import { buildSalePdfBytes } from "../salesPdf/buildSalePdf";

export interface SalesReceiptResult {
  saleNumber: string;
  pdfBytes: Uint8Array;
}

/**
 * P20.20A — arma el PDF del comprobante a partir de un `saleId` YA resuelto
 * por el dispatcher SQL (`sales.receipt`, acción de LECTURA — nunca inventa
 * ni elige una venta, solo resuelve la referencia humana a un id real).
 *
 * Reutiliza EXACTAMENTE el mismo camino que ya usa `/api/admin/sales/[id]/
 * pdf` (§ encargo P20.20A: "NO reimplementar buildSalePdfBytes()"): mismo
 * repositorio, mismo `getSaleDetailAdmin`, mismo `buildSalePdfBytes`, mismo
 * formato "producto · STU · serial" en el nombre del ítem cuando aplica.
 * Única diferencia con la ruta admin: la puerta de autorización es HMAC
 * agente↔web (no sesión de admin del panel) y la respuesta es para el
 * agente, no para un navegador.
 */
export async function buildSalesReceiptPdf(saleId: string): Promise<SalesReceiptResult | null> {
  const client = getAdminClient();
  const result = await getSaleDetailAdmin(saleId, createSalesRepository(client));
  if (!result.ok) return null;

  const pdfSale = {
    ...result.data,
    items: result.data.items.map((item) => ({
      ...item,
      productName: item.unitCodeSnapshot
        ? `${item.productName} · ${item.unitCodeSnapshot} · Serial ${item.serialNumberSnapshot ?? "sin registrar"}`
        : item.productName,
    })),
  };

  const pdfBytes = await buildSalePdfBytes(pdfSale);
  return { saleNumber: result.data.saleNumber, pdfBytes };
}
