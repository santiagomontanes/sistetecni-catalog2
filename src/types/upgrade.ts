// Corresponde al esquema real desplegado en STAGING:
// supabase/migrations/20260812223100_upgrade_options.sql
// supabase/migrations/20260812223200_product_upgrade_options.sql

export type UpgradeCategory = "ram" | "storage";

export interface UpgradeOption {
  id: string;
  category: UpgradeCategory;
  label: string;
  /** Capacidad resultante en GB — mismo criterio para ram y storage. */
  value: number;
  /** Solo aplica a category: 'storage'. null para 'ram'. */
  interface: string | null;
  /** Precio final adicional al cliente — el único campo usado en cálculo de precio. */
  extraCost: number;
  /** Informativo/interno. NUNCA se usa en el cálculo de precio al cliente. */
  componentCost: number | null;
  /** Informativo/interno. NUNCA se usa en el cálculo de precio al cliente. */
  installCost: number | null;
  active: boolean;
  createdAt: Date | null;
}

/** Fila de compatibilidad: qué upgrade_options aplican a qué producto. */
export interface ProductUpgradeOption {
  id: string;
  productId: string;
  upgradeOptionId: string;
  note: string | null;
  active: boolean;
  createdAt: Date | null;
}

/**
 * Vista de conveniencia que combina una fila de compatibilidad con los
 * datos completos de la opción de upgrade — lo que necesita el motor de
 * matching (Fase 2B/B3) sin tener que hacer un segundo join.
 */
export interface CompatibleUpgrade {
  /** id de la fila product_upgrade_options, no de upgrade_options */
  compatibilityId: string;
  note: string | null;
  option: UpgradeOption;
}
