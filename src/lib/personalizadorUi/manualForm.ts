/**
 * Flujo "Personalizar características" (punto 4 del pedido) — a diferencia
 * de "Ayúdame a elegir", aquí el cliente define los requisitos técnicos
 * directamente. Los valores permitidos son listas cerradas (selects), no
 * campos libres, para que nunca lleguen valores fuera de lo que B3 sabe
 * interpretar. No se ofrece "upgrade de CPU/GPU/pantalla" — esas siguen
 * siendo características BASE del equipo (mismo principio de B3).
 */
import type {
  CustomerRequirements,
  GpuRequirement,
  ScreenSizeRange,
  TouchRequirement,
} from "../personalizador";

export const RAM_OPTIONS_GB = [4, 8, 16, 32, 64] as const;
export const STORAGE_OPTIONS_GB = [128, 256, 500, 1000, 2000] as const;
/** "Cualquiera" se representa como null — nunca se envía un mínimo inventado. */
export const CPU_GENERATION_OPTIONS = [6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

export type ScreenPreference = "cualquiera" | "liviano" | "grande";

export const SCREEN_PREFERENCE_LABELS: Record<ScreenPreference, string> = {
  cualquiera: "Cualquier tamaño",
  liviano: 'Compacta (hasta 14")',
  grande: 'Grande (15" o más)',
};

/** Mismos rangos que presets.ts (liviano/pantalla grande) — un solo criterio para ambos flujos. */
export const SCREEN_PREFERENCE_RANGES: Record<ScreenPreference, ScreenSizeRange | undefined> = {
  cualquiera: undefined,
  liviano: { maxInches: 14 },
  grande: { minInches: 15 },
};

export interface ManualFormValues {
  budgetMax: number | null;
  ramMinGb: (typeof RAM_OPTIONS_GB)[number];
  storageMinGb: (typeof STORAGE_OPTIONS_GB)[number];
  cpuGenerationMin: (typeof CPU_GENERATION_OPTIONS)[number] | null;
  gpu: GpuRequirement;
  touch: TouchRequirement;
  screenPreference: ScreenPreference;
}

export const DEFAULT_MANUAL_FORM: ManualFormValues = {
  budgetMax: null,
  ramMinGb: 8,
  storageMinGb: 256,
  cpuGenerationMin: null,
  gpu: "cualquiera",
  touch: "cualquiera",
  screenPreference: "cualquiera",
};

export type ManualFormValidationResult =
  | { ok: true; requirements: CustomerRequirements }
  | { ok: false; errors: string[] };

const MAX_BUDGET_COP = 100_000_000; // mismo tope que customerRequirementsSchema (B3) — evita un error de validación tardío en el servidor

export function validateManualForm(values: ManualFormValues): ManualFormValidationResult {
  const errors: string[] = [];

  if (values.budgetMax === null || !Number.isInteger(values.budgetMax) || values.budgetMax <= 0) {
    errors.push("Ingresa un presupuesto válido, mayor a $0.");
  } else if (values.budgetMax > MAX_BUDGET_COP) {
    errors.push("El presupuesto ingresado es demasiado alto.");
  }

  if (!RAM_OPTIONS_GB.includes(values.ramMinGb)) {
    errors.push("Selecciona una RAM válida.");
  }
  if (!STORAGE_OPTIONS_GB.includes(values.storageMinGb)) {
    errors.push("Selecciona un almacenamiento válido.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    requirements: {
      budgetMax: values.budgetMax as number,
      ramMinGb: values.ramMinGb,
      storageMinGb: values.storageMinGb,
      cpuGenerationMin: values.cpuGenerationMin ?? undefined,
      gpu: values.gpu,
      touch: values.touch,
      screenSize: SCREEN_PREFERENCE_RANGES[values.screenPreference],
    },
  };
}
