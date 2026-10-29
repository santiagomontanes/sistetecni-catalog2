/**
 * GET /api/admin/shipments/[id]/receipt — comprobante interno del envío consignado.
 * Solo se arma desde datos persistidos y solo cuando la consignación ya cubre el neto esperado.
 */
import { NextResponse } from "next/server";
import { requireErpPermission } from "@/lib/erpAuth/auth";
import { createSalesRepository } from "@/lib/repositories/sales.repository";
import { getSaleDetailAdmin } from "@/lib/salesAdmin/getSale";
import { buildSalePdfBytes } from "@/lib/salesPdf/buildSalePdf";
import { shippingReceiptSale, type SettledShipment } from "@/lib/shipping/receipt";
import { executeShipping, shippingEnabled } from "@/lib/shipping/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  if (!shippingEnabled()) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers });
  try {
    const { id } = await params;
    const { client } = await requireErpPermission(request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""), "sales.read");
    const detail = await executeShipping(client, { action: "detail", arguments: { id } }) as unknown as SettledShipment & { sale_id: string };
    const sale = await getSaleDetailAdmin(detail.sale_id, createSalesRepository(client));
    if (!sale.ok) return NextResponse.json({ error: "VENTA_NO_ENCONTRADA" }, { status: 404, headers });
    let receipt;
    try { receipt = shippingReceiptSale(sale.data, detail); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "RECEIPT_ERROR" }, { status: 409, headers }); }
    const bytes = await buildSalePdfBytes(receipt);
    return new NextResponse(Buffer.from(bytes), { status: 200, headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${sale.data.saleNumber}-envio.pdf"`, "X-Robots-Tag": "noindex, nofollow" } });
  } catch (error) {
    if (error instanceof Error && error.name === "AdminAuthError") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403, headers });
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500, headers });
  }
}
