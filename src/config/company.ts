/**
 * Datos fijos del vendedor (SISTETECNI) — única fuente de verdad para el
 * módulo de ventas/comprobantes. No se repiten hardcodeados en componentes
 * ni en el generador de PDF: todos importan esta constante.
 */
export const COMPANY = {
  name: "SISTETECNI",
  nit: "13367624",
  website: "sistetecni.com",
  /** Nombre del documento — NUNCA "factura electrónica": no hay integración DIAN. */
  documentTitle: "COMPROBANTE DE VENTA",
  documentSubtitle:
    "Documento interno de venta - No reemplaza la factura electrónica cuando esta sea legalmente exigible",
  legalNotice:
    "Documento interno de venta. No sustituye la factura electrónica cuando esta sea legalmente exigible.",
  thankYouMessage: "Gracias por confiar en SISTETECNI.",
  warrantyReminder: "Conserve este documento para efectos de garantía.",
  defaultWarrantyMonths: 6,
} as const;
