import type { ProductUnitStatus } from "@/types/erp";

export type CostEntryKind = "cost" | "reversal";
export type CostCategory = "upgrade" | "repair" | "spare_part" | "labor" | "transport" | "after_sales" | "sale_fee" | "accessory" | "other";
export type ProfitabilityCostingStatus = "complete" | "missing_acquisition_cost" | "manual_items_review";

export interface AdminCostEntryDTO {
  id:string;
  costNumber:string;
  entryKind:CostEntryKind;
  category:CostCategory;
  productUnitId:string|null;
  saleId:string|null;
  description:string;
  amountCop:number;
  incurredAt:string;
  referenceType:string|null;
  referenceId:string|null;
  reversalOfId:string|null;
  createdAt:string;
  reversed:boolean;
}

export interface AdminProfitabilityUnitRefDTO { unitId:string; unitCode:string; serialNumber:string|null; }
export interface AdminProfitabilitySaleDTO {
  saleId:string;
  saleNumber:string;
  createdAt:string|null;
  customerName:string;
  revenueCop:number;
  acquisitionCostCop:number;
  unitExtraCostsCop:number;
  saleCostsCop:number;
  knownCostCop:number;
  knownProfitCop:number;
  marginPercent:number|null;
  physicalItemCount:number;
  manualItemCount:number;
  costingStatus:ProfitabilityCostingStatus;
  units:AdminProfitabilityUnitRefDTO[];
}

export interface AdminProfitabilitySummaryDTO {
  saleCount:number;
  completeSaleCount:number;
  reviewSaleCount:number;
  revenueCop:number;
  knownCostCop:number;
  knownProfitCop:number;
  completeRevenueCop:number;
  completeCostCop:number;
  completeProfitCop:number;
}

export interface AdminProfitabilityDashboardDTO { summary:AdminProfitabilitySummaryDTO; sales:AdminProfitabilitySaleDTO[]; }

export interface AdminUnitProfitabilityDTO {
  unitId:string;
  unitCode:string;
  serialNumber:string|null;
  status:ProductUnitStatus;
  productId:string;
  productName:string;
  acquisitionCostCop:number|null;
  purchaseId:string|null;
  purchaseNumber:string|null;
  supplierName:string|null;
  soldAt:string|null;
  saleId:string|null;
  saleNumber:string|null;
  saleItemId:string|null;
  saleGrossRevenueCop:number|null;
  allocatedDiscountCop:number;
  netRevenueCop:number|null;
  allocatedSaleCostsCop:number;
  preSaleExtraCostsCop:number;
  postSaleExtraCostsCop:number;
  totalUnitExtraCostsCop:number;
  totalKnownCostCop:number|null;
  currentProfitCop:number|null;
  marginPercent:number|null;
  costingStatus:"complete"|"unsold"|"missing_acquisition_cost";
  costEntries:AdminCostEntryDTO[];
}
