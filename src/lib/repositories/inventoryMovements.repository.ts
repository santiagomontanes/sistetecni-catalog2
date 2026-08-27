import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ErpActorType,
  InventoryMovement,
  InventoryMovementType,
  ProductUnitStatus,
} from "../../types/erp";
import { RepositoryError } from "./errors";

export interface AppendInventoryMovementInput {
  unitId: string;
  productId: string;
  movementType: InventoryMovementType;
  fromStatus?: ProductUnitStatus | null;
  toStatus?: ProductUnitStatus | null;
  referenceType?: string | null;
  referenceId?: string | null;
  reason?: string | null;
  source: ErpActorType;
  actorRef?: string | null;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
}

export interface InventoryMovementsRepository {
  append(input: AppendInventoryMovementInput): Promise<InventoryMovement>;
  listByUnit(unitId: string, limit?: number): Promise<InventoryMovement[]>;
}

const MOVEMENT_COLUMNS =
  "id,unit_id,product_id,movement_type,from_status,to_status,reference_type,reference_id," +
  "reason,source,actor_ref,metadata,created_by,created_at";

interface MovementRow {
  id: string;
  unit_id: string;
  product_id: string;
  movement_type: InventoryMovementType;
  from_status: ProductUnitStatus | null;
  to_status: ProductUnitStatus | null;
  reference_type: string | null;
  reference_id: string | null;
  reason: string | null;
  source: ErpActorType;
  actor_ref: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string | null;
}

function cleanOptional(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapRow(row: MovementRow): InventoryMovement {
  return {
    id: row.id,
    unitId: row.unit_id,
    productId: row.product_id,
    movementType: row.movement_type,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    reason: row.reason,
    source: row.source,
    actorRef: row.actor_ref,
    metadata: row.metadata ?? {},
    createdBy: row.created_by,
    createdAt: row.created_at ? new Date(row.created_at) : null,
  };
}

export function createInventoryMovementsRepository(
  client: SupabaseClient
): InventoryMovementsRepository {
  return {
    async append(input) {
      const payload = {
        unit_id: input.unitId,
        product_id: input.productId,
        movement_type: input.movementType,
        from_status: input.fromStatus ?? null,
        to_status: input.toStatus ?? null,
        reference_type: cleanOptional(input.referenceType),
        reference_id: input.referenceId ?? null,
        reason: cleanOptional(input.reason),
        source: input.source,
        actor_ref: cleanOptional(input.actorRef),
        metadata: input.metadata ?? {},
        created_by: input.createdBy ?? null,
      };

      const { data, error } = await client
        .from("inventory_movements")
        .insert(payload)
        .select(MOVEMENT_COLUMNS)
        .single<MovementRow>();

      if (error || !data) {
        throw new RepositoryError("InventoryMovementsRepository.append falló", error);
      }
      return mapRow(data);
    },

    async listByUnit(unitId, limit = 100) {
      const { data, error } = await client
        .from("inventory_movements")
        .select(MOVEMENT_COLUMNS)
        .eq("unit_id", unitId)
        .order("created_at", { ascending: false })
        .limit(limit)
        .returns<MovementRow[]>();

      if (error) {
        throw new RepositoryError(
          `InventoryMovementsRepository.listByUnit(${unitId}) falló`,
          error
        );
      }
      return (data ?? []).map(mapRow);
    },
  };
}
