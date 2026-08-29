/**
 * GET /api/admin/sales/[id]/pdf — descarga del comprobante de venta.
 * El PDF se construye exclusivamente desde snapshots persistidos; Fase 1C
 * agrega al texto del ítem el STU/serial congelado sin releer inventario.
 */
import { NextResponse } from "next/server";
import { requireAdmin, AdminAuthError } from "@/lib/personalizadorAdmin/auth";
import { createSalesRepository } from "@/lib/repositories/sales.repository";
import { getSaleDetailAdmin } from "@/lib/salesAdmin/getSale";
import { buildSalePdfBytes } from "@/lib/salesPdf/buildSalePdf";

export const runtime = "nodejs";

function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : undefined;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  try {
    const { client } = await requireAdmin(extractBearerToken(request));
    const result = await getSaleDetailAdmin(id, createSalesRepository(client));
    if (!result.ok) {
      if (result.error === "NOT_FOUND") return NextResponse.json({ error: "VENTA_NO_ENCONTRADA" }, { status: 404 });
      return NextResponse.json({ error: "SOLICITUD_INVALIDA" }, { status: 400 });
    }

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
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${result.data.saleNumber}.pdf"`,
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const name = err instanceof Error ? err.name : "UnknownError";
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/admin/sales/pdf] GET falló de forma inesperada: ${name}: ${message}`);
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
