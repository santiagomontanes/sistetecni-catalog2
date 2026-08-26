// Corresponde al esquema de supabase/migrations/20260826000000_ventas_comprobantes.sql

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

/**
 * Reservado para una futura integración de facturación electrónica DIAN —
 * sin lógica asociada todavía. "no_aplica" es el único valor que la app
 * escribe hoy; existe para no tener que rediseñar el esquema más adelante.
 */
export type DianStatus = "no_aplica" | "pendiente_integracion";

/** Snapshot de las características relevantes del producto en el momento de la venta. */
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
  /** null si es un ítem manual (producto todavía no publicado en el catálogo). */
  productId: string | null;
  productName: string;
  productDescription: string | null;
  productImage: string | null;
  productSpecs: SaleItemSpecsSnapshot | null;
  /** Precio del catálogo al momento de la venta; null si es manual. Nunca se recalcula después. */
  originalUnitPriceCop: number | null;
  /** Precio realmente vendido — puede diferir del original por negociación/descuento puntual del ítem. */
  unitPriceCop: number;
  quantity: number;
  subtotalCop: number;
  sortOrder: number;
  createdAt: Date | null;
}

export interface Sale {
  id: string;
  /** Generado atómicamente por la base de datos (trigger) — formato SV-2026-000001. Nunca lo envía la app. */
  saleNumber: string;
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

/** Ítem tal como lo arma el formulario — sin subtotal (se recalcula siempre server-side). */
export type CreateSaleItemInput =
  | {
      itemType: "catalog";
      productId: string;
      description?: string;
      unitPriceCop: number;
      quantity: number;
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
  /** Generado una vez en el cliente al abrir el formulario — evita ventas duplicadas por doble clic. */
  idempotencyKey: string;
}

export interface ListSalesFilter {
  /** Búsqueda unificada sobre sale_number/customer_name/customer_document/customer_phone. */
  search?: string;
  offset?: number;
  pageSize?: number;
}
