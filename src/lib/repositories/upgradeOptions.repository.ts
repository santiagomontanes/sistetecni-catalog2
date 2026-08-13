import type { SupabaseClient } from "@supabase/supabase-js";
import type { UpgradeOption, UpgradeCategory } from "../../types/upgrade";
import { RepositoryError } from "./errors";

/**
 * Fase 2B/B6 — no incluye `notes`: upgrade_options no tiene esa columna en
 * el esquema real (el pedido de B6 la mencionaba "si aplica" — no aplica
 * aquí). `note` SÍ existe, pero en product_upgrade_options (la relación de
 * compatibilidad, no la opción de upgrade en sí) — ver
 * productUpgradeOptions.repository.ts.
 */
export interface CreateUpgradeOptionInput {
  category: UpgradeCategory;
  label: string;
  /** Capacidad FINAL resultante (D1) — nunca un delta. */
  value: number;
  interface: string | null;
  /** Único campo que alimenta el cálculo de precio al cliente (B3). Entero COP. */
  extraCost: number;
  /** Informativo/interno — nunca se usa en el cálculo de precio al cliente. */
  componentCost: number | null;
  /** Informativo/interno — nunca se usa en el cálculo de precio al cliente. */
  installCost: number | null;
  active: boolean;
}

export type UpdateUpgradeOptionInput = Partial<CreateUpgradeOptionInput>;

export interface UpgradeOptionsRepository {
  findById(id: string): Promise<UpgradeOption | null>;
  /** Solo activas — category opcional para filtrar por 'ram' | 'storage'. */
  findActive(category?: UpgradeCategory): Promise<UpgradeOption[]>;
  /** Activas E inactivas — para el listado admin (B6), que debe poder reactivar. */
  findAll(): Promise<UpgradeOption[]>;
  create(input: CreateUpgradeOptionInput): Promise<UpgradeOption>;
  update(id: string, input: UpdateUpgradeOptionInput): Promise<UpgradeOption>;
  /** (D14) nunca DELETE físico desde el panel — solo active=true/false. */
  setActive(id: string, active: boolean): Promise<UpgradeOption>;
}

const SELECT_COLUMNS =
  "id,category,label,value,interface,extra_cost,component_cost,install_cost,active,created_at";

interface UpgradeOptionRow {
  id: string;
  category: string;
  label: string;
  value: number;
  interface: string | null;
  extra_cost: number;
  component_cost: number | null;
  install_cost: number | null;
  active: boolean;
  created_at: string | null;
}

function mapRow(row: UpgradeOptionRow): UpgradeOption {
  return {
    id: row.id,
    category: row.category as UpgradeCategory,
    label: row.label,
    value: row.value,
    interface: row.interface,
    extraCost: row.extra_cost,
    componentCost: row.component_cost,
    installCost: row.install_cost,
    active: row.active,
    createdAt: row.created_at ? new Date(row.created_at) : null,
  };
}

export function createUpgradeOptionsRepository(client: SupabaseClient): UpgradeOptionsRepository {
  return {
    async findById(id) {
      const { data, error } = await client
        .from("upgrade_options")
        .select(SELECT_COLUMNS)
        .eq("id", id)
        .maybeSingle<UpgradeOptionRow>();

      if (error) {
        throw new RepositoryError(`UpgradeOptionsRepository.findById(${id}) falló`, error);
      }
      return data ? mapRow(data) : null;
    },

    async findActive(category) {
      let query = client.from("upgrade_options").select(SELECT_COLUMNS).eq("active", true);
      if (category) query = query.eq("category", category);

      const { data, error } = await query.returns<UpgradeOptionRow[]>();

      if (error) {
        throw new RepositoryError("UpgradeOptionsRepository.findActive falló", error);
      }
      return (data ?? []).map(mapRow);
    },

    async findAll() {
      const { data, error } = await client
        .from("upgrade_options")
        .select(SELECT_COLUMNS)
        .order("category", { ascending: true })
        .order("value", { ascending: true })
        .returns<UpgradeOptionRow[]>();

      if (error) {
        throw new RepositoryError("UpgradeOptionsRepository.findAll falló", error);
      }
      return (data ?? []).map(mapRow);
    },

    async create(input) {
      const { data, error } = await client
        .from("upgrade_options")
        .insert({
          category: input.category,
          label: input.label,
          value: input.value,
          interface: input.interface,
          extra_cost: input.extraCost,
          component_cost: input.componentCost,
          install_cost: input.installCost,
          active: input.active,
        })
        .select(SELECT_COLUMNS)
        .single<UpgradeOptionRow>();

      if (error) {
        throw new RepositoryError("UpgradeOptionsRepository.create falló", error);
      }
      return mapRow(data);
    },

    async update(id, input) {
      const payload: Record<string, unknown> = {};
      if (input.category !== undefined) payload.category = input.category;
      if (input.label !== undefined) payload.label = input.label;
      if (input.value !== undefined) payload.value = input.value;
      if (input.interface !== undefined) payload.interface = input.interface;
      if (input.extraCost !== undefined) payload.extra_cost = input.extraCost;
      if (input.componentCost !== undefined) payload.component_cost = input.componentCost;
      if (input.installCost !== undefined) payload.install_cost = input.installCost;
      if (input.active !== undefined) payload.active = input.active;

      const { data, error } = await client
        .from("upgrade_options")
        .update(payload)
        .eq("id", id)
        .select(SELECT_COLUMNS)
        .single<UpgradeOptionRow>();

      if (error) {
        throw new RepositoryError(`UpgradeOptionsRepository.update(${id}) falló`, error);
      }
      return mapRow(data);
    },

    async setActive(id, active) {
      const { data, error } = await client
        .from("upgrade_options")
        .update({ active })
        .eq("id", id)
        .select(SELECT_COLUMNS)
        .single<UpgradeOptionRow>();

      if (error) {
        throw new RepositoryError(`UpgradeOptionsRepository.setActive(${id}) falló`, error);
      }
      return mapRow(data);
    },
  };
}
