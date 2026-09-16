if (typeof window !== "undefined") {
  throw new Error("src/lib/erpAgent/catalogMedia.ts es server-only.");
}

import { createHash } from "node:crypto";
import { getAdminClient } from "../../supabase/admin";
import {
  erpAgentControlConfig,
  signErpAgentRequest,
} from "./auth";

export const CATALOG_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
export const CATALOG_MEDIA_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "products";

const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface CatalogMediaMetadata {
  draftId: string;
  productId: string;
  sha256: string;
  mimeType: string;
  bytes: number;
}

export function normalizeCatalogMediaMetadata(
  input: Partial<CatalogMediaMetadata>
): CatalogMediaMetadata | null {
  const draftId = String(input.draftId ?? "").trim();
  const productId = String(input.productId ?? "").trim();
  const sha256 = String(input.sha256 ?? "").trim().toLowerCase();
  const mimeType = String(input.mimeType ?? "").split(";")[0].trim().toLowerCase();
  const bytes = Number(input.bytes);

  if (!/^draft_[a-zA-Z0-9]{6,58}$/.test(draftId)) return null;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      productId
    )
  ) {
    return null;
  }
  if (!/^[0-9a-f]{64}$/.test(sha256)) return null;
  if (!Object.hasOwn(MIME_EXTENSION, mimeType)) return null;
  if (!Number.isInteger(bytes) || bytes < 1 || bytes > CATALOG_MEDIA_MAX_BYTES) {
    return null;
  }

  return { draftId, productId, sha256, mimeType, bytes };
}

/**
 * Forma canónica cubierta por HMAC.
 *
 * El cuerpo binario se protege indirectamente:
 *  1. sha256 forma parte de esta cadena firmada;
 *  2. el servidor recalcula sha256 del cuerpo;
 *  3. si difiere, rechaza.
 */
export function catalogMediaCanonical(meta: CatalogMediaMetadata): string {
  return JSON.stringify({
    draftId: meta.draftId,
    productId: meta.productId,
    sha256: meta.sha256,
    mimeType: meta.mimeType,
    bytes: meta.bytes,
  });
}

export function verifyCatalogMediaSignature(params: {
  meta: CatalogMediaMetadata;
  timestamp: string | null;
  signature: string | null;
  nowMs?: number;
  config?: ReturnType<typeof erpAgentControlConfig>;
}): boolean {
  const {
    meta,
    timestamp,
    signature,
    nowMs = Date.now(),
    config = erpAgentControlConfig(),
  } = params;

  if (!timestamp || !signature || !/^\d{10}$/.test(timestamp)) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds)) return false;

  if (
    Math.abs(Math.floor(nowMs / 1000) - seconds) >
    config.maxClockSkewSeconds
  ) {
    return false;
  }

  const expected = signErpAgentRequest(
    catalogMediaCanonical(meta),
    timestamp,
    config.sharedSecret
  );

  return expected === signature;
}

export function sha256Buffer(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export async function uploadCatalogDraftMedia(
  meta: CatalogMediaMetadata,
  data: Uint8Array
): Promise<{ publicUrl: string; path: string }> {
  if (data.byteLength !== meta.bytes) {
    throw new Error("CATALOG_MEDIA_SIZE_MISMATCH");
  }

  const actualHash = sha256Buffer(data);
  if (actualHash !== meta.sha256) {
    throw new Error("CATALOG_MEDIA_HASH_MISMATCH");
  }

  const client = getAdminClient();

  // El agente no decide a qué producto puede adjuntar media:
  // draftId + productId tienen que corresponder a una publicación ejecutada.
  const { data: publication, error: publicationError } = await client
    .from("erp_catalog_draft_publications")
    .select("draft_id, product_id, completed_at")
    .eq("draft_id", meta.draftId)
    .eq("product_id", meta.productId)
    .maybeSingle<{
      draft_id: string;
      product_id: string;
      completed_at: string | null;
    }>();

  if (publicationError) {
    throw new Error("CATALOG_MEDIA_PUBLICATION_LOOKUP_FAILED");
  }

  if (!publication || !publication.completed_at) {
    throw new Error("CATALOG_MEDIA_PUBLICATION_NOT_COMPLETED");
  }

  const ext = MIME_EXTENSION[meta.mimeType];
  const path = `${meta.productId}/${meta.draftId}/${meta.sha256}.${ext}`;

  // Idempotente: mismo producto + draft + contenido => mismo path.
  // upsert=true es seguro porque sha256 ya se verificó contra el binario.
  const { error: uploadError } = await client.storage
    .from(CATALOG_MEDIA_BUCKET)
    .upload(path, Buffer.from(data), {
      cacheControl: "31536000",
      contentType: meta.mimeType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error("CATALOG_MEDIA_UPLOAD_FAILED");
  }

  const { data: publicData } = client.storage
    .from(CATALOG_MEDIA_BUCKET)
    .getPublicUrl(path);

  if (!publicData?.publicUrl) {
    throw new Error("CATALOG_MEDIA_PUBLIC_URL_FAILED");
  }

  return { publicUrl: publicData.publicUrl, path };
}

// ── P20.19 — fotos de un producto/unidad YA existente (fuera del ciclo de
// vida de un draft) ─────────────────────────────────────────────────────
//
// Reutiliza TODO lo de arriba (hash/MIME/tamaño/bucket/cliente admin) — la
// única diferencia real es la puerta de autorización: en vez de "¿hay una
// publicación de draft ya completada con este productId?", aquí es "¿el
// producto (o la unidad) EXISTE de verdad?". Path distinto a propósito
// (`whatsapp/` en vez de `draft_.../`) para no mezclar namespaces ni
// arriesgar una colisión con un draftId real.

export interface ProductMediaMetadata {
  productId: string;
  unitCode?: string;
  sha256: string;
  mimeType: string;
  bytes: number;
}

export function normalizeProductMediaMetadata(
  input: Partial<ProductMediaMetadata>
): ProductMediaMetadata | null {
  const productId = String(input.productId ?? "").trim();
  const sha256 = String(input.sha256 ?? "").trim().toLowerCase();
  const mimeType = String(input.mimeType ?? "").split(";")[0].trim().toLowerCase();
  const bytes = Number(input.bytes);
  const unitCodeRaw = input.unitCode == null ? undefined : String(input.unitCode).trim().toUpperCase();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      productId
    )
  ) {
    return null;
  }
  if (!/^[0-9a-f]{64}$/.test(sha256)) return null;
  if (!Object.hasOwn(MIME_EXTENSION, mimeType)) return null;
  if (!Number.isInteger(bytes) || bytes < 1 || bytes > CATALOG_MEDIA_MAX_BYTES) {
    return null;
  }
  if (unitCodeRaw !== undefined && !/^STU-\d{4,8}$/.test(unitCodeRaw)) return null;

  return unitCodeRaw
    ? { productId, unitCode: unitCodeRaw, sha256, mimeType, bytes }
    : { productId, sha256, mimeType, bytes };
}

export function productMediaCanonical(meta: ProductMediaMetadata): string {
  return JSON.stringify({
    productId: meta.productId,
    unitCode: meta.unitCode ?? null,
    sha256: meta.sha256,
    mimeType: meta.mimeType,
    bytes: meta.bytes,
  });
}

export function verifyProductMediaSignature(params: {
  meta: ProductMediaMetadata;
  timestamp: string | null;
  signature: string | null;
  nowMs?: number;
  config?: ReturnType<typeof erpAgentControlConfig>;
}): boolean {
  const {
    meta,
    timestamp,
    signature,
    nowMs = Date.now(),
    config = erpAgentControlConfig(),
  } = params;

  if (!timestamp || !signature || !/^\d{10}$/.test(timestamp)) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds)) return false;

  if (
    Math.abs(Math.floor(nowMs / 1000) - seconds) >
    config.maxClockSkewSeconds
  ) {
    return false;
  }

  const expected = signErpAgentRequest(
    productMediaCanonical(meta),
    timestamp,
    config.sharedSecret
  );

  return expected === signature;
}

export async function uploadProductMedia(
  meta: ProductMediaMetadata,
  data: Uint8Array
): Promise<{ publicUrl: string; path: string }> {
  if (data.byteLength !== meta.bytes) {
    throw new Error("PRODUCT_MEDIA_SIZE_MISMATCH");
  }

  const actualHash = sha256Buffer(data);
  if (actualHash !== meta.sha256) {
    throw new Error("PRODUCT_MEDIA_HASH_MISMATCH");
  }

  const client = getAdminClient();

  // El agente no decide arbitrariamente a qué producto adjuntar media: el
  // producto (o, si viene unitCode, la unidad Y su relación con ese
  // producto) tiene que existir de verdad.
  const { data: product, error: productError } = await client
    .from("products")
    .select("id")
    .eq("id", meta.productId)
    .maybeSingle();

  if (productError) throw new Error("PRODUCT_MEDIA_PRODUCT_LOOKUP_FAILED");
  if (!product) throw new Error("PRODUCT_MEDIA_PRODUCT_NOT_FOUND");

  if (meta.unitCode) {
    const { data: unit, error: unitError } = await client
      .from("product_units")
      .select("id, product_id")
      .eq("unit_code", meta.unitCode)
      .maybeSingle<{ id: string; product_id: string }>();

    if (unitError) throw new Error("PRODUCT_MEDIA_UNIT_LOOKUP_FAILED");
    if (!unit) throw new Error("PRODUCT_MEDIA_UNIT_NOT_FOUND");
    if (unit.product_id !== meta.productId) {
      throw new Error("PRODUCT_MEDIA_UNIT_PRODUCT_MISMATCH");
    }
  }

  const ext = MIME_EXTENSION[meta.mimeType];
  const path = meta.unitCode
    ? `${meta.productId}/whatsapp/units/${meta.unitCode}/${meta.sha256}.${ext}`
    : `${meta.productId}/whatsapp/${meta.sha256}.${ext}`;

  // Idempotente: mismo destino + contenido => mismo path. upsert=true es
  // seguro porque sha256 ya se verificó contra el binario.
  const { error: uploadError } = await client.storage
    .from(CATALOG_MEDIA_BUCKET)
    .upload(path, Buffer.from(data), {
      cacheControl: "31536000",
      contentType: meta.mimeType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error("PRODUCT_MEDIA_UPLOAD_FAILED");
  }

  const { data: publicData } = client.storage
    .from(CATALOG_MEDIA_BUCKET)
    .getPublicUrl(path);

  if (!publicData?.publicUrl) {
    throw new Error("PRODUCT_MEDIA_PUBLIC_URL_FAILED");
  }

  return { publicUrl: publicData.publicUrl, path };
}
