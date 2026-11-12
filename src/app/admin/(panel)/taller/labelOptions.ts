export const sizes = [["small", "Equipo pequeña · QR 3 cm (más etiquetas por hoja)"], ["medium", "Equipo mediana · QR 4 cm"], ["large", "Equipo grande · QR 5 cm (fácil de leer)"], ["ram", "Memoria RAM · 1 cm de alto, hoja carta"], ["piece", "Pieza pequeña · disco, cargador, batería… (1,4 cm de alto, hoja carta)"], ["custom", "Libre · usted elige medida y texto"]] as const;
export type LabelSizeId = (typeof sizes)[number][0];
import { labelKinds, labelKindName, kindPrefixes, type LabelKind } from "@/lib/workshop/partKinds";
export { labelKinds, labelKindName, kindPrefixes, type LabelKind };
// Tamaño sugerido por tipo: memoria en tira de 1 cm, piezas pequeñas en tira de 1,4 cm, equipos cuadrados.
export const defaultSizeFor = (k: LabelKind): LabelSizeId => (k === "computer" ? "medium" : k === "ram" ? "ram" : "piece");
export const kindExample = (k: LabelKind) => (k === "computer" ? "STU-000123" : `${kindPrefixes[k]}-0001`);
export const captions = ["Equipo", "Memoria RAM", "Disco", "Cargador", "Batería", "Pantalla", "Ratón", "Forro / maleta", "Teclado"];
export function pdfUrl(base64: string) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}
