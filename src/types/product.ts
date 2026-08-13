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
