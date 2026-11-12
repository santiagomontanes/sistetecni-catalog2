import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

// Tamaños predefinidos. «ram»: etiqueta horizontal de 0,8 cm (QR + STU al lado) en hoja carta, para memorias RAM.
// «piece»: horizontal de 1,2 cm para piezas pequeñas (disco, cargador, batería…). Cualquier otra medida va como LabelSpec.
export type LabelLayout = "square" | "strip";
export interface LabelSpec { layout: LabelLayout; qrCm: number; caption?: string; sheet?: "a4" | "letter" }
export const LABEL_PRESETS = {
  small: { layout: "square", qrCm: 3 },
  medium: { layout: "square", qrCm: 4 },
  large: { layout: "square", qrCm: 5 },
  ram: { layout: "strip", qrCm: 0.8, sheet: "letter" },
  piece: { layout: "strip", qrCm: 1.2, sheet: "letter" },
} as const satisfies Record<string, LabelSpec>;
export type LabelSize = keyof typeof LABEL_PRESETS;
export const QR_CM_MIN = 0.6, QR_CM_MAX = 8;
export const CAPTION_MAX = 24;

const CM = 28.3465;
const A4 = { w: 21 * CM, h: 29.7 * CM };
const LETTER = { w: 21.59 * CM, h: 27.94 * CM };
const MARGIN = 1 * CM;
const QUIET_MODULES = 3;
const PAD = 0.25 * CM;

// El texto libre es solo para leer: la fuente estándar del PDF no soporta todos los caracteres.
export function cleanCaption(raw?: string): string {
  return (raw ?? "").replace(/[^\x20-\x7E\u00A1-\u00FF]/g, "").replace(/\s+/g, " ").trim().slice(0, CAPTION_MAX);
}

// El QR contiene únicamente el STU: sin URL, PII ni servicios externos.
export async function buildLabelsPdf(codes: string[], size: LabelSize | LabelSpec, title: string): Promise<Uint8Array> {
  if (!codes.length) throw new Error("labels_empty");
  const spec: LabelSpec = typeof size === "string" ? LABEL_PRESETS[size] : size;
  if (!(spec.qrCm >= QR_CM_MIN && spec.qrCm <= QR_CM_MAX)) throw new Error("labels_bad_size");
  const caption = cleanCaption(spec.caption);
  const pdf = await PDFDocument.create();
  pdf.setTitle(title); pdf.setCreator("SISTETECNI ERP");
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const strip = spec.layout === "strip";
  const sheet = (spec.sheet ?? (strip ? "letter" : "a4")) === "letter" ? LETTER : A4;
  const side = spec.qrCm * CM;
  const tight = side < 1.5 * CM;
  const pad = strip && tight ? 0.1 * CM : PAD, quiet = strip && tight ? 1 : QUIET_MODULES;
  const widest = codes.reduce((a, b) => (b.length > a.length ? b : a));
  const stripFs = Math.min(14, Math.max(6, side * 0.264)), capFs = stripFs * 0.85;
  const stripTextW = strip ? Math.max(bold.widthOfTextAtSize(widest, stripFs), caption ? regular.widthOfTextAtSize(caption, capFs) : 0) : 0;
  const textH = strip ? 0 : (caption ? 1.1 : 0.6) * CM;
  const cellW = strip ? pad + side + 0.12 * CM + stripTextW + pad : side + pad * 2, cellH = side + textH + pad * 2;
  const cols = Math.max(1, Math.floor((sheet.w - MARGIN * 2) / cellW));
  const rows = Math.max(1, Math.floor((sheet.h - MARGIN * 2 - 0.8 * CM) / cellH));
  const perPage = cols * rows;
  const pages = Math.ceil(codes.length / perPage);
  const gridW = cols * cellW, x0 = (sheet.w - gridW) / 2, yTop = sheet.h - MARGIN;
  for (let p = 0; p < pages; p++) {
    const page = pdf.addPage([sheet.w, sheet.h]);
    codes.slice(p * perPage, (p + 1) * perPage).forEach((code, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = x0 + col * cellW, y = yTop - (row + 1) * cellH;
      // Borde de corte tenue.
      page.drawRectangle({ x, y, width: cellW, height: cellH, borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.5, borderDashArray: [3, 3] });
      const qr = QRCode.create(code, { errorCorrectionLevel: "M" });
      const n = qr.modules.size, mod = side / (n + quiet * 2);
      const qx = x + pad, qy = y + pad + textH;
      page.drawRectangle({ x: qx, y: qy, width: side, height: side, color: rgb(1, 1, 1) });
      for (let r = 0; r < n; r++) {
        let c = 0;
        while (c < n) {
          if (!qr.modules.get(r, c)) { c++; continue; }
          let end = c; while (end < n && qr.modules.get(r, end)) end++;
          page.drawRectangle({ x: qx + (quiet + c) * mod, y: qy + side - (quiet + r + 1) * mod, width: (end - c) * mod, height: mod, color: rgb(0, 0, 0) });
          c = end;
        }
      }
      if (strip) {
        const tx = qx + side + 0.12 * CM, mid = qy + side / 2;
        if (!caption) { page.drawText(code, { x: tx, y: mid - stripFs * 0.35, size: stripFs, font: bold, color: rgb(0, 0, 0) }); return; }
        page.drawText(code, { x: tx, y: mid + stripFs * 0.12, size: stripFs, font: bold, color: rgb(0, 0, 0) });
        page.drawText(caption, { x: tx, y: mid - capFs * 1.05, size: capFs, font: regular, color: rgb(0, 0, 0) });
        return;
      }
      const fs = Math.min(11, side / CM * 3.2);
      const tw = bold.widthOfTextAtSize(code, fs);
      page.drawText(code, { x: x + (cellW - tw) / 2, y: y + PAD + 0.12 * CM, size: fs, font: bold, color: rgb(0, 0, 0) });
      if (caption) {
        const cfs = Math.min(fs * 0.85, (cellW - pad * 2) / Math.max(1, regular.widthOfTextAtSize(caption, 1)));
        page.drawText(caption, { x: x + (cellW - regular.widthOfTextAtSize(caption, cfs)) / 2, y: y + PAD + 0.12 * CM + fs + 3, size: cfs, font: regular, color: rgb(0, 0, 0) });
      }
    });
    const footer = `${title} · ${codes.length} etiquetas · página ${p + 1} de ${pages}`;
    page.drawText(footer, { x: MARGIN, y: 0.5 * CM, size: 7, font: regular, color: rgb(0.4, 0.4, 0.4) });
  }
  return pdf.save();
}
