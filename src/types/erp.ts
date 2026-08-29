export type CustomerDocumentType = string;

export interface Customer {
  id: string;
  fullName: string;
  documentType: CustomerDocumentType | null;
  documentNumber: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  active: boolean;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateCustomerInput {
  fullName: string;
  documentType?: string | null;
  documentNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

export type ProductUnitStatus =
  | "received"
  | "inspection"
  | "available"
  | "reserved"
  | "sold"
  | "warranty"
  | "repair"
  | "returned"
  | "retired";

export const PRODUCT_UNIT_STATUSES: readonly ProductUnitStatus[] = [
  "received",
  "inspection",
  "available",
  "reserved",
  "sold",
  "warranty",
  "repair",
  "returned",
  "retired",
];

export interface ProductUnit {
  id: string;
  productId: string;
  unitCode: string;
  serialNumber: string | null;
  status: ProductUnitStatus;
  acquisitionCostCop: number | null;
  batteryHealthPercent: number | null;
  storageHealthPercent: number | null;
  specOverrides: Record<string, unknown>;
  images: string[];
  notes: string | null;
  receivedAt: Date | null;
  soldAt: Date | null;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateProductUnitInput {
  productId: string;
  unitCode: string;
  serialNumber?: string | null;
  acquisitionCostCop?: number | null;
  batteryHealthPercent?: number | null;
  storageHealthPercent?: number | null;
  specOverrides?: Record<string, unknown>;
  images?: string[];
  notes?: string | null;
  createdBy?: string | null;
}

export type InventoryMovementType =
  | "receipt"
  | "inspection"
  | "available"
  | "reserve"
  | "release_reservation"
  | "sale"
  | "return"
  | "warranty_in"
  | "warranty_out"
  | "repair_in"
  | "repair_out"
  | "adjustment"
  | "retire";

export type ErpActorType = "web_admin" | "whatsapp_admin" | "system" | "migration";
export type ErpChannel = "web" | "whatsapp" | "api" | "system" | "migration";

export interface InventoryMovement {
  id: string;
  unitId: string;
  productId: string;
  movementType: InventoryMovementType;
  fromStatus: ProductUnitStatus | null;
  toStatus: ProductUnitStatus | null;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  source: ErpActorType;
  actorRef: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: Date | null;
}

export interface AuditEvent {
  id: string;
  actorType: ErpActorType;
  actorRef: string | null;
  channel: ErpChannel;
  operation: string;
  entityType: string;
  entityId: string | null;
  requestId: string | null;
  confirmationId: string | null;
  beforeSnapshot: Record<string, unknown> | null;
  afterSnapshot: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: Date | null;
}
