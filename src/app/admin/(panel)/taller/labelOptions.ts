export const sizes = [["small", "Equipo pequeña · QR 3 cm (más etiquetas por hoja)"], ["medium", "Equipo mediana · QR 4 cm"], ["large", "Equipo grande · QR 5 cm (fácil de leer)"], ["ram", "Memoria RAM · 1 cm de alto, hoja carta"], ["piece", "Pieza pequeña · disco, cargador, batería… (1,4 cm de alto, hoja carta)"], ["custom", "Libre · usted elige medida y texto"]] as const;
export type LabelSizeId = (typeof sizes)[number][0];
export const captions = ["Equipo", "Memoria RAM", "Disco", "Cargador", "Batería", "Pantalla", "Ratón", "Forro / maleta", "Teclado"];
export function pdfUrl(base64: string) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}
