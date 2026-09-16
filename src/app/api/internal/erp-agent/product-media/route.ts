import { NextResponse } from "next/server";
import { erpAgentControlEnabled } from "@/lib/erpAgent/auth";
import {
  CATALOG_MEDIA_MAX_BYTES,
  normalizeProductMediaMetadata,
  uploadProductMedia,
  verifyProductMediaSignature,
} from "@/lib/erpAgent/catalogMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
} as const;

/**
 * P20.19 — sube UNA foto de WhatsApp para un producto (o unidad) YA
 * existente. Mismo patrón HMAC-sobre-binario que `/catalog-media`
 * (P20.17C) — puerta de autorización distinta (existencia real, no
 * publicación de draft completada), nunca la misma ruta ni el mismo
 * contrato de headers para no mezclar los dos ciclos de vida.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!erpAgentControlEnabled()) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers: NO_STORE });
  }

  const rawLength = request.headers.get("content-length");
  if (rawLength) {
    const declared = Number(rawLength);
    if (!Number.isFinite(declared) || declared < 1 || declared > CATALOG_MEDIA_MAX_BYTES) {
      return NextResponse.json({ error: "MEDIA_TOO_LARGE" }, { status: 413, headers: NO_STORE });
    }
  }

  const meta = normalizeProductMediaMetadata({
    productId: request.headers.get("x-erp-media-product-id") ?? "",
    unitCode: request.headers.get("x-erp-media-unit-code") ?? undefined,
    sha256: request.headers.get("x-erp-media-sha256") ?? "",
    mimeType: request.headers.get("content-type") ?? "",
    bytes: Number(request.headers.get("x-erp-media-bytes") ?? ""),
  });

  if (!meta) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400, headers: NO_STORE });
  }

  const timestamp = request.headers.get("x-erp-agent-timestamp");
  const signature = request.headers.get("x-erp-agent-signature");

  if (!verifyProductMediaSignature({ meta, timestamp, signature })) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: NO_STORE });
  }

  const buffer = new Uint8Array(await request.arrayBuffer());
  if (buffer.byteLength > CATALOG_MEDIA_MAX_BYTES) {
    return NextResponse.json({ error: "MEDIA_TOO_LARGE" }, { status: 413, headers: NO_STORE });
  }

  try {
    const result = await uploadProductMedia(meta, buffer);
    console.info(
      `[erp-agent] product-media product=${meta.productId.slice(0, 8)} unit=${meta.unitCode ?? "-"} bytes=${meta.bytes}`
    );
    return NextResponse.json({ ok: true, status: "uploaded", publicUrl: result.publicUrl }, { status: 200, headers: NO_STORE });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PRODUCT_MEDIA_ERROR";
    const badPayload = code === "PRODUCT_MEDIA_SIZE_MISMATCH" || code === "PRODUCT_MEDIA_HASH_MISMATCH";
    const notFound =
      code === "PRODUCT_MEDIA_PRODUCT_NOT_FOUND" ||
      code === "PRODUCT_MEDIA_UNIT_NOT_FOUND" ||
      code === "PRODUCT_MEDIA_UNIT_PRODUCT_MISMATCH";

    console.error(`[erp-agent] product-media failed code=${code}`);

    return NextResponse.json(
      { error: badPayload ? "MEDIA_INVALID" : notFound ? "NOT_FOUND" : "PRODUCT_MEDIA_ERROR" },
      { status: badPayload ? 400 : notFound ? 404 : 500, headers: NO_STORE }
    );
  }
}
