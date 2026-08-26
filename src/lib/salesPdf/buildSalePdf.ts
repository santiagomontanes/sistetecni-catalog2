/**
 * Generador del PDF "COMPROBANTE DE VENTA" — función pura, sin acceso a
 * red ni a Supabase: recibe el DTO de la venta YA CARGADO y construye el
 * PDF exclusivamente a partir de ese snapshot (nunca vuelve a consultar
 * products, ver punto 13 del pedido: "PDF inmutable").
 *
 * Usa pdf-lib (sin Chromium, sin binarios nativos — corre en el runtime
 * Node de Vercel). El logo se dibuja con primitivas nativas (rectángulo +
 * texto "ST"), replicando public/logo.svg, en vez de convertir el SVG a
 * PNG: evita agregar una dependencia de conversión con binarios nativos
 * (riesgo real en serverless) solo para una marca de 2 formas. Se pierde
 * el radio de esquina redondeada del SVG original — diferencia visual
 * menor, aceptable para un comprobante interno.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { COMPANY } from "../../config/company";
import { formatCOP } from "../personalizadorUi";
import type { AdminSaleDetailDTO } from "../salesAdmin/types";

const PAGE_WIDTH = 595.28; // A4 en puntos
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_LIMIT = 70;

const BRAND_BLUE: RGB = rgb(0x1a / 255, 0x56 / 255, 0xdb / 255);
const TEXT_DARK: RGB = rgb(0.12, 0.14, 0.18);
const TEXT_MUTED: RGB = rgb(0.42, 0.45, 0.5);
const BORDER_GRAY: RGB = rgb(0.85, 0.87, 0.9);
const WHITE: RGB = rgb(1, 1, 1);

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  nequi: "Nequi",
  daviplata: "Daviplata",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pagado: "Pagado",
  pendiente: "Pendiente",
  parcial: "Parcial",
};

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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(iso)
  );
}

/** Corta `text` en líneas que caben en `maxWidth` con `font`/`size` — pdf-lib no envuelve texto automáticamente. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

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

function newPage(ctx: BuildContext): void {
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN;
}

function ensureSpace(ctx: BuildContext, neededHeight: number): void {
  if (ctx.y - neededHeight < BOTTOM_LIMIT) {
    newPage(ctx);
  }
}

function drawText(
  ctx: BuildContext,
  text: string,
  x: number,
  size: number,
  opts: { bold?: boolean; color?: RGB; align?: "left" | "right" } = {}
): void {
  const font = opts.bold ? ctx.fonts.bold : ctx.fonts.regular;
  const color = opts.color ?? TEXT_DARK;
  const width = font.widthOfTextAtSize(text, size);
  const drawX = opts.align === "right" ? x - width : x;
  ctx.page.drawText(text, { x: drawX, y: ctx.y, size, font, color });
}

function drawLogo(ctx: BuildContext, x: number, y: number): void {
  const size = 32;
  ctx.page.drawRectangle({ x, y: y - size, width: size, height: size, color: BRAND_BLUE });
  const font = ctx.fonts.bold;
  const label = "ST";
  const labelSize = 14;
  const labelWidth = font.widthOfTextAtSize(label, labelSize);
  ctx.page.drawText(label, {
    x: x + (size - labelWidth) / 2,
    y: y - size / 2 - labelSize * 0.36,
    size: labelSize,
    font,
    color: WHITE,
  });
}

function drawHeader(ctx: BuildContext, sale: AdminSaleDetailDTO): void {
  const top = ctx.y;
  drawLogo(ctx, MARGIN, top);

  const textX = MARGIN + 42;
  ctx.y = top - 8;
  drawText(ctx, COMPANY.name, textX, 16, { bold: true });
  ctx.y -= 16;
  drawText(ctx, COMPANY.documentTitle, textX, 12, { bold: true, color: BRAND_BLUE });
  ctx.y -= 13;
  drawText(ctx, `NIT: ${COMPANY.nit}`, textX, 9, { color: TEXT_MUTED });
  ctx.y -= 12;
  drawText(ctx, `https://${COMPANY.website}`, textX, 9, { color: TEXT_MUTED });

  // Número y fecha, alineados a la derecha en la misma zona del encabezado.
  const rightX = MARGIN + CONTENT_WIDTH;
  const leftY = ctx.y;
  ctx.y = top - 8;
  drawText(ctx, sale.saleNumber, rightX, 13, { bold: true, align: "right" });
  ctx.y -= 16;
  drawText(ctx, `Fecha: ${formatDate(sale.createdAt)}`, rightX, 9, { color: TEXT_MUTED, align: "right" });
  ctx.y = Math.min(ctx.y, leftY);

  ctx.y = top - 44;
  drawText(ctx, COMPANY.documentSubtitle, MARGIN, 7.5, { color: TEXT_MUTED });
  ctx.y -= 14;

  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y },
    thickness: 1,
    color: BORDER_GRAY,
  });
  ctx.y -= 18;
}

function drawCustomer(ctx: BuildContext, sale: AdminSaleDetailDTO): void {
  drawText(ctx, "DATOS DEL CLIENTE", MARGIN, 10, { bold: true });
  ctx.y -= 16;

  const rows: Array<[string, string]> = [
    ["Nombre:", sale.customerName],
    ["Documento:", sale.customerDocument],
    ["Celular:", sale.customerPhone],
    ["Correo:", sale.customerEmail ?? "—"],
  ];
  for (const [label, value] of rows) {
    drawText(ctx, label, MARGIN, 9.5, { bold: true, color: TEXT_MUTED });
    drawText(ctx, value, MARGIN + 70, 9.5);
    ctx.y -= 14;
  }
  ctx.y -= 8;
}

const COL = {
  qty: MARGIN,
  qtyWidth: 35,
  desc: MARGIN + 40,
  descWidth: 250,
  unit: MARGIN + 40 + 250 + 10,
  unitWidth: 90,
  subtotal: MARGIN + CONTENT_WIDTH,
};

function drawItemsTableHeader(ctx: BuildContext): void {
  drawText(ctx, "DATOS DEL PRODUCTO", MARGIN, 10, { bold: true });
  ctx.y -= 16;

  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - 4,
    width: CONTENT_WIDTH,
    height: 18,
    color: rgb(0.95, 0.96, 0.98),
  });
  const headerY = ctx.y;
  drawText(ctx, "Cant.", COL.qty + 4, 8.5, { bold: true, color: TEXT_MUTED });
  drawText(ctx, "Descripción", COL.desc, 8.5, { bold: true, color: TEXT_MUTED });
  drawText(ctx, "V. Unitario", COL.unit + COL.unitWidth, 8.5, { bold: true, color: TEXT_MUTED, align: "right" });
  drawText(ctx, "Subtotal", COL.subtotal, 8.5, { bold: true, color: TEXT_MUTED, align: "right" });
  ctx.y = headerY - 18;
}

function drawItems(ctx: BuildContext, sale: AdminSaleDetailDTO): void {
  drawItemsTableHeader(ctx);

  for (const item of sale.items) {
    const descLines = wrapText(item.productName, ctx.fonts.regular, 9, COL.descWidth);
    const rowHeight = Math.max(descLines.length, 1) * 12 + 6;

    ensureSpace(ctx, rowHeight);
    if (ctx.y === PAGE_HEIGHT - MARGIN) {
      // Se acaba de crear una página nueva dentro del loop — repetir cabecera de tabla.
      drawItemsTableHeader(ctx);
    }

    const rowTop = ctx.y;
    drawText(ctx, String(item.quantity), COL.qty + 4, 9);
    descLines.forEach((line, i) => {
      ctx.y = rowTop - i * 12;
      drawText(ctx, line, COL.desc, 9);
    });
    ctx.y = rowTop;
    drawText(ctx, formatCOP(item.unitPriceCop), COL.unit + COL.unitWidth, 9, { align: "right" });
    drawText(ctx, formatCOP(item.subtotalCop), COL.subtotal, 9, { align: "right" });

    ctx.y = rowTop - rowHeight;
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y + 4 },
      end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y + 4 },
      thickness: 0.5,
      color: BORDER_GRAY,
    });
  }
  ctx.y -= 10;
}

function drawTotals(ctx: BuildContext, sale: AdminSaleDetailDTO): void {
  ensureSpace(ctx, 70);
  const labelX = MARGIN + CONTENT_WIDTH - 180;

  const rows: Array<[string, string, boolean]> = [
    ["Subtotal:", formatCOP(sale.subtotalCop), false],
    ["Descuento:", formatCOP(sale.discountCop), false],
    ["TOTAL:", formatCOP(sale.totalCop), true],
  ];
  for (const [label, value, bold] of rows) {
    drawText(ctx, label, labelX, bold ? 11 : 9.5, { bold, color: bold ? TEXT_DARK : TEXT_MUTED });
    drawText(ctx, value, MARGIN + CONTENT_WIDTH, bold ? 11 : 9.5, { bold, align: "right" });
    ctx.y -= bold ? 18 : 14;
  }
  ctx.y -= 10;
}

function drawPaymentInfo(ctx: BuildContext, sale: AdminSaleDetailDTO): void {
  ensureSpace(ctx, 90);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y },
    thickness: 1,
    color: BORDER_GRAY,
  });
  ctx.y -= 18;

  const methodLabel = PAYMENT_METHOD_LABELS[sale.paymentMethod] ?? sale.paymentMethod;
  const statusLabel = PAYMENT_STATUS_LABELS[sale.paymentStatus] ?? sale.paymentStatus;

  drawText(ctx, "Método de pago:", MARGIN, 9.5, { bold: true, color: TEXT_MUTED });
  drawText(ctx, methodLabel, MARGIN + 110, 9.5);
  drawText(ctx, "Estado:", MARGIN + 260, 9.5, { bold: true, color: TEXT_MUTED });
  drawText(ctx, statusLabel, MARGIN + 320, 9.5);
  ctx.y -= 16;

  drawText(ctx, "Garantía:", MARGIN, 9.5, { bold: true, color: TEXT_MUTED });
  drawText(ctx, `${sale.warrantyMonths} meses`, MARGIN + 110, 9.5);
  ctx.y -= 16;

  if (sale.notes) {
    drawText(ctx, "Observaciones:", MARGIN, 9.5, { bold: true, color: TEXT_MUTED });
    ctx.y -= 13;
    const lines = wrapText(sale.notes, ctx.fonts.regular, 9, CONTENT_WIDTH);
    for (const line of lines) {
      ensureSpace(ctx, 12);
      drawText(ctx, line, MARGIN, 9);
      ctx.y -= 12;
    }
    ctx.y -= 4;
  }
}

function drawFooter(ctx: BuildContext): void {
  ensureSpace(ctx, 90);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: MARGIN + CONTENT_WIDTH, y: ctx.y },
    thickness: 1,
    color: BORDER_GRAY,
  });
  ctx.y -= 18;

  drawText(ctx, "Vendido por:", MARGIN, 9, { color: TEXT_MUTED });
  ctx.y -= 13;
  drawText(ctx, COMPANY.name, MARGIN, 10, { bold: true });
  ctx.y -= 13;
  drawText(ctx, `NIT ${COMPANY.nit}`, MARGIN, 9, { color: TEXT_MUTED });
  ctx.y -= 22;

  drawText(ctx, COMPANY.thankYouMessage, MARGIN, 9.5, { bold: true });
  ctx.y -= 13;
  drawText(ctx, COMPANY.warrantyReminder, MARGIN, 9);
  ctx.y -= 18;

  const legalLines = wrapText(COMPANY.legalNotice, ctx.fonts.regular, 7.5, CONTENT_WIDTH);
  for (const line of legalLines) {
    drawText(ctx, line, MARGIN, 7.5, { color: TEXT_MUTED });
    ctx.y -= 10;
  }
}

export async function buildSalePdfBytes(sale: AdminSaleDetailDTO): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
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

  drawHeader(ctx, sale);
  drawCustomer(ctx, sale);
  drawItems(ctx, sale);
  drawTotals(ctx, sale);
  drawPaymentInfo(ctx, sale);
  drawFooter(ctx);

  return doc.save();
}
