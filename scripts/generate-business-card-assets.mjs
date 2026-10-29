import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Keep this address stable: printed QRs and programmed NFC tags depend on it.
const url = "https://sistetecni.com/tarjeta";
const output = fileURLToPath(new URL("../public/tarjeta/", import.meta.url));
await mkdir(output, { recursive: true });
const options = { errorCorrectionLevel: "Q", margin: 4, color: { dark: "#000000", light: "#ffffff" } };
const png = await QRCode.toBuffer(url, { ...options, width: 1200 });
await writeFile(`${output}sistetecni-qr.png`, png);
await writeFile(`${output}sistetecni-qr.svg`, await QRCode.toString(url, { ...options, type: "svg" }));
await writeFile(`${output}enlace-nfc.txt`, `${url}\n`);

const pdf = await PDFDocument.create();
pdf.setTitle("Sistetecni · Santiago Montañes · Tarjeta QR");
pdf.setAuthor("Sistetecni");
pdf.setSubject(`Tarjeta digital: ${url}`);
const page = pdf.addPage([297.64, 419.53]); // A6: 105 × 148 mm.
const regular = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const navy = rgb(16 / 255, 35 / 255, 68 / 255);
const blue = rgb(36 / 255, 89 / 255, 232 / 255);
function centered(text, y, size, font = regular, color = navy) {
  page.drawText(text, { x: (page.getWidth() - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });
}
page.drawRectangle({ x: 0, y: 299, width: 297.64, height: 120.53, color: navy });
centered("SISTETECNI", 382, 22, bold, rgb(1, 1, 1));
centered("Santiago Montañes", 346, 17, bold, rgb(1, 1, 1));
centered("Representante legal", 325, 10, regular, rgb(.76, .83, .96));
centered("Escanea para abrir mi tarjeta", 275, 12, bold);
const image = await pdf.embedPng(png);
page.drawImage(image, { x: 53.82, y: 69, width: 190, height: 190 });
centered("sistetecni.com/tarjeta", 51, 12, bold, blue);
centered("Local 151 · Centro Comercial Intercentro", 30, 9);
centered("Bogotá, Colombia", 15, 9);
await writeFile(`${output}sistetecni-qr-imprimir.pdf`, await pdf.save());
console.log(`QR PNG, SVG, PDF A6 y enlace NFC generados: ${url}`);
