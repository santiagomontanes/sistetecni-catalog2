import { NextResponse } from "next/server";
import {
  erpAgentControlConfig,
  erpAgentControlEnabled,
  verifyErpAgentRequest,
} from "@/lib/erpAgent/auth";
import {
  finalizeProductMedia,
  normalizeProductMediaFinalizeInput,
} from "@/lib/erpAgent/productMediaFinalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
} as const;

/**
 * P20.19 — mutación REAL de la galería de un producto/unidad YA existente
 * (add/replace/remove_all/set_primary), tras CONFIRMAR. Las fotos que
 * aplican (`add`/`replace`) ya deben estar subidas vía `/product-media` —
 * esta ruta solo escribe `products.images`/`product_units.images` con las
 * URLs públicas resultantes, igual que `/catalog-finalize` (P20.17C) hace
 * para `products.images` al terminar un draft.
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

  const parsed = normalizeProductMediaFinalizeInput(json);
  if (!parsed) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400, headers: NO_STORE });
  }

  try {
    const result = await finalizeProductMedia(parsed);

    console.info(
      `[erp-agent] catalog-media-finalize op=${parsed.operation} product=${parsed.productId.slice(0, 8)} unit=${parsed.unitCode ?? "-"} after=${result.after.length}`
    );

    return NextResponse.json({ ok: true, status: "finalized", result }, { status: 200, headers: NO_STORE });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PRODUCT_MEDIA_FINALIZE_ERROR";
    const notFound = /_NOT_FOUND$/.test(code);
    const badPayload = code === "PRODUCT_MEDIA_URL_NOT_IN_GALLERY" || code === "PRODUCT_MEDIA_INVALID_URL";

    console.error(`[erp-agent] catalog-media-finalize failed code=${code}`);

    return NextResponse.json(
      { error: notFound ? "NOT_FOUND" : badPayload ? "VALIDATION_ERROR" : "PRODUCT_MEDIA_FINALIZE_ERROR" },
      { status: notFound ? 404 : badPayload ? 400 : 500, headers: NO_STORE }
    );
  }
}
