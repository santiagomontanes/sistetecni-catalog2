/**
 * Generador del CATÁLOGO COMERCIAL en PDF (P20.21C) — función pura.
 *
 * Recibe los productos YA CARGADOS y construye el documento; no consulta
 * Supabase ni decide qué productos entran (eso es responsabilidad de quien
 * llama, ver `lib/erpAgent/catalogPdf.ts`). Sí descarga las imágenes, porque
 * embeberlas es parte de construir el PDF — con allowlist de host, timeout y
 * concurrencia acotada (§23 del encargo).
 *
 * ── POR QUÉ pdf-lib Y NO CHROMIUM ───────────────────────────────────────
 * `pdf-lib` YA es dependencia del repo y YA genera en producción el
 * comprobante de venta (`lib/salesPdf/buildSalePdf.ts`) en el runtime Node
 * de Vercel: sin binarios nativos, sin cold start de Chromium, sin bundle
 * gigante. Este archivo replica su MISMA infraestructura de dibujo
 * (constantes A4, wrapText, ensureSpace/newPage, drawText) sin modificar
 * aquel: son dos documentos de dominios distintos.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { COMPANY } from "../../config/company";

const PAGE_WIDTH = 595.28; // A4 en puntos
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_LIMIT = 60;

const BRAND_BLUE: RGB = rgb(0x1a / 255, 0x56 / 255, 0xdb / 255);
const BRAND_DARK: RGB = rgb(0x10 / 255, 0x2a / 255, 0x63 / 255);
const TEXT_DARK: RGB = rgb(0.12, 0.14, 0.18);
const TEXT_MUTED: RGB = rgb(0.42, 0.45, 0.5);
const BORDER_GRAY: RGB = rgb(0.85, 0.87, 0.9);
const CARD_BG: RGB = rgb(0.975, 0.98, 0.99);
const WHITE: RGB = rgb(1, 1, 1);

/** Alto fijo de la tarjeta de producto. Fija = layout predecible y paginable. */
const CARD_HEIGHT = 150;
const CARD_GAP = 14;
const PHOTO_SIZE = 118;

/** Tope de líneas de descripción DENTRO de la tarjeta (el dato completo vive en DB). */
const MAX_LINEAS_DESCRIPCION = 3;

export interface CatalogProduct {
  id: string;
  title: string;
  brand?: string | null;
  model?: string | null;
  cpu?: string | null;
  ram?: number | null;
  storage?: string | null;
  screen?: string | null;
  gpuModel?: string | null;
  condition?: string | null;
  description?: string | null;
  price?: number | null;
  warrantyMonths?: number | null;
  images?: string[] | null;
}

export interface BuildCatalogOptions {
  /** Reloj inyectable: los tests necesitan una fecha estable. */
  generatedAt?: Date;
  /**
   * Hosts permitidos para descargar imágenes. Si se omite, NO se descarga
   * ninguna imagen remota y todas las tarjetas usan el marcador — decisión
   * deliberada: sin allowlist explícita no se hace ningún `fetch` (§23,
   * prevención de SSRF).
   */
  allowedImageHosts?: string[];
  /** Bytes del marcador corporativo (asset estático del repo). */
  placeholderBytes?: Uint8Array | null;
  /** Contacto oficial ya verificado por quien llama. Nunca se inventa aquí. */
  contact?: { phone?: string | null; website?: string | null } | null;
  fetchImpl?: typeof fetch;
  /** Timeout por imagen. Una foto lenta no puede bloquear el catálogo entero. */
  imageTimeoutMs?: number;
  /** Descargas simultáneas. */
  imageConcurrency?: number;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

interface BuildContext {
  doc: PDFDocument;
  fonts: Fonts;
  page: PDFPage;
  y: number;
}

const FORMATO_COP = new Intl.NumberFormat("es-CO");

function formatCOP(valor: number | null | undefined): string {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return "Consultar";
  return `$${FORMATO_COP.format(Math.round(n))}`;
}

function formatFecha(fecha: Date): string {
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "long", year: "numeric" }).format(fecha);
}

/**
 * Corta texto en líneas que caben en `maxWidth` — pdf-lib no envuelve solo.
 *
 * SANEA ANTES DE MEDIR: `widthOfTextAtSize` ya lanza con un carácter fuera
 * de WinAnsi, así que sanear solo al dibujar llegaba tarde y un emoji en el
 * título de UN producto tumbaba la generación del catálogo entero.
 */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = sanitizarWinAnsi(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Las fuentes estándar de PDF (Helvetica) usan WinAnsi, que NO cubre todos
 * los caracteres que puede escribir un administrador (emojis, comillas
 * tipográficas raras). Un carácter fuera de rango hace que pdf-lib LANCE y
 * tumbaría el catálogo entero por un solo producto. Se sustituyen por un
 * equivalente seguro en vez de fallar.
 */
function sanitizarWinAnsi(texto: string): string {
  return String(texto ?? "")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    // Todo lo que quede fuera de Latin-1 se descarta: nunca romper el PDF.
    .replace(/[^\x09\x0A\x0D\x20-\x7E¡-ÿ]/g, "");
}

function drawText(
  ctx: BuildContext,
  text: string,
  x: number,
  size: number,
  opts: { bold?: boolean; color?: RGB; align?: "left" | "right" | "center"; y?: number } = {}
): void {
  const font = opts.bold ? ctx.fonts.bold : ctx.fonts.regular;
  const color = opts.color ?? TEXT_DARK;
  const limpio = sanitizarWinAnsi(text);
  if (!limpio) return;
  const width = font.widthOfTextAtSize(limpio, size);
  let drawX = x;
  if (opts.align === "right") drawX = x - width;
  if (opts.align === "center") drawX = x - width / 2;
  ctx.page.drawText(limpio, { x: drawX, y: opts.y ?? ctx.y, size, font, color });
}

function newPage(ctx: BuildContext): void {
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN;
}

// ── Imágenes ──────────────────────────────────────────────────────────────

/** Tope por imagen: una foto enorme hincha el PDF y lo vuelve inenviable. */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function hostPermitido(url: string, allowed: string[]): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return allowed.includes(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Descarga UNA imagen. Devuelve `null` ante cualquier problema — nunca
 * lanza: un 404, un timeout o un tipo no soportado degradan esa tarjeta al
 * marcador, jamás abortan el catálogo completo (§23).
 */
async function descargarImagen(
  url: string,
  { allowed, fetchImpl, timeoutMs }: { allowed: string[]; fetchImpl: typeof fetch; timeoutMs: number }
): Promise<{ bytes: Uint8Array; tipo: "jpg" | "png" } | null> {
  if (!hostPermitido(url, allowed)) return null;

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), timeoutMs);
  try {
    const respuesta = await fetchImpl(url, { signal: control.signal });
    if (!respuesta.ok) return null;

    const contentType = (respuesta.headers.get("content-type") ?? "").toLowerCase();
    const tipo = contentType.includes("png") ? "png" : contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : null;
    if (!tipo) return null;

    const buffer = new Uint8Array(await respuesta.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) return null;
    return { bytes: buffer, tipo };
  } catch {
    return null;
  } finally {
    clearTimeout(temporizador);
  }
}

/** Descarga con concurrencia acotada, preservando el orden de entrada. */
async function descargarEnLotes<T, R>(
  items: T[],
  limite: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const salida: R[] = new Array(items.length);
  let siguiente = 0;

  const worker = async () => {
    for (;;) {
      const indice = siguiente++;
      if (indice >= items.length) return;
      salida[indice] = await fn(items[indice]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limite, Math.max(items.length, 1)) }, worker));
  return salida;
}

// ── Portada ───────────────────────────────────────────────────────────────

function drawPortada(ctx: BuildContext, opciones: BuildCatalogOptions, total: number): void {
  // Franja superior con el color de marca.
  ctx.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 260, width: PAGE_WIDTH, height: 260, color: BRAND_BLUE });

  // Logotipo dibujado con primitivas, mismo criterio que el comprobante de
  // venta: replicar public/logo.svg sin añadir un conversor SVG→PNG con
  // binarios nativos solo para dos formas.
  const logoSize = 64;
  const logoX = MARGIN;
  const logoY = PAGE_HEIGHT - 70;
  ctx.page.drawRectangle({ x: logoX, y: logoY - logoSize, width: logoSize, height: logoSize, color: WHITE });
  const label = "ST";
  const labelSize = 30;
  const labelWidth = ctx.fonts.bold.widthOfTextAtSize(label, labelSize);
  ctx.page.drawText(label, {
    x: logoX + (logoSize - labelWidth) / 2,
    y: logoY - logoSize / 2 - labelSize * 0.36,
    size: labelSize,
    font: ctx.fonts.bold,
    color: BRAND_BLUE,
  });

  drawText(ctx, COMPANY.name, MARGIN, 40, { bold: true, color: WHITE, y: PAGE_HEIGHT - 150 });
  drawText(ctx, "Calidad al mejor precio", MARGIN, 16, { color: WHITE, y: PAGE_HEIGHT - 176 });

  drawText(ctx, "CATÁLOGO DE PRODUCTOS", MARGIN, 13, { bold: true, color: WHITE, y: PAGE_HEIGHT - 226 });

  // Bloque informativo bajo la franja.
  ctx.y = PAGE_HEIGHT - 300;
  const fecha = formatFecha(opciones.generatedAt ?? new Date());
  drawText(ctx, `Actualizado el ${fecha}`, MARGIN, 11, { color: TEXT_MUTED });
  ctx.y -= 18;
  drawText(ctx, `${total} ${total === 1 ? "equipo disponible" : "equipos disponibles"}`, MARGIN, 11, {
    color: TEXT_MUTED,
  });

  // Contacto SOLO si quien llama lo aportó desde configuración real.
  const website = opciones.contact?.website ?? COMPANY.website;
  if (website) {
    ctx.y -= 18;
    drawText(ctx, `https://${String(website).replace(/^https?:\/\//, "")}`, MARGIN, 11, { color: BRAND_DARK });
  }
  if (opciones.contact?.phone) {
    ctx.y -= 18;
    drawText(ctx, `WhatsApp: ${opciones.contact.phone}`, MARGIN, 11, { color: BRAND_DARK });
  }
  ctx.y -= 24;
  drawText(ctx, `NIT: ${COMPANY.nit}`, MARGIN, 9, { color: TEXT_MUTED });

  ctx.y -= 30;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y },
    thickness: 1,
    color: BORDER_GRAY,
  });
  ctx.y -= 28;
}

// ── Tarjeta de producto ───────────────────────────────────────────────────

function drawTarjeta(ctx: BuildContext, p: CatalogProduct, imagen: PDFImage | null): void {
  if (ctx.y - CARD_HEIGHT < BOTTOM_LIMIT) newPage(ctx);

  const top = ctx.y;
  const cardY = top - CARD_HEIGHT;

  ctx.page.drawRectangle({
    x: MARGIN,
    y: cardY,
    width: CONTENT_WIDTH,
    height: CARD_HEIGHT,
    color: CARD_BG,
    borderColor: BORDER_GRAY,
    borderWidth: 0.7,
  });

  // Foto (o marcador) a la izquierda.
  const fotoX = MARGIN + 12;
  const fotoY = cardY + (CARD_HEIGHT - PHOTO_SIZE) / 2;
  if (imagen) {
    // Se ajusta manteniendo proporción dentro del cuadro reservado.
    const escala = Math.min(PHOTO_SIZE / imagen.width, PHOTO_SIZE / imagen.height);
    const ancho = imagen.width * escala;
    const alto = imagen.height * escala;
    ctx.page.drawImage(imagen, {
      x: fotoX + (PHOTO_SIZE - ancho) / 2,
      y: fotoY + (PHOTO_SIZE - alto) / 2,
      width: ancho,
      height: alto,
    });
  } else {
    ctx.page.drawRectangle({
      x: fotoX,
      y: fotoY,
      width: PHOTO_SIZE,
      height: PHOTO_SIZE,
      color: rgb(0.92, 0.94, 0.96),
      borderColor: BORDER_GRAY,
      borderWidth: 0.5,
    });
    const texto = "SISTETECNI";
    const size = 9;
    const ancho = ctx.fonts.bold.widthOfTextAtSize(texto, size);
    ctx.page.drawText(texto, {
      x: fotoX + (PHOTO_SIZE - ancho) / 2,
      y: fotoY + PHOTO_SIZE / 2 - 3,
      size,
      font: ctx.fonts.bold,
      color: TEXT_MUTED,
    });
  }

  // Columna de texto a la derecha.
  const textoX = fotoX + PHOTO_SIZE + 16;
  const textoAncho = CONTENT_WIDTH - (textoX - MARGIN) - 16;
  let cursor = top - 22;

  const nombre = p.title || [p.brand, p.model].filter(Boolean).join(" ") || "Equipo";
  const nombreLineas = wrapText(nombre, ctx.fonts.bold, 13, textoAncho);
  for (const linea of nombreLineas.slice(0, 2)) {
    drawText(ctx, linea, textoX, 13, { bold: true, color: BRAND_DARK, y: cursor });
    cursor -= 16;
  }

  // Specs en una línea compacta — SOLO las que existen de verdad. Nunca
  // "GPU: N/A": un campo vacío simplemente no se imprime (§38).
  const specs: string[] = [];
  if (p.cpu) specs.push(p.cpu);
  if (typeof p.ram === "number" && p.ram > 0) specs.push(`${p.ram} GB RAM`);
  if (p.storage) specs.push(p.storage);
  if (p.screen) specs.push(p.screen);
  if (p.gpuModel) specs.push(p.gpuModel);

  if (specs.length > 0) {
    const specLineas = wrapText(specs.join(" · "), ctx.fonts.regular, 9, textoAncho);
    for (const linea of specLineas.slice(0, 2)) {
      drawText(ctx, linea, textoX, 9, { color: TEXT_DARK, y: cursor });
      cursor -= 12;
    }
  }

  const meta: string[] = [];
  if (p.condition) meta.push(p.condition);
  if (typeof p.warrantyMonths === "number" && p.warrantyMonths > 0) {
    meta.push(`Garantía ${p.warrantyMonths} ${p.warrantyMonths === 1 ? "mes" : "meses"}`);
  }
  if (meta.length > 0) {
    drawText(ctx, meta.join(" · "), textoX, 8.5, { color: TEXT_MUTED, y: cursor });
    cursor -= 13;
  }

  // Descripción: recorte SOLO VISUAL. El texto completo sigue íntegro en la
  // base de datos — aquí se añade "…" para que se note que hay más.
  if (p.description) {
    const lineas = wrapText(p.description, ctx.fonts.regular, 8.5, textoAncho);
    const visibles = lineas.slice(0, MAX_LINEAS_DESCRIPCION);
    if (lineas.length > MAX_LINEAS_DESCRIPCION && visibles.length > 0) {
      visibles[visibles.length - 1] = `${visibles[visibles.length - 1]}…`;
    }
    for (const linea of visibles) {
      if (cursor < cardY + 26) break;
      drawText(ctx, linea, textoX, 8.5, { color: TEXT_MUTED, y: cursor });
      cursor -= 11;
    }
  }

  // Precio destacado, abajo a la derecha de la tarjeta.
  drawText(ctx, formatCOP(p.price), MARGIN + CONTENT_WIDTH - 14, 16, {
    bold: true,
    color: BRAND_BLUE,
    align: "right",
    y: cardY + 14,
  });

  ctx.y = cardY - CARD_GAP;
}

// ── Entrada pública ───────────────────────────────────────────────────────

/**
 * Construye el PDF del catálogo.
 *
 * @param productos ya filtrados y ordenados por quien llama.
 * @returns bytes del PDF.
 */
export async function buildCatalogPdfBytes(
  productos: CatalogProduct[],
  opciones: BuildCatalogOptions = {}
): Promise<Uint8Array> {
  const lista = Array.isArray(productos) ? productos : [];
  const allowed = opciones.allowedImageHosts ?? [];
  const fetchImpl = opciones.fetchImpl ?? fetch;
  const timeoutMs = opciones.imageTimeoutMs ?? 5000;
  const concurrencia = opciones.imageConcurrency ?? 5;

  const doc = await PDFDocument.create();
  doc.setTitle(`Catálogo ${COMPANY.name}`);
  doc.setProducer(COMPANY.name);

  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  const ctx: BuildContext = {
    doc,
    fonts,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN,
  };

  drawPortada(ctx, opciones, lista.length);

  if (lista.length === 0) {
    drawText(ctx, "En este momento no hay equipos disponibles para mostrar.", MARGIN, 12, {
      color: TEXT_MUTED,
    });
    drawText(ctx, "Escríbenos y te avisamos en cuanto entre inventario nuevo.", MARGIN, 10, {
      color: TEXT_MUTED,
      y: ctx.y - 18,
    });
    return doc.save();
  }

  // Marcador corporativo: se embebe UNA sola vez y se reutiliza en todas las
  // tarjetas sin foto — nunca una petición HTTP por producto.
  let placeholder: PDFImage | null = null;
  if (opciones.placeholderBytes && opciones.placeholderBytes.byteLength > 0) {
    try {
      placeholder = await doc.embedJpg(opciones.placeholderBytes);
    } catch {
      try {
        placeholder = await doc.embedPng(opciones.placeholderBytes);
      } catch {
        placeholder = null;
      }
    }
  }

  // Solo la PRIMERA foto de cada producto: el encargo pide priorizar peso y
  // velocidad sobre meter todas las imágenes disponibles.
  const urls = lista.map((p) => (Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null));
  const descargadas = await descargarEnLotes(urls, concurrencia, async (url) =>
    url && allowed.length > 0 ? descargarImagen(url, { allowed, fetchImpl, timeoutMs }) : null
  );

  const imagenes: (PDFImage | null)[] = [];
  for (const descarga of descargadas) {
    if (!descarga) {
      imagenes.push(placeholder);
      continue;
    }
    try {
      imagenes.push(descarga.tipo === "png" ? await doc.embedPng(descarga.bytes) : await doc.embedJpg(descarga.bytes));
    } catch {
      // Imagen corrupta pese al content-type: degradar, nunca abortar.
      imagenes.push(placeholder);
    }
  }

  lista.forEach((producto, i) => drawTarjeta(ctx, producto, imagenes[i] ?? placeholder));

  return doc.save();
}
