if (typeof window !== "undefined") {
  throw new Error("src/lib/erpAgent/productMediaFinalize.ts es server-only.");
}

import {
  addProductImages,
  addUnitImages,
  removeAllProductImages,
  removeProductImage,
  replaceProductImages,
  replaceUnitImages,
  setPrimaryProductImage,
  type MediaOperation,
} from "./productMediaOps";

export interface ProductMediaFinalizeInput {
  operation: MediaOperation;
  productId: string;
  unitCode?: string;
  imageUrls: string[];
}

const RE_PRODUCT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RE_UNIT_CODE = /^STU-\d{4,8}$/;
const OPERATIONS: MediaOperation[] = ["add", "replace", "remove_all", "remove", "set_primary"];

export function normalizeProductMediaFinalizeInput(value: unknown): ProductMediaFinalizeInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const operationRaw = String(raw.operation ?? "");
  if (!OPERATIONS.includes(operationRaw as MediaOperation)) return null;
  const operation = operationRaw as MediaOperation;

  const productId = String(raw.productId ?? "").trim();
  if (!RE_PRODUCT_ID.test(productId)) return null;

  let unitCode: string | undefined;
  if (raw.unitCode != null) {
    unitCode = String(raw.unitCode).trim().toUpperCase();
    if (!RE_UNIT_CODE.test(unitCode)) return null;
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

  // set_primary/remove operan sobre UNA sola URL — la foto que se promueve
  // (ya en la galería, o recién subida por el agente) o la que se quita.
  if ((operation === "set_primary" || operation === "remove") && imageUrls.length !== 1) return null;
  // remove_all no necesita imageUrls — se ignoran si llegan.
  if (operation === "remove_all") return { operation, productId, unitCode, imageUrls: [] };

  return { operation, productId, unitCode, imageUrls };
}

export async function finalizeProductMedia(input: ProductMediaFinalizeInput) {
  const { operation, productId, unitCode, imageUrls } = input;

  if (unitCode) {
    if (operation === "add") return { scope: "unit" as const, ...(await addUnitImages(unitCode, imageUrls)) };
    if (operation === "replace") return { scope: "unit" as const, ...(await replaceUnitImages(unitCode, imageUrls)) };
    throw new Error("PRODUCT_MEDIA_OPERATION_NOT_SUPPORTED_FOR_UNIT");
  }

  if (operation === "add") return { scope: "product" as const, ...(await addProductImages(productId, imageUrls)) };
  if (operation === "replace") return { scope: "product" as const, ...(await replaceProductImages(productId, imageUrls)) };
  if (operation === "remove_all") return { scope: "product" as const, ...(await removeAllProductImages(productId)) };
  if (operation === "remove") return { scope: "product" as const, ...(await removeProductImage(productId, imageUrls[0])) };
  if (operation === "set_primary") return { scope: "product" as const, ...(await setPrimaryProductImage(productId, imageUrls[0])) };

  throw new Error("PRODUCT_MEDIA_OPERATION_UNKNOWN");
}
