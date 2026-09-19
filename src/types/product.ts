export type GpuType = "integrada" | "dedicada";

export interface Product {
  id: string;
  title: string;
  brand: string;
  model: string;
  cpu: string;
  ram: number;
  storage: string;
  screen: string;
  price: number;
  condition: string;
  stock: number;
  images: string[];
  featured: boolean;
  visibleWeb: boolean;
  createdAt: Date | null;

  // ERP Fase 1D — opcionales para mantener compatibilidad con mapeos/tests
  // históricos. Cuando erpStockEnabled=true, `stock` deja de ser manual y
  // representa exactamente las product_units con status=available.
  erpStockEnabled?: boolean;
  erpStockSyncedAt?: Date | null;

  // Columnas del personalizador (Fase 2B) — confirmadas en el esquema real
  // desplegado en STAGING (supabase/migrations/20260812223000_...). Todas
  // nullable en la base y OPCIONALES aquí a propósito: mapProduct() en
  // src/supabase/db.ts (código existente del catálogo, sin tocar en B2)
  // sigue construyendo Product sin estos campos y debe seguir compilando
  // sin cambios. Los repositorios nuevos de B2 (src/lib/repositories/)
  // sí los completan siempre (con el valor real o null, nunca undefined).
  cpuGeneration?: number | null;
  gpuType?: GpuType | null;
  gpuModel?: string | null;
  touchScreen?: boolean | null;
  screenSizeInches?: number | null;
  storageGb?: number | null;

  /**
   * P20.21A — descripción comercial del producto.
   *
   * FUENTE ÚNICA: la columna `public.products.descripcion` (nombre histórico
   * en español). Aquí se expone como `description` siguiendo la misma
   * convención DB→dominio que ya usa el resto del tipo (`visible_web` →
   * `visibleWeb`, `gpu_model` → `gpuModel`).
   *
   * La escriben el administrador por WhatsApp (creación y edición) y el
   * panel; la leen el bot (capacidades grounded), el catálogo PDF, la
   * tarjeta del catálogo web y la ficha individual. NO existe ninguna copia
   * por canal: todos leen esta misma columna.
   */
  description?: string | null;

  /** P20.21A — garantía en meses declarada al publicar. `null` = no declarada. */
  warrantyMonths?: number | null;
}

export interface ProductFilters {
  brand?: string;
  ram?: number;
  minPrice?: number;
  maxPrice?: number;
  featured?: boolean;
  maxItems?: number;
  visibleOnly?: boolean;
}
