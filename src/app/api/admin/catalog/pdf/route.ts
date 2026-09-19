/**
 * GET /api/admin/catalog/pdf — catálogo comercial en PDF para el panel.
 *
 * P20.21C. Mismo mecanismo de autorización que el PDF de una venta
 * (`/api/admin/sales/[id]/pdf`): `requireAdmin` sobre el access_token de
 * Supabase que viaja en el header Authorization. NO es un endpoint público.
 *
 * Comparte el MISMO generador que el endpoint del agente, así que el
 * documento que descarga el administrador es idéntico al que recibe un
 * cliente por WhatsApp — una sola implementación, dos puertas de acceso.
 *
 * Es una operación de LECTURA PURA: no modifica ningún producto.
 */
import { NextResponse } from "next/server";
import { requireAdmin, AdminAuthError } from "@/lib/personalizadorAdmin/auth";
import { buildCatalogoPdfVigente } from "@/lib/catalogPdf/catalogPdfData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : undefined;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    // Autoriza ANTES de tocar el catálogo: un no-admin ni siquiera dispara
    // la consulta.
    await requireAdmin(extractBearerToken(request));

    const { pdfBytes, productos } = await buildCatalogoPdfVigente();
    const fecha = new Date().toISOString().slice(0, 10);

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Catalogo-SISTETECNI-${fecha}.pdf"`,
        "Cache-Control": "no-store, max-age=0, must-revalidate",
        "X-Robots-Tag": "noindex, nofollow",
        "X-Catalog-Products": String(productos),
      },
    });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const name = err instanceof Error ? err.name : "UnknownError";
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/admin/catalog/pdf] GET falló: ${name}: ${message}`);
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
