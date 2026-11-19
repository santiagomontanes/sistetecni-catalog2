// Listas fijas para el Taller: el operador elige, no escribe. Si una pieza ya trae un valor fuera de la lista (datos viejos), el selector lo conserva.
export const screenInchOptions = [11.5, 14, 15.6, 17] as const;
export const screenTypeOptions = [{ value: "standard", label: "LED" }, { value: "slim", label: "LED Slim" }, { value: "small", label: "Small" }] as const;
export const screenTypeLabel = (v: string) => (v === "special" ? "Especial" : screenTypeOptions.find(o => o.value === v)?.label ?? "Sin comprobar");

export const ramCapacityOptions = [2, 4, 8, 16, 32, 64] as const;
export const ramGenerationOptions = ["DDR2", "DDR3", "DDR3L", "DDR4", "DDR5"] as const;
export const ramFormatOptions = ["SO-DIMM", "DIMM"] as const;

export const storageCapacityOptions = [120, 128, 240, 256, 480, 500, 512, 960, 1000, 2000] as const;
export const storageTechnologyOptions = ["HDD", "SSD"] as const;
export const storageInterfaceOptions = ["SATA", "NVMe", "IDE", "SAS"] as const;
export const storageFormatOptions = ["2.5\"", "3.5\"", "M.2", "mSATA"] as const;

export const chargerVoltageOptions = [5, 12, 15, 18.5, 19, 19.5, 20] as const;
export const chargerCurrentOptions = [2, 2.31, 3.25, 3.42, 4.62, 6.15] as const;
export const chargerWattsOptions = [30, 45, 65, 90, 120, 135] as const;

export const capacityLabel = (gb: number) => (gb >= 1000 ? `${gb / 1000} TB` : `${gb} GB`);
