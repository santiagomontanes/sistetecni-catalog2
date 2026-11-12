// Tipos de pieza que se pueden registrar. Cada tipo tiene su propio código, que es también el que lleva el QR:
// STUD-0001 disco, STUM-0001 memoria RAM, STUSB-0001 USB, STUC-0001 cargador, STUB-0001 batería, STUP-0001 pantalla,
// STUW-0001 WiFi, STUBT-0001 Bluetooth, STUR-0001 ratón, STUF-0001 forro/maleta, STUT-0001 teclado, STUO-0001 otro.
// Los computadores siguen en STU-000123. Debe coincidir con erp_kind_prefix() en la base de datos.
export const partKinds = ["storage", "ram", "usb", "charger", "battery", "screen", "wifi", "bluetooth", "mouse", "case", "keyboard", "other"] as const;
export type PartKind = (typeof partKinds)[number];

export const partKindNames: Record<PartKind, string> = {
  ram: "RAM", storage: "Disco", charger: "Cargador", battery: "Batería", screen: "Pantalla", mouse: "Ratón", case: "Forro / maleta", keyboard: "Teclado",
  usb: "USB", wifi: "WiFi", bluetooth: "Bluetooth", other: "Otro / opcional",
};

export const kindPrefixes: Record<PartKind, string> = {
  storage: "STUD", ram: "STUM", usb: "STUSB", charger: "STUC", battery: "STUB", screen: "STUP", wifi: "STUW", bluetooth: "STUBT", mouse: "STUR", case: "STUF", keyboard: "STUT", other: "STUO",
};

// Piezas que solo llevan una descripción libre (no tienen capacidad, formato ni conector).
export const descriptiveKinds: readonly PartKind[] = ["battery", "screen", "mouse", "case", "keyboard", "usb", "wifi", "bluetooth", "other"];

// Tipos de etiqueta que se pueden generar: el computador (STU-) y cada tipo de pieza.
export type LabelKind = "computer" | PartKind;
export const labelKinds: readonly LabelKind[] = ["computer", ...partKinds];
export const labelKindName = (k: LabelKind) => (k === "computer" ? "Equipo" : partKindNames[k]);

export const unitName = (u: { unit_code: string }) => u.unit_code;
