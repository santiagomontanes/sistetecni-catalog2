if (typeof window !== "undefined") {
  throw new Error("src/lib/catalogPdf/catalogPdfData.ts es server-only.");
}

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAdminClient } from "../../supabase/admin";
import { buildCatalogPdfBytes, type CatalogProduct } from "./buildCatalogPdf";
import {storageDescription,type FinishOption} from "../operations/finishes";

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
  finishes_enabled?: boolean;
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
  color: string | null;
  colores_disponibles: string[] | null;
  descripcion: string | null;
  price: number | null;
  warranty_months: number | null;
  images: string[] | null;
}

const COLUMNAS_BASE =
  "id,title,brand,model,cpu,ram,storage,screen,gpu_model,condition,descripcion,price,warranty_months,images";

/**
 * P20.29 — color del modelo y los que de verdad hay disponibles.
 *
 * Van aparte porque la base puede no tenerlas todavía. Este catálogo es lo que
 * el bot le manda al cliente para decidir una compra: si se despliega antes de
 * que la migración llegue, pedir una columna inexistente dejaría al cliente
 * SIN catálogo. Se piden, y si la base dice que no existen se repite sin
 * ellas — el PDF sale igual, solo sin la fila "Color".
 */
const COLUMNAS_COLOR = "color,colores_disponibles";
const COLUMNAS = `${COLUMNAS_BASE},${COLUMNAS_COLOR}`;

/** ¿Es «esa columna no existe», y además habla del color? */
function faltanColumnasDeColor(error: { code?: string; message?: string } | null): boolean {
  if (error?.code !== "42703") return false;
  return (error.message ?? "").toLowerCase().includes("color");
}

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

  const consultar = (columnas: string) =>
    client
      .from("products")
      .select(columnas)
      .eq("visible_web", true)
      .gt("stock", 0)
      .order("price", { ascending: true })
      .limit(MAX_PRODUCTOS);

  let { data, error } = await consultar(`${COLUMNAS},finishes_enabled`);
  if(error?.code === "42703" && error.message.includes("finishes_enabled")) ({data,error}=await consultar(COLUMNAS));

  // La migración del color todavía no está: mejor un catálogo sin la fila
  // "Color" que ningún catálogo. Cualquier otro error sigue siendo un error.
  if (faltanColumnasDeColor(error)) {
    console.warn("[catalogPdf] la base aún no tiene color/colores_disponibles; se genera sin esa fila");
    ({ data, error } = await consultar(COLUMNAS_BASE));
  }

  if (error) throw new Error(`CATALOG_PDF_QUERY_FAILED:${error.code ?? "unknown"}`);

  const filas = (data ?? []) as unknown as FilaCatalogo[];

  const productsByModel: CatalogProduct[] = filas.map((row) => ({
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
    // P20.29 — lo que se imprime es lo DISPONIBLE; el del modelo es el respaldo.
    color: row.color,
    coloresDisponibles: Array.isArray(row.colores_disponibles) ? row.colores_disponibles : [],
    // FUENTE ÚNICA: la misma columna `descripcion` que escribe WhatsApp y
    // que lee el bot y la web. El PDF no guarda ni deriva una copia propia.
    description: row.descripcion,
    price: row.price,
    warrantyMonths: row.warranty_months,
    images: row.images,
  }));
  const productos:CatalogProduct[]=[];
  for(const [index,row] of filas.entries()){
    const base=productsByModel[index];
    if(!row.finishes_enabled){productos.push(base);continue;}
    const result=await client.rpc("catalog_finish_options",{p_product:row.id});
    if(result.error)throw new Error("CATALOG_FINISH_QUERY_FAILED");
    for(const option of (result.data?.options??[]) as FinishOption[]){
      productos.push({...base,title:`${base.title} · ${option.name}`,cpu:option.configuration.cpu,
        ram:option.configuration.ramGb,storage:storageDescription(option.configuration.storage),screen:option.configuration.screen,
        gpuModel:null,condition:null,description:null,color:option.baseColor,coloresDisponibles:[option.name],price:Number(option.priceCop),
        images:option.imagePaths.map(path=>client.storage.from("catalog-finishes").getPublicUrl(path).data.publicUrl)});
    }
  }

  const pdfBytes = await buildCatalogPdfBytes(productos, {
    generatedAt: opciones.generatedAt,
    allowedImageHosts: hostsImagenPermitidos(),
    placeholderBytes: await cargarPlaceholder(),
  });

  return { pdfBytes, productos: productos.length };
}
