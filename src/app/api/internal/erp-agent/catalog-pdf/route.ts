import { NextResponse } from "next/server";
import {
  erpAgentControlConfig,
  erpAgentControlEnabled,
  verifyErpAgentRequest,
} from "@/lib/erpAgent/auth";
import { buildCatalogoPdfVigente } from "@/lib/catalogPdf/catalogPdfData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
} as const;

/**
 * P20.21C — catálogo comercial en PDF para el AGENTE.
 *
 * Mismo patrón HMAC-sobre-JSON que `/sales-receipt`: el agente firma el
 * cuerpo, la web verifica, y la respuesta es binaria (un PDF, no JSON).
 *
 * A diferencia del comprobante, NO recibe ningún identificador: el catálogo
 * es "todo lo vigente ahora mismo", y qué productos entran lo decide el
 * servidor (visible_web = true y stock > 0), nunca el cliente. Así no hay
 * ningún filtro, ruta ni URL que venga de fuera — superficie de inyección
 * y de SSRF cerrada por construcción.
 *
 * El PDF nunca se persiste ni se publica en una URL: vive en memoria hasta
 * que el agente lo sube a la Media API de Meta.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!erpAgentControlEnabled()) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers: NO_STORE });
  }

  const startedAt = Date.now();
  const rawBody = await request.text();

  let config;
  try {
    config = erpAgentControlConfig();
  } catch {
    return NextResponse.json({ error: "CONFIG_INVALID" }, { status: 500, headers: NO_STORE });
  }

  const timestamp = request.headers.get("x-erp-agent-timestamp");
  const signature = request.headers.get("x-erp-agent-signature");

  if (!verifyErpAgentRequest({ rawBody, timestampHeader: timestamp, signatureHeader: signature, config })) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: NO_STORE });
  }

  // El cuerpo debe ser JSON válido (aunque sea `{}`): mismo contrato que el
  // resto de endpoints firmados, y la firma cubre exactamente estos bytes.
  try {
    JSON.parse(rawBody || "{}");
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: NO_STORE });
  }

  try {
    const { pdfBytes, productos } = await buildCatalogoPdfVigente();

    // Solo cifras: ni títulos, ni precios, ni waId.
    console.info(`[erp-agent] catalog-pdf products=${productos} bytes=${pdfBytes.byteLength} ms=${Date.now() - startedAt}`);

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": "application/pdf",
        "X-Catalog-Products": String(productos),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    console.error(`[erp-agent] catalog-pdf failed code=${message.split(":")[0]} ms=${Date.now() - startedAt}`);
    return NextResponse.json({ error: "CATALOG_PDF_ERROR" }, { status: 500, headers: NO_STORE });
  }
}
