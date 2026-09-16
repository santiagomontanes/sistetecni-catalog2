import { NextResponse } from "next/server";
import {
  erpAgentControlConfig,
  erpAgentControlEnabled,
  verifyErpAgentRequest,
} from "@/lib/erpAgent/auth";
import {
  finalizeCatalogDraft,
  normalizeCatalogFinalizeInput,
} from "@/lib/erpAgent/catalogFinalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
} as const;

export async function POST(request: Request): Promise<NextResponse> {
  if (!erpAgentControlEnabled()) {
    return NextResponse.json(
      { error: "NOT_FOUND" },
      { status: 404, headers: NO_STORE }
    );
  }

  const rawBody = await request.text();

  let config;
  try {
    config = erpAgentControlConfig();
  } catch {
    return NextResponse.json(
      { error: "CONFIG_INVALID" },
      { status: 500, headers: NO_STORE }
    );
  }

  const timestamp = request.headers.get("x-erp-agent-timestamp");
  const signature = request.headers.get("x-erp-agent-signature");

  if (
    !verifyErpAgentRequest({
      rawBody,
      timestampHeader: timestamp,
      signatureHeader: signature,
      config,
    })
  ) {
    return NextResponse.json(
      { error: "UNAUTHORIZED" },
      { status: 401, headers: NO_STORE }
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON" },
      { status: 400, headers: NO_STORE }
    );
  }

  const parsed = normalizeCatalogFinalizeInput(json);

  if (!parsed) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE }
    );
  }

  try {
    const result = await finalizeCatalogDraft(parsed);

    console.info(
      `[erp-agent] catalog-finalize draft=${parsed.draftId.slice(0, 14)} product=${parsed.productId.slice(0, 8)} images=${result.images.length}`
    );

    return NextResponse.json(
      {
        ok: true,
        status: "finalized",
        result,
      },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    const code =
      error instanceof Error ? error.message : "CATALOG_FINALIZE_ERROR";

    const forbidden =
      code === "CATALOG_FINALIZE_PUBLICATION_NOT_COMPLETED";

    console.error(`[erp-agent] catalog-finalize failed code=${code}`);

    return NextResponse.json(
      { error: forbidden ? "FORBIDDEN" : "CATALOG_FINALIZE_ERROR" },
      {
        status: forbidden ? 403 : 500,
        headers: NO_STORE,
      }
    );
  }
}
