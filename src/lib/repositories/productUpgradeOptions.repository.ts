import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompatibleUpgrade, UpgradeCategory } from "../../types/upgrade";
import { RepositoryError } from "./errors";

export interface ProductUpgradeOptionsRepository {
  /**
   * Upgrades compatibles con un producto — ya unidos con upgrade_options,
   * solo activos en ambos lados. Array vacío = producto sin upgrades
   * ofrecidos (caso válido, no un error — ver docs/fase2a-personalizador-diseno.md §10).
   */
  findCompatibleUpgradesForProduct(productId: string): Promise<CompatibleUpgrade[]>;
  /** Para validar server-side una selección del cliente antes de calcular precio. */
  isCompatible(productId: string, upgradeOptionId: string): Promise<boolean>;
}

interface CompatibilityRow {
  id: string;
  note: string | null;
  upgrade_options: {
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
  } | null;
}

function mapRow(row: CompatibilityRow): CompatibleUpgrade | null {
  if (!row.upgrade_options) return null; // fila huérfana o upgrade_option inactivo filtrado por el join — no debería ocurrir, pero no se fabrica un objeto a medias
  const o = row.upgrade_options;
  return {
    compatibilityId: row.id,
    note: row.note,
    option: {
      id: o.id,
      category: o.category as UpgradeCategory,
      label: o.label,
      value: o.value,
      interface: o.interface,
      extraCost: o.extra_cost,
      componentCost: o.component_cost,
      installCost: o.install_cost,
      active: o.active,
      createdAt: o.created_at ? new Date(o.created_at) : null,
    },
  };
}

export function createProductUpgradeOptionsRepository(
  client: SupabaseClient
): ProductUpgradeOptionsRepository {
  return {
    async findCompatibleUpgradesForProduct(productId) {
      const { data, error } = await client
        .from("product_upgrade_options")
        .select(
          "id,note,upgrade_options!inner(id,category,label,value,interface,extra_cost,component_cost,install_cost,active,created_at)"
        )
        .eq("product_id", productId)
        .eq("active", true)
        .eq("upgrade_options.active", true)
        .returns<CompatibilityRow[]>();

      if (error) {
        throw new RepositoryError(
          `ProductUpgradeOptionsRepository.findCompatibleUpgradesForProduct(${productId}) falló`,
          error
        );
      }

      return (data ?? [])
        .map(mapRow)
        .filter((u): u is CompatibleUpgrade => u !== null);
    },

    async isCompatible(productId, upgradeOptionId) {
      const { data, error } = await client
        .from("product_upgrade_options")
        .select("id")
        .eq("product_id", productId)
        .eq("upgrade_option_id", upgradeOptionId)
        .eq("active", true)
        .maybeSingle<{ id: string }>();

      if (error) {
        throw new RepositoryError(
          `ProductUpgradeOptionsRepository.isCompatible(${productId}, ${upgradeOptionId}) falló`,
          error
        );
      }
      return data !== null;
    },
  };
}
