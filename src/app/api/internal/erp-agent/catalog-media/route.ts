import { NextResponse } from "next/server";
import { erpAgentControlEnabled } from "@/lib/erpAgent/auth";
import {
  CATALOG_MEDIA_MAX_BYTES,
  normalizeCatalogMediaMetadata,
  uploadCatalogDraftMedia,
  verifyCatalogMediaSignature,
} from "@/lib/erpAgent/catalogMedia";

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

  const rawLength = request.headers.get("content-length");
  if (rawLength) {
    const declared = Number(rawLength);
    if (
      !Number.isFinite(declared) ||
      declared < 1 ||
      declared > CATALOG_MEDIA_MAX_BYTES
    ) {
      return NextResponse.json(
        { error: "MEDIA_TOO_LARGE" },
        { status: 413, headers: NO_STORE }
      );
    }
  }

  const meta = normalizeCatalogMediaMetadata({
    draftId: request.headers.get("x-erp-media-draft-id") ?? "",
    productId: request.headers.get("x-erp-media-product-id") ?? "",
    sha256: request.headers.get("x-erp-media-sha256") ?? "",
    mimeType: request.headers.get("content-type") ?? "",
    bytes: Number(request.headers.get("x-erp-media-bytes") ?? ""),
  });

  if (!meta) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE }
    );
  }

  const timestamp = request.headers.get("x-erp-agent-timestamp");
  const signature = request.headers.get("x-erp-agent-signature");

  if (
    !verifyCatalogMediaSignature({
      meta,
      timestamp,
      signature,
    })
  ) {
    return NextResponse.json(
      { error: "UNAUTHORIZED" },
      { status: 401, headers: NO_STORE }
    );
  }

  const buffer = new Uint8Array(await request.arrayBuffer());

  if (buffer.byteLength > CATALOG_MEDIA_MAX_BYTES) {
    return NextResponse.json(
      { error: "MEDIA_TOO_LARGE" },
      { status: 413, headers: NO_STORE }
    );
  }

  try {
    const result = await uploadCatalogDraftMedia(meta, buffer);

    console.info(
      `[erp-agent] catalog-media draft=${meta.draftId.slice(0, 14)} product=${meta.productId.slice(0, 8)} bytes=${meta.bytes}`
    );

    return NextResponse.json(
      {
        ok: true,
        status: "uploaded",
        publicUrl: result.publicUrl,
      },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    const code =
      error instanceof Error ? error.message : "CATALOG_MEDIA_ERROR";

    const badPayload =
      code === "CATALOG_MEDIA_SIZE_MISMATCH" ||
      code === "CATALOG_MEDIA_HASH_MISMATCH";

    const forbidden =
      code === "CATALOG_MEDIA_PUBLICATION_NOT_COMPLETED";

    console.error(`[erp-agent] catalog-media failed code=${code}`);

    return NextResponse.json(
      {
        error: badPayload
          ? "MEDIA_INVALID"
          : forbidden
            ? "FORBIDDEN"
            : "CATALOG_MEDIA_ERROR",
      },
      {
        status: badPayload ? 400 : forbidden ? 403 : 500,
        headers: NO_STORE,
      }
    );
  }
}
