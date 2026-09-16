if (typeof window !== "undefined") {
  throw new Error("src/lib/erpAgent/catalogFinalize.ts es server-only.");
}

import { getAdminClient } from "../../supabase/admin";

export interface CatalogFinalizeInput {
  draftId: string;
  productId: string;
  imageUrls: string[];
}

export function normalizeCatalogFinalizeInput(
  value: unknown
): CatalogFinalizeInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const raw = value as Record<string, unknown>;
  const draftId = String(raw.draftId ?? "").trim();
  const productId = String(raw.productId ?? "").trim();

  if (!/^draft_[a-zA-Z0-9]{6,58}$/.test(draftId)) return null;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      productId
    )
  ) {
    return null;
  }

  if (!Array.isArray(raw.imageUrls) || raw.imageUrls.length > 30) return null;

  const imageUrls: string[] = [];

  for (const item of raw.imageUrls) {
    if (typeof item !== "string") return null;

    let url: URL;
    try {
      url = new URL(item);
    } catch {
      return null;
    }

    if (url.protocol !== "https:") return null;

    const text = url.toString();
    if (text.length > 2000) return null;

    if (!imageUrls.includes(text)) imageUrls.push(text);
  }

  return { draftId, productId, imageUrls };
}

export async function finalizeCatalogDraft(
  input: CatalogFinalizeInput
): Promise<{
  productId: string;
  createdProduct: boolean;
  images: string[];
  visibleWeb: boolean;
}> {
  const client = getAdminClient();

  // El agente no decide arbitrariamente qué producto finalizar.
  // draftId + productId deben corresponder a una publicación P20.17C completada.
  const { data: publication, error: publicationError } = await client
    .from("erp_catalog_draft_publications")
    .select("draft_id, product_id, result, completed_at")
    .eq("draft_id", input.draftId)
    .eq("product_id", input.productId)
    .maybeSingle<{
      draft_id: string;
      product_id: string;
      result: Record<string, unknown> | null;
      completed_at: string | null;
    }>();

  if (publicationError) {
    throw new Error("CATALOG_FINALIZE_PUBLICATION_LOOKUP_FAILED");
  }

  if (!publication || !publication.completed_at) {
    throw new Error("CATALOG_FINALIZE_PUBLICATION_NOT_COMPLETED");
  }

  const createdProduct = publication.result?.createdProduct === true;

  const { data: product, error: productError } = await client
    .from("products")
    .select("id, images, visible_web")
    .eq("id", input.productId)
    .maybeSingle<{
      id: string;
      images: string[] | null;
      visible_web: boolean | null;
    }>();

  if (productError) throw new Error("CATALOG_FINALIZE_PRODUCT_LOOKUP_FAILED");
  if (!product) throw new Error("CATALOG_FINALIZE_PRODUCT_NOT_FOUND");

  const previous = Array.isArray(product.images) ? product.images : [];
  const images = [...new Set([...previous, ...input.imageUrls])];

  const payload: Record<string, unknown> = { images };

  // Producto NUEVO creado desde WhatsApp:
  // solo se vuelve visible cuando ya terminó la fase de media.
  if (createdProduct) {
    payload.visible_web = true;
  }

  const { error: updateError } = await client
    .from("products")
    .update(payload)
    .eq("id", input.productId);

  if (updateError) throw new Error("CATALOG_FINALIZE_PRODUCT_UPDATE_FAILED");

  return {
    productId: input.productId,
    createdProduct,
    images,
    visibleWeb: createdProduct ? true : Boolean(product.visible_web),
  };
}
