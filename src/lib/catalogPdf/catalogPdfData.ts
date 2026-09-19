if (typeof window !== "undefined") {
  throw new Error("src/lib/catalogPdf/catalogPdfData.ts es server-only.");
}

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAdminClient } from "../../supabase/admin";
import { buildCatalogPdfBytes, type CatalogProduct } from "./buildCatalogPdf";

/**
 * Selección de productos y generación del catálogo PDF (P20.21C).
 *
 * ── SIEMPRE FRESCO ───────────────────────────────────────────────────────
 * Cada llamada consulta Supabase en vivo. NO hay caché, ni PDF persistido,
 * ni archivo en Storage: el catálogo se arma on-demand con el inventario del
 * momento, así que es imposible entregar uno viejo (§5/§20 del encargo).
 *
 * ── QUÉ ENTRA ────────────────────────────────────────────────────────────
 * Solo `visible_web = true` Y `stock > 0`. Un catálogo que se manda a un
 * cliente no debe ofrecer equipos agotados ni fichas todavía no publicadas.
 */

/** Salvaguarda: un catálogo real está muy por debajo de esto. */
const MAX_PRODUCTOS = 200;

interface FilaCatalogo {
  id: string;
  title: string | null;
  brand: string | null;
  model: string | null;
  cpu: string | null;
  ram: number | null;
  storage: string | null;
  screen: string | null;
  gpu_model: string | null;
  condition: string | null;
  descripcion: string | null;
  price: number | null;
  warranty_months: number | null;
  images: string[] | null;
}

const COLUMNAS =
  "id,title,brand,model,cpu,ram,storage,screen,gpu_model,condition,descripcion,price,warranty_months,images";

/**
 * Host del Storage de Supabase de ESTE proyecto — la única fuente de la que
 * el generador puede descargar imágenes (§23, prevención de SSRF).
 * Se deriva de la URL ya configurada; nunca de un dato de la fila.
 */
export function hostsImagenPermitidos(): string[] {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  try {
    return url ? [new URL(url).hostname] : [];
  } catch {
    return [];
  }
}

/** Marcador corporativo: asset ESTÁTICO del repo, nunca una URL remota. */
async function cargarPlaceholder(): Promise<Uint8Array | null> {
  try {
    const ruta = join(process.cwd(), "public", "placeholder.jpg");
    return new Uint8Array(await readFile(ruta));
  } catch {
    return null;
  }
}

export interface CatalogoPdfResultado {
  pdfBytes: Uint8Array;
  productos: number;
}

/**
 * Consulta el catálogo vigente y devuelve el PDF ya construido.
 *
 * @param opciones.generatedAt reloj inyectable (tests).
 */
export async function buildCatalogoPdfVigente(
  opciones: { generatedAt?: Date } = {}
): Promise<CatalogoPdfResultado> {
  const client = getAdminClient();

  const { data, error } = await client
    .from("products")
    .select(COLUMNAS)
    .eq("visible_web", true)
    .gt("stock", 0)
    .order("price", { ascending: true })
    .limit(MAX_PRODUCTOS);

  if (error) throw new Error(`CATALOG_PDF_QUERY_FAILED:${error.code ?? "unknown"}`);

  const filas = (data ?? []) as unknown as FilaCatalogo[];

  const productos: CatalogProduct[] = filas.map((row) => ({
    id: row.id,
    title: row.title ?? "",
    brand: row.brand,
    model: row.model,
    cpu: row.cpu,
    ram: row.ram,
    storage: row.storage,
    screen: row.screen,
    gpuModel: row.gpu_model,
    condition: row.condition,
    // FUENTE ÚNICA: la misma columna `descripcion` que escribe WhatsApp y
    // que lee el bot y la web. El PDF no guarda ni deriva una copia propia.
    description: row.descripcion,
    price: row.price,
    warrantyMonths: row.warranty_months,
    images: row.images,
  }));

  const pdfBytes = await buildCatalogPdfBytes(productos, {
    generatedAt: opciones.generatedAt,
    allowedImageHosts: hostsImagenPermitidos(),
    placeholderBytes: await cargarPlaceholder(),
  });

  return { pdfBytes, productos: productos.length };
}
