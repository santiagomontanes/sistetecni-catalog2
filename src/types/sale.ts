// Corresponde al esquema de ventas + ERP Fase 1C.

export type PaymentMethod = "efectivo" | "transferencia" | "nequi" | "daviplata" | "tarjeta" | "otro";
export const PAYMENT_METHODS: readonly PaymentMethod[] = ["efectivo", "transferencia", "nequi", "daviplata", "tarjeta", "otro"];
export type PaymentStatus = "pagado" | "pendiente" | "parcial";
export const PAYMENT_STATUSES: readonly PaymentStatus[] = ["pagado", "pendiente", "parcial"];
export type SaleItemType = "catalog" | "manual";
export type DianStatus = "no_aplica" | "pendiente_integracion";

export interface SaleItemSpecsSnapshot {
  brand?: string;
  model?: string;
  cpu?: string;
  ram?: number;
  storage?: string;
  screen?: string;
  condition?: string;
}

export interface SaleItem {
  id: string;
  saleId: string;
  itemType: SaleItemType;
  productId: string | null;
  /** Nuevos en 1C; opcionales a nivel TS para fixtures/ventas históricas pre-ERP. */
  productUnitId?: string | null;
  unitCodeSnapshot?: string | null;
  serialNumberSnapshot?: string | null;
  unitSpecOverridesSnapshot?: Record<string, unknown> | null;
  productName: string;
  productDescription: string | null;
  productImage: string | null;
  productSpecs: SaleItemSpecsSnapshot | null;
  originalUnitPriceCop: number | null;
  unitPriceCop: number;
  quantity: number;
  subtotalCop: number;
  sortOrder: number;
  createdAt: Date | null;
}

export interface Sale {
  id: string;
  saleNumber: string;
  /** Nuevo en 1C; opcional en TS para objetos históricos/tests. */
  customerId?: string | null;
  customerName: string;
  customerDocument: string;
  customerPhone: string;
  customerEmail: string | null;
  subtotalCop: number;
  discountCop: number;
  totalCop: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  warrantyMonths: number;
  notes: string | null;
  dianStatus: DianStatus;
  idempotencyKey: string | null;
  createdBy: string | null;
  createdAt: Date | null;
}

export interface SaleWithItems extends Sale { items: SaleItem[]; }

export type CreateSaleItemInput =
  | {
      itemType: "catalog";
      productId: string;
      productUnitId: string;
      description?: string;
      unitPriceCop: number;
      quantity: 1;
    }
  | {
      itemType: "manual";
      description: string;
      unitPriceCop: number;
      quantity: number;
    };

export interface CreateSaleInput {
  customerName: string;
  customerDocument: string;
  customerPhone: string;
  customerEmail?: string | null;
  items: CreateSaleItemInput[];
  discountCop: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  warrantyMonths: number;
  notes?: string | null;
  idempotencyKey: string;
}

export interface ListSalesFilter {
  search?: string;
  offset?: number;
  pageSize?: number;
}
