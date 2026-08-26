/**
 * Orquestación de creación de una venta (B: módulo ventas). El navegador
 * NO decide precio ni total: `selectedProductId`/`unitPriceCop` de cada
 * ítem son solo una propuesta — el servidor relee el producto del
 * catálogo AHORA MISMO para congelar el snapshot (nombre, precio
 * original, specs), y SIEMPRE recalcula subtotal/descuento/total desde
 * cero con money.ts, ignorando cualquier total que mandara el cliente
 * (punto 22 del pedido). El producto se relee UNA SOLA VEZ, en este
 * momento — nunca después (punto 7/12/13: snapshot inmutable).
 */
import type { ProductsRepository } from "../repositories/products.repository";
import type { NewSaleItemRow, NewSaleRow, SalesRepository } from "../repositories/sales.repository";
import type { Product } from "../../types/product";
import type { SaleItemSpecsSnapshot } from "../../types/sale";
import { RepositoryError } from "../repositories/errors";
import { computeItemSubtotalCop, computeSaleTotalsCop } from "./money";
import { createSaleSchema, formatZodIssues } from "./validation";
import { toAdminSaleDetailDTO } from "./dto";
import type { AdminResult, AdminSaleDetailDTO } from "./types";

export interface CreateSaleDeps {
  salesRepo: SalesRepository;
  productsRepo: ProductsRepository;
}

function buildProductSpecsSnapshot(product: Product): SaleItemSpecsSnapshot {
  return {
    brand: product.brand || undefined,
    model: product.model || undefined,
    cpu: product.cpu || undefined,
    ram: product.ram || undefined,
    storage: product.storage || undefined,
    screen: product.screen || undefined,
    condition: product.condition || undefined,
  };
}

function buildDefaultCatalogDescription(product: Product): string {
  const parts = [product.cpu, product.ram ? `${product.ram} GB RAM` : null, product.storage].filter(
    (v): v is string => Boolean(v)
  );
  return parts.length > 0 ? parts.join(" / ") : product.title;
}

/** SQLSTATE 23505 = unique_violation — el único caso tolerado de "leer luego escribir" en este módulo (ver plan §6). */
function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof RepositoryError)) return false;
  const cause = err.cause as { code?: string } | undefined;
  return cause?.code === "23505";
}

type ParsedCreateSaleInput = ReturnType<(typeof createSaleSchema)["parse"]>;
type ParsedSaleItemInput = ParsedCreateSaleInput["items"][number];

async function resolveItemRows(
  items: ParsedSaleItemInput[],
  productsRepo: ProductsRepository
): Promise<{ ok: true; rows: NewSaleItemRow[] } | { ok: false; issues: string[] }> {
  const catalogProductIds = items
    .filter((item): item is Extract<ParsedSaleItemInput, { itemType: "catalog" }> => item.itemType === "catalog")
    .map((item) => item.productId);

  const products =
    catalogProductIds.length > 0 ? await productsRepo.findManyByIds(catalogProductIds) : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  const rows: NewSaleItemRow[] = [];
  const issues: string[] = [];

  items.forEach((item, index) => {
    if (item.itemType === "catalog") {
      const product = productById.get(item.productId);
      if (!product) {
        issues.push(`items.${index}: el producto seleccionado ya no existe en el catálogo.`);
        return;
      }
      rows.push({
        itemType: "catalog",
        productId: product.id,
        productName: product.title,
        productDescription: item.description?.trim() || buildDefaultCatalogDescription(product),
        productImage: product.images[0] ?? null,
        productSpecs: buildProductSpecsSnapshot(product),
        originalUnitPriceCop: Math.round(product.price),
        unitPriceCop: item.unitPriceCop,
        quantity: item.quantity,
        subtotalCop: computeItemSubtotalCop(item.unitPriceCop, item.quantity),
        sortOrder: index,
      });
      return;
    }

    rows.push({
      itemType: "manual",
      productId: null,
      productName: item.description,
      productDescription: null,
      productImage: null,
      productSpecs: null,
      originalUnitPriceCop: null,
      unitPriceCop: item.unitPriceCop,
      quantity: item.quantity,
      subtotalCop: computeItemSubtotalCop(item.unitPriceCop, item.quantity),
      sortOrder: index,
    });
  });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, rows };
}

export async function createSaleAdmin(
  rawInput: unknown,
  userId: string,
  deps: CreateSaleDeps
): Promise<AdminResult<AdminSaleDetailDTO>> {
  const parsed = createSaleSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "VALIDATION_ERROR", issues: formatZodIssues(parsed.error) };
  }
  const input = parsed.data;

  const existing = await deps.salesRepo.findByIdempotencyKey(input.idempotencyKey);
  if (existing) {
    return { ok: true, data: toAdminSaleDetailDTO(existing) };
  }

  const resolved = await resolveItemRows(input.items, deps.productsRepo);
  if (!resolved.ok) {
    return { ok: false, error: "VALIDATION_ERROR", issues: resolved.issues };
  }

  const totals = computeSaleTotalsCop(
    resolved.rows.map((r) => ({ unitPriceCop: r.unitPriceCop, quantity: r.quantity })),
    input.discountCop
  );

  const saleRow: NewSaleRow = {
    customerName: input.customerName,
    customerDocument: input.customerDocument,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail ?? null,
    subtotalCop: totals.subtotalCop,
    discountCop: totals.discountCop,
    totalCop: totals.totalCop,
    paymentMethod: input.paymentMethod,
    paymentStatus: input.paymentStatus,
    warrantyMonths: input.warrantyMonths,
    notes: input.notes ?? null,
    idempotencyKey: input.idempotencyKey,
    createdBy: userId,
  };

  try {
    const created = await deps.salesRepo.createWithItems(saleRow, resolved.rows);
    return { ok: true, data: toAdminSaleDetailDTO(created) };
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Carrera de milisegundos entre el findByIdempotencyKey de arriba y este insert
      // (doble clic casi simultáneo). La garantía real es la constraint UNIQUE de la
      // base de datos, no la lectura previa — aquí solo se relee el resultado ya creado.
      const raced = await deps.salesRepo.findByIdempotencyKey(input.idempotencyKey);
      if (raced) return { ok: true, data: toAdminSaleDetailDTO(raced) };
    }
    throw err;
  }
}
