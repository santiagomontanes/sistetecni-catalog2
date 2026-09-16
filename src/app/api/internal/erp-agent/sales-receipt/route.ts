import { NextResponse } from "next/server";
import {
  erpAgentControlConfig,
  erpAgentControlEnabled,
  verifyErpAgentRequest,
} from "@/lib/erpAgent/auth";
import { buildSalesReceiptPdf } from "@/lib/erpAgent/salesReceipt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
} as const;

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * P20.20A — comprobante PDF de una venta YA resuelta por el dispatcher SQL
 * (`sales.receipt`, lectura). SOLO recibe un `saleId` (UUID real, resuelto
 * contra `sales` real — nunca inventado por el modelo) y devuelve el PDF
 * binario. Nunca genera una URL pública ni persiste un archivo: el PDF vive
 * en memoria hasta que el agente lo sube a la Media API de Meta y lo manda
 * al MISMO administrador que lo pidió (nunca a un tercero — eso lo decide
 * el agente, esta ruta ni siquiera conoce el `waId`).
 *
 * Mismo patrón HMAC-sobre-JSON que `/catalog-media-finalize` y
 * `/product-media-cleanup` — la respuesta es binaria (no JSON) porque es un
 * PDF, no un resultado de mutación.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!erpAgentControlEnabled()) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers: NO_STORE });
  }

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

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: NO_STORE });
  }

  const saleId = json && typeof json === "object" ? (json as Record<string, unknown>).saleId : null;
  if (typeof saleId !== "string" || !RE_UUID.test(saleId)) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400, headers: NO_STORE });
  }

  try {
    const receipt = await buildSalesReceiptPdf(saleId);
    if (!receipt) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers: NO_STORE });
    }

    // Nunca se registra contenido de la venta (cliente, montos) — solo el
    // número de venta (ya público en el propio comprobante) y el tamaño.
    console.info(`[erp-agent] sales-receipt sale=${receipt.saleNumber} bytes=${receipt.pdfBytes.byteLength}`);

    return new NextResponse(Buffer.from(receipt.pdfBytes), {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": "application/pdf",
        "X-Sale-Number": receipt.saleNumber,
      },
    });
  } catch (error) {
    console.error(`[erp-agent] sales-receipt failed: ${error instanceof Error ? error.message : "unknown"}`);
    return NextResponse.json({ error: "SALES_RECEIPT_ERROR" }, { status: 500, headers: NO_STORE });
  }
}
