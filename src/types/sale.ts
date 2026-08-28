// Corresponde al esquema de ventas + ERP Fase 1C.

export type PaymentMethod = "efectivo" | "transferencia" | "nequi" | "daviplata" | "tarjeta" | "otro";

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  "efectivo",
  "transferencia",
  "nequi",
  "daviplata",
  "tarjeta",
  "otro",
];

export type PaymentStatus = "pagado" | "pendiente" | "parcial";

export const PAYMENT_STATUSES: readonly PaymentStatus[] = ["pagado", "pendiente", "parcial"];

export type SaleItemType = "catalog" | "manual";

/** Reservado para una futura integración de facturación electrónica DIAN. */
export type DianStatus = "no_aplica" | "pendiente_integracion";

/** Snapshot de las características comerciales del producto al vender. */
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
  /** null si es ítem manual. */
  productId: string | null;
  /** Unidad física exacta entregada. Null en manuales y ventas históricas pre-ERP. */
  productUnitId: string | null;
  /** Snapshot legible de la unidad para trazabilidad histórica. */
  unitCodeSnapshot: string | null;
  serialNumberSnapshot: string | null;
  unitSpecOverridesSnapshot: Record<string, unknown> | null;
  productName: string;
  productDescription: string | null;
  productImage: string | null;
  productSpecs: SaleItemSpecsSnapshot | null;
  /** Precio de catálogo al momento de la venta. */
  originalUnitPriceCop: number | null;
  /** Precio realmente vendido. */
  unitPriceCop: number;
  quantity: number;
  subtotalCop: number;
  sortOrder: number;
  createdAt: Date | null;
}

export interface Sale {
  id: string;
  saleNumber: string;
  /** Cliente canónico opcional; el snapshot customer_* nunca depende de esta fila después. */
  customerId: string | null;
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

export interface SaleWithItems extends Sale {
  items: SaleItem[];
}

/** Ítem tal como lo arma el formulario; totales y snapshots se resuelven server-side. */
export type CreateSaleItemInput =
  | {
      itemType: "catalog";
      productId: string;
      /** Fase 1C: computador físico exacto; una unidad = una venta. */
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
