export type AfterSalesCaseType = "warranty" | "return";
export type AfterSalesCaseStatus = "open" | "diagnosing" | "repair" | "waiting_customer" | "closed" | "cancelled";
export type AfterSalesCoverageStatus = "in_warranty" | "out_of_warranty" | "not_applicable";
export type AfterSalesResolutionType = "repaired_returned" | "no_fault_found" | "return_rejected" | "retired" | "other";
export type AfterSalesCaseAction = "start_diagnosis" | "send_repair" | "waiting_customer" | "close_returned" | "close_retired" | "cancel";

export interface AdminAfterSalesCaseListItemDTO {
  id: string;
  caseNumber: string;
  caseType: AfterSalesCaseType;
  status: AfterSalesCaseStatus;
  coverageStatus: AfterSalesCoverageStatus;
  customerName: string;
  customerPhone: string;
  productName: string;
  unitCode: string;
  serialNumber: string | null;
  reportedIssue: string;
  openedAt: string;
  updatedAt: string;
}

export interface AdminAfterSalesCaseEventDTO {
  id: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  costCop: number | null;
  createdAt: string;
}

export interface AdminAfterSalesCaseDetailDTO extends AdminAfterSalesCaseListItemDTO {
  saleId: string;
  saleItemId: string;
  productUnitId: string;
  customerId: string | null;
  saleNumber: string;
  customerDocument: string;
  intakeCondition: string | null;
  evidenceUrls: string[];
  diagnosis: string | null;
  resolution: string | null;
  resolutionType: AfterSalesResolutionType | null;
  estimatedCostCop: number | null;
  finalCostCop: number | null;
  warrantyExpiresAt: string | null;
  closedAt: string | null;
  unitStatus: string;
  events: AdminAfterSalesCaseEventDTO[];
}

export interface AdminAfterSalesOriginDTO {
  saleItemId: string;
  saleId: string;
  saleNumber: string;
  saleCreatedAt: string;
  warrantyMonths: number;
  warrantyExpiresAt: string | null;
  customerName: string;
  customerDocument: string;
  customerPhone: string;
  productUnitId: string;
  productName: string;
  unitCode: string;
  serialNumber: string | null;
  unitStatus: string;
  hasOpenCase: boolean;
}
