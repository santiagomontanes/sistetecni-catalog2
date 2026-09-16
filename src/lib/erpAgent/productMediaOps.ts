if (typeof window !== "undefined") {
  throw new Error("src/lib/erpAgent/productMediaOps.ts es server-only.");
}

import { getAdminClient } from "../../supabase/admin";
import { CATALOG_MEDIA_BUCKET } from "./catalogMedia";

type AdminClient = ReturnType<typeof getAdminClient>;

export type MediaOperation = "add" | "replace" | "remove_all" | "remove" | "set_primary";

export interface ProductMediaResult {
  productId: string;
  before: string[];
  after: string[];
}

export interface UnitMediaResult {
  unitCode: string;
  before: string[];
  after: string[];
}

/**
 * Serializa un `string[]` de JS al literal `text[]` que entiende Postgres
 * — `{"a","b"}` — para poder compararlo con `.filter(col, "eq", literal)`
 * contra una columna array. Cada elemento se envuelve en comillas dobles
 * (así una URL con comas, llaves o espacios nunca rompe el parseo) y se
 * escapa en este orden EXACTO — importa: si se invirtiera, un backslash
 * agregado por el escape de comillas se volvería a escapar por error:
 *   1. `\` → `\\`  (cada backslash literal del valor se duplica)
 *   2. `"` → `\"`  (cada comilla doble del valor se escapa con un backslash)
 * Un array vacío da `{}` (`[].map(...).join(",")` ya es `""`, sin caso
 * especial aparte).
 *
 * Exportado para probarlo aislado — el bug real de STAGING (smoke P20.19:
 * 3 fotos subidas, 0 asociadas) salió de comparar el array directo con
 * `.eq("images", before)`, que PostgREST NO serializa como un literal
 * `text[]` — el UPDATE nunca encontraba fila que igualar y agotaba los
 * reintentos de CAS en silencio.
 */
export function postgresTextArrayLiteral(values: string[]): string {
  const elementos = values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `{${elementos.join(",")}}`;
}

/**
 * P20.19-bis — mutación de una columna `images text[]` (leer → calcular →
 * escribir), con CONCURRENCIA OPTIMISTA (§12 del encargo).
 *
 * ── EL RIESGO REAL ───────────────────────────────────────────────────────
 * Leer → calcular en memoria → escribir es un "lost update" clásico: si dos
 * operaciones leen el mismo `images` casi a la vez (p. ej. "agrega la foto
 * X" y "agrega la foto Y" del mismo producto, en paralelo), la segunda
 * escritura pisa la primera con un array que nunca tuvo en cuenta el
 * cambio de la otra. `finalizeCatalogDraft()` (P20.17C) tiene EXACTAMENTE
 * el mismo patrón y el mismo riesgo — no es nuevo de esta fase, pero aquí
 * SÍ se corrige en vez de solo documentarse, porque el coste es mínimo: un
 * compare-and-swap con lo que YA da Postgres/PostgREST, sin RPC nueva ni
 * transacción explícita.
 *
 * ── LA CORRECCIÓN (v2 — smoke STAGING real) ────────────────────────────
 * El UPDATE lleva un filtro CAS además de `.eq(columnaId, valorId)`: solo
 * aplica si `images` sigue siendo EXACTAMENTE lo que se leyó. `NULL` y `{}`
 * (array vacío) son valores DISTINTOS en Postgres — `eq('{}')` nunca iguala
 * una columna `NULL` — así que se distinguen explícitamente:
 *   - `images IS NULL`  → `.is("images", null)`
 *   - `images = {...}`  → `.filter("images", "eq", postgresTextArrayLiteral(before))`
 * (nunca `.eq("images", before)` con el array de JS crudo: PostgREST no lo
 * serializa como literal `text[]`, así que esa comparación nunca iguala
 * nada — el UPDATE afecta 0 filas SIEMPRE, aunque nadie más haya tocado la
 * fila, y el CAS agota los 5 reintentos por una razón que no es contención
 * real).
 *
 * Si otra escritura concurrente SÍ cambió la fila, el UPDATE afecta CERO
 * filas (`.select("images")` vuelve vacío) y se reintenta con una lectura
 * fresca — nunca se sobreescribe a ciegas. Acotado a `MAX_INTENTOS_CAS`
 * para no bucle infinito bajo contención real.
 */
const MAX_INTENTOS_CAS = 5;

/** Exportada SOLO para probar el CAS con un `client` doble — nunca se usa fuera de este módulo en producción. */
export async function mutarImagenes({
  client,
  tabla,
  columnaId,
  valorId,
  mutar,
}: {
  client: AdminClient;
  tabla: "products" | "product_units";
  columnaId: "id" | "unit_code";
  valorId: string;
  mutar: (actuales: string[]) => string[];
}): Promise<{ before: string[]; after: string[] }> {
  for (let intento = 0; intento < MAX_INTENTOS_CAS; intento++) {
    const { data: fila, error: lecturaError } = await client
      .from(tabla)
      .select("images")
      .eq(columnaId, valorId)
      .maybeSingle<{ images: string[] | null }>();

    if (lecturaError) throw new Error(`PRODUCT_MEDIA_${tabla.toUpperCase()}_LOOKUP_FAILED`);
    if (!fila) throw new Error(`PRODUCT_MEDIA_${tabla.toUpperCase()}_NOT_FOUND`);

    const eraNull = fila.images == null;
    const before = eraNull ? [] : fila.images!;
    const after = mutar(before);

    const mutacion = client.from(tabla).update({ images: after }).eq(columnaId, valorId);
    const { data: actualizado, error: updateError } = eraNull
      ? await mutacion.is("images", null).select("images")
      : await mutacion.filter("images", "eq", postgresTextArrayLiteral(before)).select("images");

    if (updateError) throw new Error(`PRODUCT_MEDIA_${tabla.toUpperCase()}_UPDATE_FAILED`);
    if (actualizado && actualizado.length > 0) return { before, after };
    // CAS falló: otra operación mutó la fila entre la lectura y esta
    // escritura. Se reintenta desde una lectura fresca.
  }
  throw new Error(`PRODUCT_MEDIA_${tabla.toUpperCase()}_CONCURRENT_UPDATE_CONFLICT`);
}

function soloHttps(urls: string[]): string[] {
  const limpias: string[] = [];
  for (const item of urls) {
    let url: URL;
    try {
      url = new URL(item);
    } catch {
      throw new Error("PRODUCT_MEDIA_INVALID_URL");
    }
    if (url.protocol !== "https:") throw new Error("PRODUCT_MEDIA_INVALID_URL");
    const texto = url.toString();
    if (texto.length > 2000) throw new Error("PRODUCT_MEDIA_INVALID_URL");
    if (!limpias.includes(texto)) limpias.push(texto);
  }
  return limpias;
}

export async function addProductImages(productId: string, imageUrls: string[]): Promise<ProductMediaResult> {
  const client = getAdminClient();
  const nuevas = soloHttps(imageUrls);
  const { before, after } = await mutarImagenes({
    client,
    tabla: "products",
    columnaId: "id",
    valorId: productId,
    // APPEND con dedup — mismo criterio que finalizeCatalogDraft().
    mutar: (actuales) => [...new Set([...actuales, ...nuevas])],
  });
  return { productId, before, after };
}

export async function replaceProductImages(productId: string, imageUrls: string[]): Promise<ProductMediaResult> {
  const client = getAdminClient();
  const nuevas = soloHttps(imageUrls);
  const { before, after } = await mutarImagenes({
    client, tabla: "products", columnaId: "id", valorId: productId,
    mutar: () => nuevas,
  });
  await limpiarStorageHuerfano(client, before.filter((u) => !after.includes(u)));
  return { productId, before, after };
}

export async function removeAllProductImages(productId: string): Promise<ProductMediaResult> {
  const client = getAdminClient();
  const { before, after } = await mutarImagenes({
    client, tabla: "products", columnaId: "id", valorId: productId,
    mutar: () => [],
  });
  await limpiarStorageHuerfano(client, before);
  return { productId, before, after };
}

/**
 * "Pon esta como principal" = moverla al índice 0 — MISMA convención que ya
 * usa `ProductCard.tsx` (`images?.[0]`) para la portada. No se inventa un
 * campo `is_cover` nuevo.
 *
 * P20.19-bis — la URL puede venir de DOS orígenes (§13 del encargo): una ya
 * en la galería (se reordena), o una foto RECIÉN subida por el agente
 * (`/product-media`, todavía no está en `products.images`) — en ese caso
 * se AGREGA de una vez al frente en vez de fallar con "no está en la
 * galería". Cualquiera de los dos casos es seguro: la URL siempre viene de
 * `productMediaFinalize.ts` (ya subida por el agente) o de una lectura real
 * previa — nunca una URL arbitraria inventada por el modelo.
 */
export async function setPrimaryProductImage(productId: string, imageUrl: string): Promise<ProductMediaResult> {
  const client = getAdminClient();
  const { before, after } = await mutarImagenes({
    client, tabla: "products", columnaId: "id", valorId: productId,
    mutar: (actuales) => [imageUrl, ...actuales.filter((u) => u !== imageUrl)],
  });
  return { productId, before, after };
}

/**
 * P20.19-bis — quita UNA foto por referencia (§15 del encargo). La URL
 * SIEMPRE viene de una lectura previa de la galería real (nunca inventada
 * por el modelo) — `normalizeProductMediaFinalizeInput` ya lo exige
 * (https, formato de URL válido). Si la foto no estaba en la galería, no es
 * un error: no hay nada que cambiar (idempotente ante un reintento).
 */
export async function removeProductImage(productId: string, imageUrl: string): Promise<ProductMediaResult> {
  const client = getAdminClient();
  const { before, after } = await mutarImagenes({
    client, tabla: "products", columnaId: "id", valorId: productId,
    mutar: (actuales) => actuales.filter((u) => u !== imageUrl),
  });
  await limpiarStorageHuerfano(client, before.filter((u) => !after.includes(u)));
  return { productId, before, after };
}

export async function addUnitImages(unitCode: string, imageUrls: string[]): Promise<UnitMediaResult> {
  const client = getAdminClient();
  const nuevas = soloHttps(imageUrls);
  const { before, after } = await mutarImagenes({
    client, tabla: "product_units", columnaId: "unit_code", valorId: unitCode,
    mutar: (actuales) => [...new Set([...actuales, ...nuevas])],
  });
  return { unitCode, before, after };
}

export async function replaceUnitImages(unitCode: string, imageUrls: string[]): Promise<UnitMediaResult> {
  const client = getAdminClient();
  const nuevas = soloHttps(imageUrls);
  const { before, after } = await mutarImagenes({
    client, tabla: "product_units", columnaId: "unit_code", valorId: unitCode,
    mutar: () => nuevas,
  });
  await limpiarStorageHuerfano(client, before.filter((u) => !after.includes(u)));
  return { unitCode, before, after };
}

/**
 * §18 del encargo — "borrado seguro": desasociar (quitar la URL del array)
 * es SIEMPRE seguro e inmediato. Borrar el OBJETO físico de Storage solo
 * ocurre si NINGUNA otra fila (ni `products.images` ni `product_units.
 * images`) sigue referenciando esa misma URL — se verifica antes de
 * borrar, nunca se asume.
 */
async function limpiarStorageHuerfano(client: AdminClient, urlsQuitadas: string[]): Promise<void> {
  for (const url of urlsQuitadas) {
    const [{ count: enProductos }, { count: enUnidades }] = await Promise.all([
      client.from("products").select("id", { count: "exact", head: true }).contains("images", [url]),
      client.from("product_units").select("id", { count: "exact", head: true }).contains("images", [url]),
    ]).then((rs) => rs.map((r) => ({ count: r.count ?? 0 })));

    if ((enProductos ?? 0) > 0 || (enUnidades ?? 0) > 0) continue;

    const path = pathDesdeUrlPublica(url);
    if (!path) continue;
    await client.storage.from(CATALOG_MEDIA_BUCKET).remove([path]).catch(() => {
      // Un fallo al borrar el objeto físico NO revierte la desasociación —
      // ya quedó fuera de la galería, que es lo que le importa al catálogo.
      // El objeto huérfano puede limpiarse después.
    });
  }
}

/**
 * P20.19-bis — versión PÚBLICA de la limpieza de huérfanos, para
 * `/product-media-cleanup`: una foto que llegó a subirse al bucket en un
 * intento PARCIAL (CONFIRMAR ejecutó la SQL, pero el `finalize` que la
 * habría asociado a `products.images`/`product_units.images` nunca tuvo
 * éxito) y el administrador después CANCELA. Reutiliza el MISMO chequeo
 * "¿sigue referenciada por algo?" que ya usan `replaceProductImages`/
 * `removeAllProductImages`/`removeProductImage` — nunca un borrado ciego.
 */
export async function cleanupOrphanProductMedia(urls: string[]): Promise<{ checked: number }> {
  const client = getAdminClient();
  const limpias = soloHttps(Array.isArray(urls) ? urls : []);
  await limpiarStorageHuerfano(client, limpias);
  return { checked: limpias.length };
}

/** Extrae el path dentro del bucket a partir de una URL pública de Supabase Storage. */
function pathDesdeUrlPublica(publicUrl: string): string | null {
  const marca = `/storage/v1/object/public/${CATALOG_MEDIA_BUCKET}/`;
  const idx = publicUrl.indexOf(marca);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.slice(idx + marca.length));
}
