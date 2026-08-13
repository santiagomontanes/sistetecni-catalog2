import type { SupabaseClient } from "@supabase/supabase-js";
import type { UpgradeOption, UpgradeCategory } from "../../types/upgrade";
import { RepositoryError } from "./errors";

export interface UpgradeOptionsRepository {
  findById(id: string): Promise<UpgradeOption | null>;
  /** Solo activas — category opcional para filtrar por 'ram' | 'storage'. */
  findActive(category?: UpgradeCategory): Promise<UpgradeOption[]>;
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
  };
}
