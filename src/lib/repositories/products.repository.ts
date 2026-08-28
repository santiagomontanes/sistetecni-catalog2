import type { SupabaseClient } from "@supabase/supabase-js";
import type { Product, GpuType } from "../../types/product";
import { RepositoryError } from "./errors";

export interface ProductsRepository {
  /** null si no existe o no es visible — nunca lanza para ese caso. */
  findById(id: string): Promise<Product | null>;
  /** Preserva el orden de entrada cuando es posible; omite los que no existan. */
  findManyByIds(ids: string[]): Promise<Product[]>;
  /**
   * Candidatos públicos elegibles para el personalizador (Fase 2B/B4): solo
   * `visible_web = true` (o `null`, mismo criterio ya usado por el catálogo
   * en src/supabase/db.ts — un producto sin ese campo fijado se sigue
   * mostrando). NO filtra por stock — B3 (matchProducts) es quien separa
   * disponibles de agotados; duplicar ese criterio aquí sería una segunda
   * fuente de verdad para la misma decisión.
   */
  findPersonalizerCandidates(): Promise<Product[]>;
  /**
   * Búsqueda por título/marca/modelo para el selector de productos del
   * módulo de ventas (admin). A diferencia de findPersonalizerCandidates,
   * NO filtra por visible_web — una venta interna puede incluir productos
   * que todavía no están publicados en el catálogo público.
   */
  search(query: string, limit?: number): Promise<Product[]>;
}

const SELECT_COLUMNS =
  "id,title,brand,model,cpu,ram,storage,screen,price,condition,stock,images,featured,visible_web,created_at," +
  "cpu_generation,gpu_type,gpu_model,touch_screen,screen_size_inches,storage_gb";

interface ProductRow {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  cpu: string | null;
  ram: number | null;
  storage: string | null;
  screen: string | null;
  price: number | null;
  condition: string | null;
  stock: number | null;
  images: string[] | null;
  featured: boolean | null;
  visible_web: boolean | null;
  created_at: string | null;
  cpu_generation: number | null;
  gpu_type: string | null;
  gpu_model: string | null;
  touch_screen: boolean | null;
  screen_size_inches: number | null;
  storage_gb: number | null;
}

function mapRow(row: ProductRow): Product {
  return {
    id: row.id,
    title: row.title,
    brand: row.brand ?? "",
    model: row.model ?? "",
    cpu: row.cpu ?? "",
    ram: row.ram ?? 0,
    storage: row.storage ?? "",
    screen: row.screen ?? "",
    price: row.price ?? 0,
    condition: row.condition ?? "",
    stock: row.stock ?? 0,
    images: row.images ?? [],
    featured: row.featured ?? false,
    visibleWeb: row.visible_web !== false,
    createdAt: row.created_at ? new Date(row.created_at) : null,
    cpuGeneration: row.cpu_generation,
    gpuType: (row.gpu_type as GpuType | null) ?? null,
    gpuModel: row.gpu_model,
    touchScreen: row.touch_screen,
    screenSizeInches: row.screen_size_inches,
    storageGb: row.storage_gb,
  };
}

export function createProductsRepository(client: SupabaseClient): ProductsRepository {
  return {
    async findById(id) {
      const { data, error } = await client
        .from("products")
        .select(SELECT_COLUMNS)
        .eq("id", id)
        .maybeSingle<ProductRow>();

      if (error) {
        throw new RepositoryError(`ProductsRepository.findById(${id}) falló`, error);
      }
      return data ? mapRow(data) : null;
    },

    async findManyByIds(ids) {
      if (ids.length === 0) return [];

      const { data, error } = await client
        .from("products")
        .select(SELECT_COLUMNS)
        .in("id", ids)
        .returns<ProductRow[]>();

      if (error) {
        throw new RepositoryError(
          `ProductsRepository.findManyByIds falló para ${ids.length} id(s)`,
          error
        );
      }

      const byId = new Map((data ?? []).map((row) => [row.id, mapRow(row)]));
      return ids.map((id) => byId.get(id)).filter((p): p is Product => p !== undefined);
    },

    async findPersonalizerCandidates() {
      const { data, error } = await client
        .from("products")
        .select(SELECT_COLUMNS)
        .or("visible_web.eq.true,visible_web.is.null")
        .returns<ProductRow[]>();

      if (error) {
        throw new RepositoryError("ProductsRepository.findPersonalizerCandidates falló", error);
      }
      return (data ?? []).map(mapRow);
    },

    async search(query, limit = 20) {
      const escaped = query.replace(/[%,()]/g, "");
      const { data, error } = await client
        .from("products")
        .select(SELECT_COLUMNS)
        .or(`title.ilike.%${escaped}%,brand.ilike.%${escaped}%,model.ilike.%${escaped}%`)
        .order("created_at", { ascending: false })
        .limit(limit)
        .returns<ProductRow[]>();

      if (error) {
        throw new RepositoryError(`ProductsRepository.search(${query}) falló`, error);
      }
      return (data ?? []).map(mapRow);
    },
  };
}
