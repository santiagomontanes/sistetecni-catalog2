import type { ProductUnitStatus } from "@/types/erp";

export interface AdminCustomerDTO {
  id: string;
  fullName: string;
  documentType: string | null;
  documentNumber: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  createdAt: string | null;
}

export interface AdminInventoryUnitDTO {
  id: string;
  unitCode: string;
  serialNumber: string | null;
  status: ProductUnitStatus;
  productId: string;
  productTitle: string;
  productBrand: string;
  productModel: string;
  webStock: number;
  erpStockEnabled: boolean;
  erpStockSyncedAt: string | null;
  acquisitionCostCop: number | null;
  batteryHealthPercent: number | null;
  storageHealthPercent: number | null;
  specOverrides: Record<string, unknown>;
  notes: string | null;
  receivedAt: string | null;
  soldAt: string | null;
  reservedAt: string | null;
  reservationExpiresAt: string | null;
  reservationCustomerName: string | null;
  reservationCustomerPhone: string | null;
  reservationNote: string | null;
}

export interface AdminProductOptionDTO {
  id: string;
  title: string;
  brand: string;
  model: string;
  cpu: string;
  ram: number;
  storage: string;
  stock: number;
  visibleWeb: boolean;
  erpStockEnabled: boolean;
}

export interface CreateCustomerAdminPayload {
  fullName: string;
  documentType?: string;
  documentNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  notes?: string;
}

export interface ReceiveProductUnitAdminPayload {
  productId: string;
  serialNumber?: string;
  acquisitionCostCop?: number | string | null;
  batteryHealthPercent?: number | string | null;
  storageHealthPercent?: number | string | null;
  ramGb?: number | string | null;
  storageGb?: number | string | null;
  storageType?: string;
  conditionNotes?: string;
  notes?: string;
}
