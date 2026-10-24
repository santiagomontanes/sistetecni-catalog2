import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

export const LABEL_SIZES = { small: 3, medium: 4, large: 5 } as const;
export type LabelSize = keyof typeof LABEL_SIZES;

const CM = 28.3465;
const A4 = { w: 21 * CM, h: 29.7 * CM };
const MARGIN = 1 * CM;
const QUIET_MODULES = 3;
const PAD = 0.25 * CM;

// El QR contiene únicamente el STU: sin URL, PII ni servicios externos.
export async function buildLabelsPdf(codes: string[], size: LabelSize, title: string): Promise<Uint8Array> {
  if (!codes.length) throw new Error("labels_empty");
  const pdf = await PDFDocument.create();
  pdf.setTitle(title); pdf.setCreator("SISTETECNI ERP");
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const side = LABEL_SIZES[size] * CM;
  const textH = 0.6 * CM;
  const cellW = side + PAD * 2, cellH = side + textH + PAD * 2;
  const cols = Math.max(1, Math.floor((A4.w - MARGIN * 2) / cellW));
  const rows = Math.max(1, Math.floor((A4.h - MARGIN * 2 - 0.8 * CM) / cellH));
  const perPage = cols * rows;
  const pages = Math.ceil(codes.length / perPage);
  const gridW = cols * cellW, x0 = (A4.w - gridW) / 2, yTop = A4.h - MARGIN;
  for (let p = 0; p < pages; p++) {
    const page = pdf.addPage([A4.w, A4.h]);
    codes.slice(p * perPage, (p + 1) * perPage).forEach((code, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = x0 + col * cellW, y = yTop - (row + 1) * cellH;
      // Borde de corte tenue.
      page.drawRectangle({ x, y, width: cellW, height: cellH, borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.5, borderDashArray: [3, 3] });
      const qr = QRCode.create(code, { errorCorrectionLevel: "M" });
      const n = qr.modules.size, mod = side / (n + QUIET_MODULES * 2);
      const qx = x + PAD, qy = y + PAD + textH;
      page.drawRectangle({ x: qx, y: qy, width: side, height: side, color: rgb(1, 1, 1) });
      for (let r = 0; r < n; r++) {
        let c = 0;
        while (c < n) {
          if (!qr.modules.get(r, c)) { c++; continue; }
          let end = c; while (end < n && qr.modules.get(r, end)) end++;
          page.drawRectangle({ x: qx + (QUIET_MODULES + c) * mod, y: qy + side - (QUIET_MODULES + r + 1) * mod, width: (end - c) * mod, height: mod, color: rgb(0, 0, 0) });
          c = end;
        }
      }
      const fs = Math.min(11, side / CM * 3.2);
      const tw = bold.widthOfTextAtSize(code, fs);
      page.drawText(code, { x: x + (cellW - tw) / 2, y: y + PAD + 0.12 * CM, size: fs, font: bold, color: rgb(0, 0, 0) });
    });
    const footer = `${title} · ${codes.length} etiquetas · página ${p + 1} de ${pages}`;
    page.drawText(footer, { x: MARGIN, y: 0.5 * CM, size: 7, font: regular, color: rgb(0.4, 0.4, 0.4) });
  }
  return pdf.save();
}
