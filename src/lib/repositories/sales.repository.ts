import type { SupabaseClient } from "@supabase/supabase-js";
import type { Sale, SaleItem, SaleItemSpecsSnapshot, SaleItemType, ListSalesFilter } from "../../types/sale";
import { RepositoryError } from "./errors";

export interface NewSaleRow {
  customerId?: string | null;
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
  productUnitId?: string | null;
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
  /** Fase 1C: venta + unidades + movimientos + auditoría en una transacción PostgreSQL. */
  createWithUnits(sale: NewSaleRow, items: NewSaleItemRow[]): Promise<SaleWithItemsResult>;
  /** Camino legado conservado para pruebas/migración de ventas antiguas; la UI 1C no lo usa. */
  createWithItems(sale: NewSaleRow, items: NewSaleItemRow[]): Promise<SaleWithItemsResult>;
  findById(id: string): Promise<SaleWithItemsResult | null>;
  findByIdempotencyKey(key: string): Promise<SaleWithItemsResult | null>;
  list(filter: ListSalesFilter): Promise<{ items: Sale[]; total: number }>;
}

const SALE_COLUMNS =
  "id,sale_number,customer_id,customer_name,customer_document,customer_phone,customer_email," +
  "subtotal_cop,discount_cop,total_cop,payment_method,payment_status,warranty_months," +
  "notes,dian_status,idempotency_key,created_by,created_at";

const SALE_WITH_ITEMS_COLUMNS = `${SALE_COLUMNS},sale_items(*)`;

interface SaleRow {
  id: string;
  sale_number: string;
  customer_id: string | null;
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
  product_unit_id: string | null;
  unit_code_snapshot: string | null;
  serial_number_snapshot: string | null;
  unit_spec_overrides_snapshot: Record<string, unknown> | null;
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
    customerId: row.customer_id,
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
    productUnitId: row.product_unit_id,
    unitCodeSnapshot: row.unit_code_snapshot,
    serialNumberSnapshot: row.serial_number_snapshot,
    unitSpecOverridesSnapshot: row.unit_spec_overrides_snapshot,
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
  const items = (row.sale_items ?? []).map(mapSaleItemRow).sort((a, b) => a.sortOrder - b.sortOrder);
  return { ...mapSaleRow(row), items };
}

function toSaleInsertPayload(sale: NewSaleRow): Record<string, unknown> {
  return {
    customer_id: sale.customerId ?? null,
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
    product_unit_id: item.productUnitId ?? null,
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

function toRpcItems(items: NewSaleItemRow[]): Array<Record<string, unknown>> {
  return items.map((item) =>
    item.itemType === "catalog"
      ? {
          itemType: "catalog",
          productId: item.productId,
          productUnitId: item.productUnitId,
          description: item.productDescription,
          unitPriceCop: item.unitPriceCop,
          quantity: 1,
        }
      : {
          itemType: "manual",
          description: item.productName,
          unitPriceCop: item.unitPriceCop,
          quantity: item.quantity,
        }
  );
}

export function createSalesRepository(client: SupabaseClient): SalesRepository {
  return {
    async createWithUnits(sale, items) {
      const { data, error } = await client.rpc("erp_create_sale_with_units", {
        p_customer_id: sale.customerId ?? null,
        p_customer_name: sale.customerName,
        p_customer_document: sale.customerDocument,
        p_customer_phone: sale.customerPhone,
        p_customer_email: sale.customerEmail,
        p_items: toRpcItems(items),
        p_discount_cop: sale.discountCop,
        p_payment_method: sale.paymentMethod,
        p_payment_status: sale.paymentStatus,
        p_warranty_months: sale.warrantyMonths,
        p_notes: sale.notes,
        p_idempotency_key: sale.idempotencyKey,
      });

      const saleId = typeof data === "string" ? data : null;
      if (error || !saleId) {
        throw new RepositoryError("SalesRepository.createWithUnits: RPC erp_create_sale_with_units falló", error);
      }

      const created = await this.findById(saleId);
      if (!created) {
        throw new RepositoryError("SalesRepository.createWithUnits: no se pudo releer la venta recién creada");
      }
      return created;
    },

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

      if (error) throw new RepositoryError(`SalesRepository.findById(${id}) falló`, error);
      return data ? mapSaleWithItemsRow(data) : null;
    },

    async findByIdempotencyKey(key) {
      const { data, error } = await client
        .from("sales")
        .select(SALE_WITH_ITEMS_COLUMNS)
        .eq("idempotency_key", key)
        .maybeSingle<SaleRowWithItems>();

      if (error) throw new RepositoryError(`SalesRepository.findByIdempotencyKey(${key}) falló`, error);
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
      if (error) throw new RepositoryError("SalesRepository.list falló", error);
      return { items: (data ?? []).map(mapSaleRow), total: count ?? 0 };
    },
  };
}
