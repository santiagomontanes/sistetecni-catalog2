import type { AdminResult } from "../personalizadorAdmin/types";
import type { PaymentMethod, PaymentStatus, SaleItemType, SaleItemSpecsSnapshot } from "../../types/sale";

export type { AdminResult };

export interface AdminSaleListItemDTO {
  id: string;
  saleNumber: string;
  createdAt: string | null;
  customerName: string;
  customerPhoneMasked: string;
  totalCop: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
}

export interface AdminSaleItemDTO {
  id: string;
  itemType: SaleItemType;
  productId: string | null;
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
}

export interface AdminSaleDetailDTO {
  id: string;
  saleNumber: string;
  createdAt: string | null;
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
  items: AdminSaleItemDTO[];
}

export interface AdminSaleListResultDTO { items: AdminSaleListItemDTO[]; total: number; }

export interface AdminProductSearchItemDTO {
  id: string;
  title: string;
  brand: string;
  model: string;
  price: number;
  image: string | null;
  description: string;
  stock: number;
}

export interface AdminAvailableUnitDTO {
  id: string;
  productId: string;
  unitCode: string;
  serialNumber: string | null;
  batteryHealthPercent: number | null;
  storageHealthPercent: number | null;
  specOverrides: Record<string, unknown>;
}
