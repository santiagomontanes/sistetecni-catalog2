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
/** Acento para el precio: contrasta con el azul corporativo sin competir. */
const ACCENT: RGB = rgb(0x0f / 255, 0x9d / 255, 0x58 / 255);
const CHIP_BG: RGB = rgb(0.93, 0.95, 0.99);

/** Alto fijo de la tarjeta de producto. Fija = layout predecible y paginable. */
const CARD_GAP = 22;
/** Foto principal de la ficha. */
const FOTO_PRINCIPAL = 210;
/** Miniaturas del resto de fotos del mismo equipo. */
const MINIATURA = 62;
const MINIATURA_GAP = 7;
/** Alto mínimo que debe caber para empezar una ficha en la página actual. */
const ALTO_MINIMO_FICHA = 300;

/** Tope de líneas de descripción DENTRO de la tarjeta (el dato completo vive en DB). */
/**
 * P20.28D — la descripción va COMPLETA.
 *
 * Antes se recortaba a tres líneas con puntos suspensivos. Ese recorte se
 * pensó para una tarjeta compacta, pero el cliente recibe este PDF para
 * decidir una compra: escondérselo le obliga a preguntar por WhatsApp algo
 * que ya estaba escrito. Ahora la ficha crece lo que haga falta y salta de
 * página sola.
 */

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
  /**
   * Tope de fotos por equipo (P20.28D). Existe para acotar el peso del PDF:
   * WhatsApp tiene un límite de tamaño y un catálogo no puede quedarse sin
   * enviar por traer cincuenta fotos de un mismo portátil.
   *
   * 12 por defecto: hoy el equipo con más fotos del catálogo tiene 7, así que
   * ninguna se queda fuera, y con el reescalado a 760 px el peso sigue muy
   * por debajo de lo que WhatsApp admite.
   */
  maxImagesPerProduct?: number;
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

/**
 * Ancho al que se reescalan las fotos antes de incrustarlas (P20.28D).
 *
 * La foto principal se dibuja a 210 pt y las miniaturas a 62 pt; incrustar el
 * original de 2.000 px para eso solo engorda el PDF. Con las fotos reales del
 * catálogo la diferencia es de 10 MB a menos de 2, y eso es lo que decide si
 * un cliente con datos móviles llega a abrirlo.
 *
 * 760 px da holgura de sobra para imprimir la principal sin pixelarla.
 */
const ANCHO_REESCALADO = 760;
const CALIDAD_JPEG = 72;

/**
 * Reescala con `sharp` si está disponible; si no, devuelve el original.
 *
 * `sharp` llega con Next.js y no está declarado como dependencia directa, así
 * que NO se da por hecho: si faltara, el catálogo se sigue generando con las
 * fotos tal cual —más pesado, pero completo—. Un catálogo pesado es un
 * problema; un catálogo que no sale es otro mucho mayor.
 */
let sharpModulo: unknown | null | undefined;
async function reescalar(
  bytes: Uint8Array,
  tipo: "jpg" | "png"
): Promise<{ bytes: Uint8Array; tipo: "jpg" | "png" }> {
  if (sharpModulo === undefined) {
    try {
      sharpModulo = (await import("sharp")).default;
    } catch {
      sharpModulo = null;
    }
  }
  if (!sharpModulo) return { bytes, tipo };

  try {
    const fn = sharpModulo as (b: Uint8Array) => {
      resize: (o: object) => { jpeg: (o: object) => { toBuffer: () => Promise<Buffer> } };
    };
    const salida = await fn(bytes)
      .resize({ width: ANCHO_REESCALADO, withoutEnlargement: true })
      .jpeg({ quality: CALIDAD_JPEG, mozjpeg: true })
      .toBuffer();
    // Si el "reescalado" saliera mayor que el original (fotos ya pequeñas),
    // se queda el original.
    if (salida.byteLength > 0 && salida.byteLength < bytes.byteLength) {
      return { bytes: new Uint8Array(salida), tipo: "jpg" };
    }
  } catch {
    // Una foto que sharp no sabe leer se incrusta tal cual.
  }
  return { bytes, tipo };
}

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

  // El nombre arranca DESPUÉS del logotipo: antes se solapaban y se leía
  // "STSTETECNI".
  drawText(ctx, COMPANY.name, logoX + logoSize + 18, 34, { bold: true, color: WHITE, y: PAGE_HEIGHT - 96 });
  drawText(ctx, "Calidad al mejor precio", logoX + logoSize + 18, 14, { color: WHITE, y: PAGE_HEIGHT - 120 });

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

/**
 * Las descripciones del catálogo vienen ESTRUCTURADAS: un párrafo de
 * presentación, encabezados con emoji ("⚙️ CARACTERÍSTICAS", "🔌 PUERTOS Y
 * CONECTIVIDAD") y listas con viñeta. Aplanarlo todo a un muro de texto,
 * como se hacía, desperdicia el trabajo de quien escribió la ficha y deja al
 * cliente sin poder localizar nada de un vistazo.
 *
 * Las fuentes estándar de PDF no tienen emojis, así que se usan como SEÑAL de
 * estructura y luego se quitan del texto visible.
 */
type LineaDescripcion =
  | { clase: "seccion"; texto: string }
  | { clase: "vineta"; texto: string }
  | { clase: "parrafo"; texto: string }
  | { clase: "espacio" };

/** Emoji o símbolo suelto al principio de la línea, que solo marca estructura. */
const PREFIJO_DECORATIVO = /^[\s\u{1F000}-\u{1FAFF}\u{2190}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]+/u;

function clasificarDescripcion(texto: string, titulo?: string): LineaDescripcion[] {
  const salida: LineaDescripcion[] = [];
  for (const cruda of String(texto).split(/\r?\n/)) {
    const sinDecorar = cruda.replace(PREFIJO_DECORATIVO, "").trim();
    if (!sinDecorar) {
      // Nunca dos espacios seguidos.
      if (salida.length > 0 && salida[salida.length - 1].clase !== "espacio") salida.push({ clase: "espacio" });
      continue;
    }
    if (/^[•·*-]\s+/.test(sinDecorar)) {
      salida.push({ clase: "vineta", texto: sinDecorar.replace(/^[•·*-]\s+/, "").trim() });
      continue;
    }
    // Encabezado: corto, en mayúsculas y sin puntuación final de frase.
    const letras = sinDecorar.replace(/[^\p{L}]/gu, "");
    const enMayusculas = letras.length > 0 && letras === letras.toUpperCase();
    if (enMayusculas && sinDecorar.length <= 48 && !/[.:,;]$/.test(sinDecorar)) {
      salida.push({ clase: "seccion", texto: sinDecorar });
      continue;
    }
    salida.push({ clase: "parrafo", texto: sinDecorar });
  }
  // La primera línea suele repetir el nombre del equipo, que ya está en la
  // cabecera de la ficha: se quita para no decirlo dos veces. Se compara por
  // letras y números, para que una diferencia de comillas o de emoji no
  // impida reconocerlo.
  const clave = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (salida.length > 0 && salida[0].clase !== "espacio") {
    const primera = clave((salida[0] as { texto: string }).texto);
    const esperado = titulo ? clave(titulo) : "";
    if (salida[0].clase === "seccion" || (esperado.length > 6 && primera === esperado)) salida.shift();
  }
  while (salida.length > 0 && salida[0].clase === "espacio") salida.shift();
  return salida;
}

/** Dibuja una imagen ajustada dentro de un cuadro, manteniendo proporción. */
function dibujarEnCuadro(ctx: BuildContext, img: PDFImage, x: number, y: number, lado: number): void {
  const escala = Math.min(lado / img.width, lado / img.height);
  const ancho = img.width * escala;
  const alto = img.height * escala;
  ctx.page.drawImage(img, { x: x + (lado - ancho) / 2, y: y + (lado - alto) / 2, width: ancho, height: alto });
}

/** Cuadro gris con el nombre de la marca, cuando no hay foto que poner. */
function dibujarMarcador(ctx: BuildContext, x: number, y: number, lado: number): void {
  ctx.page.drawRectangle({
    x, y, width: lado, height: lado,
    color: rgb(0.92, 0.94, 0.96), borderColor: BORDER_GRAY, borderWidth: 0.5,
  });
  const texto = "SISTETECNI";
  const size = lado > 100 ? 11 : 7;
  const ancho = ctx.fonts.bold.widthOfTextAtSize(texto, size);
  ctx.page.drawText(texto, {
    x: x + (lado - ancho) / 2, y: y + lado / 2 - size * 0.35,
    size, font: ctx.fonts.bold, color: TEXT_MUTED,
  });
}

/** Etiqueta redondeada (condición, garantía). */
function dibujarChip(ctx: BuildContext, texto: string, x: number, y: number): number {
  const size = 8.5;
  const ancho = ctx.fonts.bold.widthOfTextAtSize(texto, size) + 14;
  ctx.page.drawRectangle({
    x, y: y - 4, width: ancho, height: 17,
    color: CHIP_BG, borderColor: BORDER_GRAY, borderWidth: 0.5,
  });
  ctx.page.drawText(texto, { x: x + 7, y: y + 1, size, font: ctx.fonts.bold, color: BRAND_DARK });
  return ancho;
}

/**
 * Ficha de un producto: cabecera, galería con TODAS sus fotos,
 * características completas y descripción íntegra.
 *
 * Se dibuja en dos pasadas porque el alto no se sabe de antemano: primero se
 * mide el texto para saber cuánto ocupa, y solo entonces se decide si cabe en
 * la página o hay que empezar una nueva. Sin eso, una descripción larga
 * partía la ficha por la mitad.
 */
function drawFichaProducto(ctx: BuildContext, p: CatalogProduct, imagenes: (PDFImage | null)[], indice: number): void {
  const nombre = p.title || [p.brand, p.model].filter(Boolean).join(" ") || "Equipo";
  const textoX = MARGIN + FOTO_PRINCIPAL + 20;
  const textoAncho = CONTENT_WIDTH - FOTO_PRINCIPAL - 20;

  // ── Medición previa ──────────────────────────────────────────────────
  const nombreLineas = wrapText(nombre, ctx.fonts.bold, 15, textoAncho);
  const specs: [string, string][] = [];
  if (p.cpu) specs.push(["Procesador", p.cpu]);
  if (typeof p.ram === "number" && p.ram > 0) specs.push(["Memoria RAM", `${p.ram} GB`]);
  if (p.storage) specs.push(["Almacenamiento", p.storage]);
  if (p.screen) specs.push(["Pantalla", p.screen]);
  if (p.gpuModel) specs.push(["Gráficos", p.gpuModel]);

  const bloques = p.description ? clasificarDescripcion(p.description, nombre) : [];
  // Alto aproximado, solo para decidir el salto de página.
  const altoBloques = bloques.reduce((acc, b) => {
    if (b.clase === "espacio") return acc + 6;
    if (b.clase === "seccion") return acc + 20;
    const ancho = b.clase === "vineta" ? CONTENT_WIDTH - 40 : CONTENT_WIDTH - 24;
    return acc + wrapText(b.texto, ctx.fonts.regular, 9, ancho).length * 11.5;
  }, 0);

  const conFoto = imagenes.filter((i): i is PDFImage => i !== null);
  const miniaturas = Math.max(0, conFoto.length - 1);
  const filasMini = miniaturas > 0 ? Math.ceil(miniaturas / Math.floor((FOTO_PRINCIPAL + MINIATURA_GAP) / (MINIATURA + MINIATURA_GAP))) : 0;

  const altoColumnaFoto = FOTO_PRINCIPAL + (filasMini > 0 ? 8 + filasMini * (MINIATURA + MINIATURA_GAP) : 0);
  const altoColumnaTexto = nombreLineas.length * 19 + 26 + specs.length * 15 + 34;
  const altoDescripcion = bloques.length > 0 ? 24 + altoBloques : 0;
  const altoFicha = Math.max(altoColumnaFoto, altoColumnaTexto) + altoDescripcion + 34;

  // ── Salto de página ──────────────────────────────────────────────────
  // Se exige que quepa la ficha entera, o al menos su parte superior: una
  // ficha muy larga (descripción de 2.000 caracteres) no cabe nunca en una
  // página, y en ese caso se empieza en una limpia y se deja fluir.
  if (ctx.y - Math.min(altoFicha, ALTO_MINIMO_FICHA) < BOTTOM_LIMIT) newPage(ctx);

  const top = ctx.y;

  // Marco de la ficha. Se acota a lo que cabe en ESTA página: una descripción
  // larga continúa en la siguiente, y un rectángulo con el alto total se
  // saldría por abajo.
  const altoMarco = Math.min(altoFicha, top - BOTTOM_LIMIT + 10);
  ctx.page.drawRectangle({
    x: MARGIN - 6, y: top - altoMarco, width: CONTENT_WIDTH + 12, height: altoMarco,
    color: CARD_BG, borderColor: BORDER_GRAY, borderWidth: 0.8,
  });
  // Filo de color a la izquierda: da identidad sin recargar.
  ctx.page.drawRectangle({
    x: MARGIN - 6, y: top - altoMarco, width: 4, height: altoMarco, color: BRAND_BLUE,
  });

  // ── Galería ──────────────────────────────────────────────────────────
  const fotoX = MARGIN + 8;
  let fotoY = top - 16 - FOTO_PRINCIPAL;
  if (conFoto.length > 0) {
    ctx.page.drawRectangle({
      x: fotoX, y: fotoY, width: FOTO_PRINCIPAL, height: FOTO_PRINCIPAL,
      color: WHITE, borderColor: BORDER_GRAY, borderWidth: 0.5,
    });
    dibujarEnCuadro(ctx, conFoto[0], fotoX, fotoY, FOTO_PRINCIPAL);
  } else {
    dibujarMarcador(ctx, fotoX, fotoY, FOTO_PRINCIPAL);
  }

  // Resto de fotos del MISMO equipo, en miniaturas bajo la principal.
  if (miniaturas > 0) {
    const porFila = Math.floor((FOTO_PRINCIPAL + MINIATURA_GAP) / (MINIATURA + MINIATURA_GAP));
    let mx = fotoX;
    let my = fotoY - 8 - MINIATURA;
    conFoto.slice(1).forEach((img, i) => {
      if (i > 0 && i % porFila === 0) {
        mx = fotoX;
        my -= MINIATURA + MINIATURA_GAP;
      }
      ctx.page.drawRectangle({
        x: mx, y: my, width: MINIATURA, height: MINIATURA,
        color: WHITE, borderColor: BORDER_GRAY, borderWidth: 0.5,
      });
      dibujarEnCuadro(ctx, img, mx, my, MINIATURA);
      mx += MINIATURA + MINIATURA_GAP;
    });
    fotoY = my;
  }

  // ── Columna de texto ─────────────────────────────────────────────────
  let cursor = top - 26;

  // Número de la opción: es como el cliente la nombra por WhatsApp
  // ("el tercero"), así que el orden visible tiene que ser el mismo que el
  // del catálogo. Lo es: quien llama entrega la lista ya ordenada.
  const etiqueta = `OPCIÓN ${indice + 1}`;
  drawText(ctx, etiqueta, textoX, 8.5, { bold: true, color: BRAND_BLUE, y: cursor + 4 });
  cursor -= 12;

  for (const linea of nombreLineas) {
    drawText(ctx, linea, textoX, 15, { bold: true, color: BRAND_DARK, y: cursor });
    cursor -= 19;
  }

  // Precio, grande y con el acento de color.
  drawText(ctx, formatCOP(p.price), textoX, 21, { bold: true, color: ACCENT, y: cursor - 4 });
  cursor -= 32;

  // Características, una por línea y con su etiqueta: se leen mucho mejor
  // que la línea compacta separada por puntos que había antes.
  for (const [etiquetaSpec, valor] of specs) {
    drawText(ctx, `${etiquetaSpec}:`, textoX, 9, { bold: true, color: TEXT_MUTED, y: cursor });
    const sangria = 82;
    for (const linea of wrapText(valor, ctx.fonts.regular, 9, textoAncho - sangria).slice(0, 2)) {
      drawText(ctx, linea, textoX + sangria, 9, { color: TEXT_DARK, y: cursor });
      cursor -= 12;
    }
    if (specs.length > 0) cursor -= 3;
  }

  // Chips de condición y garantía.
  let chipX = textoX;
  if (p.condition) chipX += dibujarChip(ctx, p.condition, chipX, cursor - 4) + 6;
  if (typeof p.warrantyMonths === "number" && p.warrantyMonths > 0) {
    dibujarChip(ctx, `Garantía ${p.warrantyMonths} ${p.warrantyMonths === 1 ? "mes" : "meses"}`, chipX, cursor - 4);
  }

  // ── Descripción completa, respetando su estructura ───────────────────
  if (bloques.length > 0) {
    let dy = Math.min(fotoY, cursor - 24) - 12;

    // Si no queda sitio ni para el encabezado y un par de líneas, se pasa
    // entera a la página siguiente: un "DESCRIPCIÓN" solo al pie es peor que
    // un salto limpio.
    if (dy < BOTTOM_LIMIT + 40) {
      newPage(ctx);
      dy = ctx.y - 12;
    }

    drawText(ctx, "DESCRIPCIÓN", MARGIN + 6, 8.5, { bold: true, color: BRAND_BLUE, y: dy });
    ctx.page.drawLine({
      start: { x: MARGIN + 6, y: dy - 5 },
      end: { x: MARGIN + CONTENT_WIDTH - 6, y: dy - 5 },
      thickness: 0.5,
      color: BORDER_GRAY,
    });
    dy -= 20;

    const saltarSiHaceFalta = (alto: number) => {
      if (dy - alto < BOTTOM_LIMIT) {
        newPage(ctx);
        dy = ctx.y - 12;
      }
    };

    for (const bloque of bloques) {
      if (bloque.clase === "espacio") {
        dy -= 6;
        continue;
      }
      if (bloque.clase === "seccion") {
        saltarSiHaceFalta(24);
        dy -= 6;
        drawText(ctx, bloque.texto, MARGIN + 6, 9.5, { bold: true, color: BRAND_DARK, y: dy });
        dy -= 14;
        continue;
      }
      const esVineta = bloque.clase === "vineta";
      const x = MARGIN + (esVineta ? 20 : 6);
      const ancho = CONTENT_WIDTH - (esVineta ? 40 : 24);
      const lineas = wrapText(bloque.texto, ctx.fonts.regular, 9, ancho);
      lineas.forEach((linea, i) => {
        saltarSiHaceFalta(12);
        if (esVineta && i === 0) {
          // Punto de viñeta dibujado, no tecleado: el carácter "•" no existe
          // en las fuentes estándar del PDF.
          ctx.page.drawCircle({ x: MARGIN + 12, y: dy + 3, size: 1.6, color: BRAND_BLUE });
        }
        drawText(ctx, linea, x, 9, { color: TEXT_DARK, y: dy });
        dy -= 11.5;
      });
    }
    ctx.y = dy - CARD_GAP;
    return;
  }

  ctx.y = Math.min(fotoY, cursor) - CARD_GAP;
}

/**
 * Pie con paginación, al final y de una sola pasada.
 *
 * Se hace aquí y no al crear cada página porque el total no se conoce hasta
 * que está todo dibujado: una descripción larga puede añadir páginas.
 */
function drawPiePaginas(ctx: BuildContext): void {
  const paginas = ctx.doc.getPages();
  paginas.forEach((pagina, i) => {
    // La portada no lleva pie.
    if (i === 0) return;
    const texto = `${COMPANY.name}  ·  ${i + 1} de ${paginas.length}`;
    const size = 8;
    const ancho = ctx.fonts.regular.widthOfTextAtSize(texto, size);
    pagina.drawLine({
      start: { x: MARGIN, y: 44 },
      end: { x: MARGIN + CONTENT_WIDTH, y: 44 },
      thickness: 0.5,
      color: BORDER_GRAY,
    });
    pagina.drawText(texto, {
      x: PAGE_WIDTH - MARGIN - ancho,
      y: 30,
      size,
      font: ctx.fonts.regular,
      color: TEXT_MUTED,
    });
  });
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

  // P20.28D — TODAS las fotos de cada equipo, no solo la primera.
  //
  // El cliente decide una compra con esto delante: enseñarle una sola foto de
  // un portátil del que hay seis le obliga a pedirlas por WhatsApp. Se acota
  // por producto (`maxImagesPerProduct`) para que un equipo con veinte fotos
  // no infle el PDF por encima de lo que WhatsApp acepta.
  //
  // Cada URL conserva su posición, así que las fotos de un producto nunca se
  // mezclan con las de otro: el índice manda, no el orden de llegada.
  const maxPorProducto = opciones.maxImagesPerProduct ?? 12;
  const plan: { producto: number; url: string }[] = [];
  lista.forEach((p, i) => {
    const urls = Array.isArray(p.images) ? p.images.filter((u) => typeof u === "string" && u.length > 0) : [];
    for (const url of urls.slice(0, maxPorProducto)) plan.push({ producto: i, url });
  });

  const descargadas = await descargarEnLotes(plan, concurrencia, async ({ url }) =>
    allowed.length > 0 ? descargarImagen(url, { allowed, fetchImpl, timeoutMs }) : null
  );

  // Una misma URL puede repetirse entre productos; se embebe una sola vez.
  const embebidas = new Map<string, PDFImage | null>();
  const porProducto: PDFImage[][] = lista.map(() => []);
  for (let i = 0; i < plan.length; i++) {
    const { producto, url } = plan[i];
    const descarga = descargadas[i];
    if (!descarga) continue;
    if (!embebidas.has(url)) {
      try {
        const lista = await reescalar(descarga.bytes, descarga.tipo);
        embebidas.set(url, lista.tipo === "png" ? await doc.embedPng(lista.bytes) : await doc.embedJpg(lista.bytes));
      } catch {
        // Imagen corrupta pese al content-type: se omite esa foto, nunca se
        // aborta el catálogo.
        embebidas.set(url, null);
      }
    }
    const img = embebidas.get(url);
    if (img) porProducto[producto].push(img);
  }

  lista.forEach((producto, i) => {
    const fotos = porProducto[i].length > 0 ? porProducto[i] : placeholder ? [placeholder] : [];
    drawFichaProducto(ctx, producto, fotos, i);
  });

  drawPiePaginas(ctx);

  return doc.save();
}
