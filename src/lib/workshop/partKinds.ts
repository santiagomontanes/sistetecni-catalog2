// Tipos de pieza que se pueden registrar y su nombre visible. El QR sigue siendo el STU;
// el código corto (D-0001, M-0001…) es el nombre que se muestra al personal.
export const partKinds = ["ram", "storage", "charger", "battery", "screen", "mouse", "case", "keyboard"] as const;
export type PartKind = (typeof partKinds)[number];

export const partKindNames: Record<PartKind, string> = {
  ram: "RAM", storage: "Disco", charger: "Cargador", battery: "Batería", screen: "Pantalla", mouse: "Ratón", case: "Forro / maleta", keyboard: "Teclado",
};

// Piezas que solo llevan una descripción libre (no tienen capacidad, formato ni conector).
export const descriptiveKinds: readonly PartKind[] = ["battery", "screen", "mouse", "case", "keyboard"];

export const unitName = (u: { display_code?: string | null; unit_code: string }) => u.display_code ?? u.unit_code;
