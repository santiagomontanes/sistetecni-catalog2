import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditEvent, ErpActorType, ErpChannel } from "../../types/erp";
import { RepositoryError } from "./errors";

export interface AppendAuditEventInput {
  actorType: ErpActorType;
  actorRef?: string | null;
  channel: ErpChannel;
  operation: string;
  entityType: string;
  entityId?: string | null;
  requestId?: string | null;
  confirmationId?: string | null;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface AuditEventsRepository {
  append(input: AppendAuditEventInput): Promise<AuditEvent>;
  listByEntity(entityType: string, entityId: string, limit?: number): Promise<AuditEvent[]>;
}

const AUDIT_COLUMNS =
  "id,actor_type,actor_ref,channel,operation,entity_type,entity_id,request_id,confirmation_id," +
  "before_snapshot,after_snapshot,metadata,created_at";

interface AuditRow {
  id: string;
  actor_type: ErpActorType;
  actor_ref: string | null;
  channel: ErpChannel;
  operation: string;
  entity_type: string;
  entity_id: string | null;
  request_id: string | null;
  confirmation_id: string | null;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
}

function cleanOptional(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapRow(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    actorType: row.actor_type,
    actorRef: row.actor_ref,
    channel: row.channel,
    operation: row.operation,
    entityType: row.entity_type,
    entityId: row.entity_id,
    requestId: row.request_id,
    confirmationId: row.confirmation_id,
    beforeSnapshot: row.before_snapshot,
    afterSnapshot: row.after_snapshot,
    metadata: row.metadata ?? {},
    createdAt: row.created_at ? new Date(row.created_at) : null,
  };
}

export function createAuditEventsRepository(client: SupabaseClient): AuditEventsRepository {
  return {
    async append(input) {
      const operation = input.operation.trim();
      const entityType = input.entityType.trim();
      if (!operation) throw new RepositoryError("AuditEventsRepository.append: operation vacía");
      if (!entityType) throw new RepositoryError("AuditEventsRepository.append: entityType vacío");

      const payload = {
        actor_type: input.actorType,
        actor_ref: cleanOptional(input.actorRef),
        channel: input.channel,
        operation,
        entity_type: entityType,
        entity_id: input.entityId ?? null,
        request_id: cleanOptional(input.requestId),
        confirmation_id: cleanOptional(input.confirmationId),
        before_snapshot: input.beforeSnapshot ?? null,
        after_snapshot: input.afterSnapshot ?? null,
        metadata: input.metadata ?? {},
      };

      const { data, error } = await client
        .from("audit_events")
        .insert(payload)
        .select(AUDIT_COLUMNS)
        .single<AuditRow>();

      if (error || !data) {
        throw new RepositoryError("AuditEventsRepository.append falló", error);
      }
      return mapRow(data);
    },

    async listByEntity(entityType, entityId, limit = 100) {
      const { data, error } = await client
        .from("audit_events")
        .select(AUDIT_COLUMNS)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(limit)
        .returns<AuditRow[]>();

      if (error) {
        throw new RepositoryError(
          `AuditEventsRepository.listByEntity(${entityType}, ${entityId}) falló`,
          error
        );
      }
      return (data ?? []).map(mapRow);
    },
  };
}
