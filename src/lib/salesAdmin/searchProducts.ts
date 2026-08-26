import type { ProductsRepository } from "../repositories/products.repository";
import type { Product } from "../../types/product";
import { searchProductsQuerySchema, formatZodIssues } from "./validation";
import type { AdminProductSearchItemDTO, AdminResult } from "./types";

function toAdminProductSearchItemDTO(product: Product): AdminProductSearchItemDTO {
  return {
    id: product.id,
    title: product.title,
    brand: product.brand,
    model: product.model,
    price: Math.round(product.price),
    image: product.images[0] ?? null,
    description: [product.cpu, product.ram ? `${product.ram} GB RAM` : null, product.storage]
      .filter((v): v is string => Boolean(v))
      .join(" / "),
    stock: product.stock,
  };
}

export async function searchProductsForSaleAdmin(
  rawQuery: unknown,
  repo: ProductsRepository
): Promise<AdminResult<AdminProductSearchItemDTO[]>> {
  const parsed = searchProductsQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_ERROR", issues: formatZodIssues(parsed.error) };
  }

  const products = await repo.search(parsed.data);
  return { ok: true, data: products.map(toAdminProductSearchItemDTO) };
}
