/**
 * Traducción DETERMINISTA de "para qué lo necesitas" + preferencia →
 * requisitos técnicos de B3 (CustomerRequirements). Sin IA — una tabla
 * explícita, tipada, fácil de ajustar desde negocio.
 *
 * Criterio de cada preset (para que un ajuste futuro no sea arbitrario):
 *   - RAM/almacenamiento: el mínimo con el que la mayoría de tareas de ese
 *     uso corren bien hoy (2026) en un equipo reacondicionado corporativo.
 *   - cpuGenerationMin=8: generación mínima real que existe en catálogo
 *     (los 7 [SEED] van de 8va a 11va gen) para usos que sí lo necesitan;
 *     se omite (sin filtro) en usos livianos para no descartar equipos más
 *     antiguos que igual sirven.
 *   - gpu="dedicada": solo para los usos donde de verdad se nota (diseño,
 *     edición de video/foto, gaming) — en el resto "cualquiera" para no
 *     descartar equipos con GPU integrada que cumplen igual.
 *   - touch: siempre "cualquiera" en los presets — ninguno de los 8 usos
 *     listados depende de pantalla táctil; el cliente puede pedirla aparte
 *     en "Personalizar".
 */
import type { CustomerRequirements, GpuRequirement, ScreenSizeRange } from "../personalizador";

export type UseCaseKey =
  | "estudio"
  | "oficina"
  | "programacion"
  | "diseno"
  | "edicion"
  | "profesional"
  | "gaming_ligero"
  | "otro";

export interface UseCaseOption {
  key: UseCaseKey;
  label: string;
  description: string;
}

export const USE_CASE_OPTIONS: UseCaseOption[] = [
  { key: "estudio", label: "Estudio", description: "Tareas, navegación, clases virtuales" },
  { key: "oficina", label: "Oficina", description: "Correo, Office, hojas de cálculo" },
  { key: "programacion", label: "Programación", description: "Editores de código, entornos de desarrollo" },
  { key: "diseno", label: "Diseño", description: "Edición gráfica, herramientas de diseño" },
  { key: "edicion", label: "Edición", description: "Edición de video o fotografía" },
  { key: "profesional", label: "Trabajo profesional", description: "Multitarea, videollamadas, herramientas de oficina avanzadas" },
  { key: "gaming_ligero", label: "Gaming ligero", description: "Juegos no exigentes" },
  { key: "otro", label: "Otro", description: "No estoy seguro / uso general" },
];

export type BaseRequirements = Omit<CustomerRequirements, "budgetMax">;

export const USE_CASE_PRESETS: Record<UseCaseKey, BaseRequirements> = {
  estudio: { ramMinGb: 8, storageMinGb: 256, gpu: "cualquiera", touch: "cualquiera" },
  oficina: { ramMinGb: 8, storageMinGb: 256, gpu: "cualquiera", touch: "cualquiera" },
  programacion: { ramMinGb: 16, storageMinGb: 256, cpuGenerationMin: 8, gpu: "cualquiera", touch: "cualquiera" },
  diseno: { ramMinGb: 16, storageMinGb: 500, cpuGenerationMin: 8, gpu: "dedicada", touch: "cualquiera" },
  edicion: { ramMinGb: 16, storageMinGb: 500, cpuGenerationMin: 8, gpu: "dedicada", touch: "cualquiera" },
  profesional: { ramMinGb: 16, storageMinGb: 256, cpuGenerationMin: 8, gpu: "cualquiera", touch: "cualquiera" },
  gaming_ligero: { ramMinGb: 16, storageMinGb: 500, cpuGenerationMin: 8, gpu: "dedicada", touch: "cualquiera" },
  otro: { ramMinGb: 8, storageMinGb: 256, gpu: "cualquiera", touch: "cualquiera" },
};

export type PreferenceKey =
  | "liviano"
  | "pantalla_grande"
  | "rendimiento"
  | "almacenamiento"
  | "sin_preferencia";

export interface PreferenceOption {
  key: PreferenceKey;
  label: string;
}

export const PREFERENCE_OPTIONS: PreferenceOption[] = [
  { key: "liviano", label: "Más portátil/liviano" },
  { key: "pantalla_grande", label: "Pantalla grande" },
  { key: "rendimiento", label: "Mejor rendimiento" },
  { key: "almacenamiento", label: "Más almacenamiento" },
  { key: "sin_preferencia", label: "Sin preferencia" },
];

/** Escalón fijo de RAM al pedir "mejor rendimiento" — nunca baja, nunca inventa un valor intermedio. */
function bumpRam(ramMinGb: number): number {
  return ramMinGb >= 16 ? 32 : 16;
}

/** Mismo criterio de escalón fijo para "más almacenamiento". */
function bumpStorage(storageMinGb: number): number {
  return storageMinGb >= 500 ? 1000 : 500;
}

const LIGHT_SCREEN: ScreenSizeRange = { maxInches: 14 };
const LARGE_SCREEN: ScreenSizeRange = { minInches: 15 };

function applyPreference(base: BaseRequirements, preference: PreferenceKey): BaseRequirements {
  switch (preference) {
    case "liviano":
      return { ...base, screenSize: LIGHT_SCREEN };
    case "pantalla_grande":
      return { ...base, screenSize: LARGE_SCREEN };
    case "rendimiento":
      return { ...base, ramMinGb: bumpRam(base.ramMinGb) };
    case "almacenamiento":
      return { ...base, storageMinGb: bumpStorage(base.storageMinGb) };
    case "sin_preferencia":
      return base;
  }
}

/** Punto de entrada del flujo "Ayúdame a elegir" — combina preset + presupuesto + preferencia en un CustomerRequirements completo. */
export function buildRequirementsFromAyudame(
  useCase: UseCaseKey,
  budgetMax: number,
  preference: PreferenceKey
): CustomerRequirements {
  const withPreference = applyPreference(USE_CASE_PRESETS[useCase], preference);
  return { ...withPreference, budgetMax };
}

export type { CustomerRequirements, GpuRequirement };
