/**
 * Fase 1C/1E: creación de venta por computador físico.
 * El servidor valida producto + unidad y PostgreSQL vuelve a validar/lockear
 * dentro de erp_create_sale_with_units; la base es la autoridad final ante
 * concurrencia. Desde 1E una unidad reservada también puede consumirse en la
 * venta real sin liberarla en una transacción previa.
 */
import type { ProductsRepository } from "../repositories/products.repository";
import type { ProductUnitsRepository } from "../repositories/productUnits.repository";
import type { CustomersRepository } from "../repositories/customers.repository";
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
  productUnitsRepo: ProductUnitsRepository;
  customersRepo: CustomersRepository;
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

function repositoryCause(err: unknown): { code?: string; message?: string; details?: string } | undefined {
  if (!(err instanceof RepositoryError)) return undefined;
  return err.cause as { code?: string; message?: string; details?: string } | undefined;
}

function isUniqueViolation(err: unknown): boolean {
  return repositoryCause(err)?.code === "23505";
}

function isUnitAvailabilityError(err: unknown): boolean {
  const cause = repositoryCause(err);
  const text = `${cause?.message ?? ""} ${cause?.details ?? ""}`;
  return /unit_not_available|unit_product_mismatch|unit_not_found|uq_sale_items_product_unit_once/i.test(text);
}

type ParsedCreateSaleInput = ReturnType<(typeof createSaleSchema)["parse"]>;
type ParsedSaleItemInput = ParsedCreateSaleInput["items"][number];

async function resolveItemRows(
  items: ParsedSaleItemInput[],
  productsRepo: ProductsRepository,
  productUnitsRepo: ProductUnitsRepository
): Promise<{ ok: true; rows: NewSaleItemRow[] } | { ok: false; issues: string[] }> {
  const catalogProductIds = items
    .filter((item): item is Extract<ParsedSaleItemInput, { itemType: "catalog" }> => item.itemType === "catalog")
    .map((item) => item.productId);

  const products = catalogProductIds.length > 0 ? await productsRepo.findManyByIds(catalogProductIds) : [];
  const productById = new Map(products.map((p) => [p.id, p]));
  const rows: NewSaleItemRow[] = [];
  const issues: string[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.itemType === "catalog") {
      const product = productById.get(item.productId);
      if (!product) {
        issues.push(`items.${index}: el producto seleccionado ya no existe en el catálogo.`);
        continue;
      }

      const unit = await productUnitsRepo.findById(item.productUnitId);
      if (!unit) {
        issues.push(`items.${index}: la unidad física seleccionada ya no existe.`);
        continue;
      }
      if (unit.productId !== product.id) {
        issues.push(`items.${index}: la unidad seleccionada no pertenece a ese producto.`);
        continue;
      }
      if (unit.status !== "available" && unit.status !== "reserved") {
        issues.push(`items.${index}: ${unit.unitCode} ya no está disponible ni reservada para venta.`);
        continue;
      }

      rows.push({
        itemType: "catalog",
        productId: product.id,
        productUnitId: unit.id,
        productName: product.title,
        productDescription: item.description?.trim() || buildDefaultCatalogDescription(product),
        productImage: product.images[0] ?? null,
        productSpecs: buildProductSpecsSnapshot(product),
        originalUnitPriceCop: Math.round(product.price),
        unitPriceCop: item.unitPriceCop,
        quantity: 1,
        subtotalCop: computeItemSubtotalCop(item.unitPriceCop, 1),
        sortOrder: index,
      });
      continue;
    }

    rows.push({
      itemType: "manual",
      productId: null,
      productUnitId: null,
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
  }

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
  if (existing) return { ok: true, data: toAdminSaleDetailDTO(existing) };

  const resolved = await resolveItemRows(input.items, deps.productsRepo, deps.productUnitsRepo);
  if (!resolved.ok) return { ok: false, error: "VALIDATION_ERROR", issues: resolved.issues };

  const totals = computeSaleTotalsCop(
    resolved.rows.map((r) => ({ unitPriceCop: r.unitPriceCop, quantity: r.quantity })),
    input.discountCop
  );

  const existingCustomer = await deps.customersRepo.findByDocument(input.customerDocument);
  const linkableCustomerId = existingCustomer?.documentNumber && existingCustomer.phone ? existingCustomer.id : null;

  const saleRow: NewSaleRow = {
    customerId: linkableCustomerId,
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
    const created = await deps.salesRepo.createWithUnits(saleRow, resolved.rows);
    return { ok: true, data: toAdminSaleDetailDTO(created) };
  } catch (err) {
    if (isUnitAvailabilityError(err)) {
      return {
        ok: false,
        error: "VALIDATION_ERROR",
        issues: ["Una de las unidades seleccionadas ya no está disponible o reservada para esta venta. Actualiza la selección antes de confirmar."],
      };
    }
    if (isUniqueViolation(err)) {
      const raced = await deps.salesRepo.findByIdempotencyKey(input.idempotencyKey);
      if (raced) return { ok: true, data: toAdminSaleDetailDTO(raced) };
      return {
        ok: false,
        error: "VALIDATION_ERROR",
        issues: ["Una de las unidades seleccionadas ya fue asociada a otra venta."],
      };
    }
    throw err;
  }
}
