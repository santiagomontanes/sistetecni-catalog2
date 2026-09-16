import { NextResponse } from "next/server";
import {
  erpAgentControlConfig,
  erpAgentControlEnabled,
  verifyErpAgentRequest,
} from "@/lib/erpAgent/auth";
import { cleanupOrphanProductMedia } from "@/lib/erpAgent/productMediaOps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
} as const;

const MAX_URLS = 30;

/**
 * P20.19-bis — limpieza de media HUÉRFANA tras un CANCELAR sobre una
 * operación cuya SQL ya se había ejecutado (§7 del encargo): fotos que sí
 * llegaron a subirse al bucket en un intento parcial, pero cuyo `finalize`
 * (el que las asocia a `products.images`/`product_units.images`) nunca
 * tuvo éxito. Mismo patrón HMAC-sobre-JSON que `/catalog-media-finalize` —
 * NUNCA borra a ciegas: `cleanupOrphanProductMedia` reutiliza el mismo
 * chequeo "¿sigue referenciada por algo?" antes de tocar Storage.
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

  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const urlsRaw = body && Array.isArray(body.urls) ? body.urls : null;
  if (!urlsRaw || urlsRaw.length > MAX_URLS || !urlsRaw.every((u) => typeof u === "string")) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400, headers: NO_STORE });
  }

  try {
    const result = await cleanupOrphanProductMedia(urlsRaw as string[]);
    console.info(`[erp-agent] product-media-cleanup checked=${result.checked}`);
    return NextResponse.json({ ok: true, status: "cleaned", checked: result.checked }, { status: 200, headers: NO_STORE });
  } catch (error) {
    console.error(`[erp-agent] product-media-cleanup failed code=${error instanceof Error ? error.message : "unknown"}`);
    return NextResponse.json({ error: "PRODUCT_MEDIA_CLEANUP_ERROR" }, { status: 500, headers: NO_STORE });
  }
}
