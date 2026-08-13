/**
 * GET /api/cotizaciones/[code] — Fase 2B/B4.
 *
 * quote_requests NO tiene policy de lectura pública (ver
 * supabase/migrations/20260812223300_quote_requests.sql) — esta consulta
 * ocurre exclusivamente server-side, con el cliente admin (service_role).
 * Nunca se expone SUPABASE_SERVICE_ROLE_KEY ni ningún detalle interno de
 * Supabase en la respuesta.
 *
 * SIEMPRE devuelve el snapshot ya congelado (ver src/lib/personalizadorServer/
 * quoteLookup.ts) — nunca recalcula el precio contra el catálogo actual.
 */
import { NextResponse } from "next/server";
import { getAdminClient } from "@/supabase/admin";
import { createQuoteRequestsRepository } from "@/lib/repositories/quoteRequests.repository";
import { buscarCotizacionPorCodigo } from "@/lib/personalizadorServer";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
): Promise<NextResponse> {
  const { code } = await params;

  try {
    const client = getAdminClient();
    const quoteRequestsRepo = createQuoteRequestsRepository(client);
    const result = await buscarCotizacionPorCodigo(code, { quoteRequestsRepo });

    switch (result.status) {
      case "invalid_format":
        return NextResponse.json({ error: "CODIGO_INVALIDO" }, { status: 400 });
      case "not_found":
        return NextResponse.json({ error: "COTIZACION_NO_ENCONTRADA" }, { status: 404 });
      case "expired":
        return NextResponse.json({ error: "COTIZACION_EXPIRADA", data: result.data }, { status: 410 });
      case "ok":
        return NextResponse.json({ data: result.data }, { status: 200 });
    }
  } catch (err) {
    const name = err instanceof Error ? err.name : "UnknownError";
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/cotizaciones] GET falló de forma inesperada: ${name}: ${message}`);
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
