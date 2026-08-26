import type { SupabaseClient } from "@supabase/supabase-js";
import type { Sale, SaleItem, SaleItemSpecsSnapshot, SaleItemType, ListSalesFilter } from "../../types/sale";
import { RepositoryError } from "./errors";

/**
 * Requiere un cliente AUTENTICADO con is_admin=true — sales/sale_items no
 * tienen ninguna policy de lectura pública (ver
 * supabase/migrations/20260826000000_ventas_comprobantes.sql). Mismo
 * criterio que QuoteRequestsRepository: se usa el cliente scoped que
 * requireAdmin() devuelve, nunca service_role.
 */
export interface NewSaleRow {
  customerName: string;
  customerDocument: string;
  customerPhone: string;
  customerEmail: string | null;
  subtotalCop: number;
  discountCop: number;
  totalCop: number;
  paymentMethod: string;
  paymentStatus: string;
  warrantyMonths: number;
  notes: string | null;
  idempotencyKey: string;
  createdBy: string | null;
}

export interface NewSaleItemRow {
  itemType: SaleItemType;
  productId: string | null;
  productName: string;
  productDescription: string | null;
  productImage: string | null;
  productSpecs: SaleItemSpecsSnapshot | null;
  originalUnitPriceCop: number | null;
  unitPriceCop: number;
  quantity: number;
  subtotalCop: number;
  sortOrder: number;
}

export interface SaleWithItemsResult extends Sale {
  items: SaleItem[];
}

export interface SalesRepository {
  /**
   * Inserta la venta y sus ítems. Si el insert de items falla después de
   * haber creado la venta, se elimina (compensa) esa fila de `sales` antes
   * de propagar el error — evita una cabecera de venta huérfana sin
   * ítems. Ver nota de diseño en el plan: no hay una función RPC
   * transaccional porque toda la validación (Zod + recálculo de totales)
   * ya ocurrió antes de llamar aquí, así que un fallo en este punto es un
   * evento de infraestructura raro, no una carrera de negocio.
   */
  createWithItems(sale: NewSaleRow, items: NewSaleItemRow[]): Promise<SaleWithItemsResult>;
  findById(id: string): Promise<SaleWithItemsResult | null>;
  findByIdempotencyKey(key: string): Promise<SaleWithItemsResult | null>;
  list(filter: ListSalesFilter): Promise<{ items: Sale[]; total: number }>;
}

const SALE_COLUMNS =
  "id,sale_number,customer_name,customer_document,customer_phone,customer_email," +
  "subtotal_cop,discount_cop,total_cop,payment_method,payment_status,warranty_months," +
  "notes,dian_status,idempotency_key,created_by,created_at";

const SALE_WITH_ITEMS_COLUMNS = `${SALE_COLUMNS},sale_items(*)`;

interface SaleRow {
  id: string;
  sale_number: string;
  customer_name: string;
  customer_document: string;
  customer_phone: string;
  customer_email: string | null;
  subtotal_cop: number;
  discount_cop: number;
  total_cop: number;
  payment_method: string;
  payment_status: string;
  warranty_months: number;
  notes: string | null;
  dian_status: string;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: string | null;
}

interface SaleItemRow {
  id: string;
  sale_id: string;
  item_type: string;
  product_id: string | null;
  product_name: string;
  product_description: string | null;
  product_image: string | null;
  product_specs: SaleItemSpecsSnapshot | null;
  original_unit_price_cop: number | null;
  unit_price_cop: number;
  quantity: number;
  subtotal_cop: number;
  sort_order: number;
  created_at: string | null;
}

interface SaleRowWithItems extends SaleRow {
  sale_items: SaleItemRow[] | null;
}

function mapSaleRow(row: SaleRow): Sale {
  return {
    id: row.id,
    saleNumber: row.sale_number,
    customerName: row.customer_name,
    customerDocument: row.customer_document,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    subtotalCop: Number(row.subtotal_cop),
    discountCop: Number(row.discount_cop),
    totalCop: Number(row.total_cop),
    paymentMethod: row.payment_method as Sale["paymentMethod"],
    paymentStatus: row.payment_status as Sale["paymentStatus"],
    warrantyMonths: row.warranty_months,
    notes: row.notes,
    dianStatus: row.dian_status as Sale["dianStatus"],
    idempotencyKey: row.idempotency_key,
    createdBy: row.created_by,
    createdAt: row.created_at ? new Date(row.created_at) : null,
  };
}

function mapSaleItemRow(row: SaleItemRow): SaleItem {
  return {
    id: row.id,
    saleId: row.sale_id,
    itemType: row.item_type as SaleItemType,
    productId: row.product_id,
    productName: row.product_name,
    productDescription: row.product_description,
    productImage: row.product_image,
    productSpecs: row.product_specs,
    originalUnitPriceCop: row.original_unit_price_cop === null ? null : Number(row.original_unit_price_cop),
    unitPriceCop: Number(row.unit_price_cop),
    quantity: row.quantity,
    subtotalCop: Number(row.subtotal_cop),
    sortOrder: row.sort_order,
    createdAt: row.created_at ? new Date(row.created_at) : null,
  };
}

function mapSaleWithItemsRow(row: SaleRowWithItems): SaleWithItemsResult {
  const items = (row.sale_items ?? [])
    .map(mapSaleItemRow)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return { ...mapSaleRow(row), items };
}

function toSaleInsertPayload(sale: NewSaleRow): Record<string, unknown> {
  return {
    customer_name: sale.customerName,
    customer_document: sale.customerDocument,
    customer_phone: sale.customerPhone,
    customer_email: sale.customerEmail,
    subtotal_cop: sale.subtotalCop,
    discount_cop: sale.discountCop,
    total_cop: sale.totalCop,
    payment_method: sale.paymentMethod,
    payment_status: sale.paymentStatus,
    warranty_months: sale.warrantyMonths,
    notes: sale.notes,
    idempotency_key: sale.idempotencyKey,
    created_by: sale.createdBy,
  };
}

function toSaleItemInsertPayload(saleId: string, item: NewSaleItemRow): Record<string, unknown> {
  return {
    sale_id: saleId,
    item_type: item.itemType,
    product_id: item.productId,
    product_name: item.productName,
    product_description: item.productDescription,
    product_image: item.productImage,
    product_specs: item.productSpecs,
    original_unit_price_cop: item.originalUnitPriceCop,
    unit_price_cop: item.unitPriceCop,
    quantity: item.quantity,
    subtotal_cop: item.subtotalCop,
    sort_order: item.sortOrder,
  };
}

export function createSalesRepository(client: SupabaseClient): SalesRepository {
  return {
    async createWithItems(sale, items) {
      const { data: createdSale, error: saleError } = await client
        .from("sales")
        .insert(toSaleInsertPayload(sale))
        .select(SALE_COLUMNS)
        .single<SaleRow>();

      if (saleError || !createdSale) {
        throw new RepositoryError("SalesRepository.createWithItems: insert de sales falló", saleError);
      }

      const { error: itemsError } = await client
        .from("sale_items")
        .insert(items.map((item) => toSaleItemInsertPayload(createdSale.id, item)));

      if (itemsError) {
        // Compensación: la venta sin ítems no debe quedar visible en el historial.
        await client.from("sales").delete().eq("id", createdSale.id);
        throw new RepositoryError("SalesRepository.createWithItems: insert de sale_items falló", itemsError);
      }

      const created = await this.findById(createdSale.id);
      if (!created) {
        throw new RepositoryError("SalesRepository.createWithItems: no se pudo releer la venta recién creada");
      }
      return created;
    },

    async findById(id) {
      const { data, error } = await client
        .from("sales")
        .select(SALE_WITH_ITEMS_COLUMNS)
        .eq("id", id)
        .maybeSingle<SaleRowWithItems>();

      if (error) {
        throw new RepositoryError(`SalesRepository.findById(${id}) falló`, error);
      }
      return data ? mapSaleWithItemsRow(data) : null;
    },

    async findByIdempotencyKey(key) {
      const { data, error } = await client
        .from("sales")
        .select(SALE_WITH_ITEMS_COLUMNS)
        .eq("idempotency_key", key)
        .maybeSingle<SaleRowWithItems>();

      if (error) {
        throw new RepositoryError(`SalesRepository.findByIdempotencyKey(${key}) falló`, error);
      }
      return data ? mapSaleWithItemsRow(data) : null;
    },

    async list(filter) {
      const pageSize = filter.pageSize ?? 20;
      const offset = filter.offset ?? 0;

      let query = client
        .from("sales")
        .select(SALE_COLUMNS, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (filter.search) {
        const escaped = filter.search.replace(/[%,()]/g, "");
        query = query.or(
          `sale_number.ilike.%${escaped}%,customer_name.ilike.%${escaped}%,` +
            `customer_document.ilike.%${escaped}%,customer_phone.ilike.%${escaped}%`
        );
      }

      const { data, error, count } = await query.returns<SaleRow[]>();

      if (error) {
        throw new RepositoryError("SalesRepository.list falló", error);
      }
      return { items: (data ?? []).map(mapSaleRow), total: count ?? 0 };
    },
  };
}
