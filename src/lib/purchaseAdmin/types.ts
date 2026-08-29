export interface AdminSupplierDTO {
  id: string;
  name: string;
  documentType: string | null;
  documentNumber: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string | null;
}

export interface AdminPurchaseProductDTO {
  id: string;
  title: string;
  brand: string;
  model: string;
  cpu: string;
  ram: number;
  storage: string;
}

export interface AdminPurchaseListItemDTO {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  supplierName: string;
  supplierInvoiceReference: string | null;
  purchaseDate: string;
  status: "received";
  itemCount: number;
  merchandiseSubtotalCop: number;
  sharedCostsCop: number;
  totalCostCop: number;
  createdAt: string;
}

export interface AdminPurchaseItemDTO {
  id: string;
  productId: string;
  productUnitId: string;
  productName: string;
  unitCode: string;
  serialNumber: string | null;
  baseCostCop: number;
  allocatedExtraCostCop: number;
  landedCostCop: number;
  sortOrder: number;
  notes: string | null;
}

export interface AdminPurchaseDetailDTO extends AdminPurchaseListItemDTO {
  supplierDocument: string | null;
  supplierPhone: string | null;
  notes: string | null;
  items: AdminPurchaseItemDTO[];
}
