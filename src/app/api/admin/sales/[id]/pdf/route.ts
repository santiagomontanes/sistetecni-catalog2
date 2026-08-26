/**
 * GET /api/admin/sales/[id]/pdf — descarga del comprobante de venta.
 *
 * Este proyecto no usa cookies de sesión (ver src/lib/personalizadorAdmin/
 * auth.ts): el access_token llega por header Authorization, y se valida
 * con el MISMO requireAdmin() que ya usan las Server Actions del panel
 * admin — es agnóstico de si el token viene de un payload o de un header.
 * Doble capa de protección: verificación explícita aquí + RLS del
 * cliente scoped que requireAdmin() devuelve.
 *
 * El PDF se construye EXCLUSIVAMENTE desde el snapshot ya guardado de la
 * venta (buildSalePdfBytes) — nunca se vuelve a consultar el catálogo.
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
      if (result.error === "NOT_FOUND") {
        return NextResponse.json({ error: "VENTA_NO_ENCONTRADA" }, { status: 404 });
      }
      return NextResponse.json({ error: "SOLICITUD_INVALIDA" }, { status: 400 });
    }

    const pdfBytes = await buildSalePdfBytes(result.data);
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${result.data.saleNumber}.pdf"`,
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    // Nunca se registra nombre/documento/celular del cliente — solo el tipo de error.
    const name = err instanceof Error ? err.name : "UnknownError";
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/admin/sales/pdf] GET falló de forma inesperada: ${name}: ${message}`);
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
