export interface WorkshopUnit {
  id: string; unit_code: string; product_id: string | null; serial_number: string | null;
  asset_kind: "computer" | "ram" | "storage" | "charger"; installed_in_unit_id: string | null;
  workshop_phase: string | null; preliminary_condition: string | null; location_id: string | null;
  row_version: number; component_condition: string | null; component_attributes: Record<string, unknown>;
  spec_overrides: Record<string, unknown>; status: string; acquisition_cost_cop: number | null;
}
export interface WorkshopLocation { id: string; code: string; name: string; active: boolean; parent_id: string | null }
export interface WorkshopData {
  enabled: boolean; unit: WorkshopUnit | null; units: WorkshopUnit[]; components: WorkshopUnit[];
  locations: WorkshopLocation[];
  definitions: { code: string; label: string; active: boolean; required: boolean }[];
  checks: { code: string; result: string; note: string | null; created_at: string }[];
  receipts: { id: string; snapshot: Record<string, unknown>; reason: string | null; correction_of: string | null; created_at: string }[];
  events: { id: string; event_type: string; reason: string | null; created_at: string; before_data: Record<string, unknown>; after_data: Record<string, unknown> }[];
  software: { id: string; name: string; edition: string | null; version: string | null; installed: boolean; tested: boolean; created_at: string }[];
  usb: { id: string; code: string; content: string; version: string | null; boot_modes: string[]; location_id: string | null; active: boolean }[];
  qr: { code: string; state: "free" | "assigned" | "void"; unit_id: string | null } | null;
}
export type WorkshopResult<T> = { ok: true; data: T } | { ok: false; error: string; message: string };
