/**
 * Traducción DETERMINISTA de MatchReasonCode (B3) a texto en español para
 * el cliente — sin IA, tabla fija exhaustiva (TypeScript obliga a cubrir
 * los 22 códigos del union). Punto 6 del pedido de B5: nunca mostrar un
 * reason code crudo en la interfaz.
 */
import type { MatchReasonCode } from "../personalizador";

const REASON_TEXT: Record<MatchReasonCode, string> = {
  CPU_GENERATION_OK: "Cumple la generación de procesador que buscas",
  CPU_GENERATION_TOO_LOW: "La generación del procesador es menor a la solicitada",
  CPU_GENERATION_UNKNOWN: "No tenemos confirmada la generación del procesador",
  GPU_OK: "Cumple el tipo de tarjeta gráfica que buscas",
  GPU_MISMATCH: "El tipo de tarjeta gráfica no coincide con lo que buscas",
  GPU_UNKNOWN: "No tenemos confirmado el tipo de tarjeta gráfica",
  TOUCH_OK: "Cumple tu preferencia de pantalla táctil",
  TOUCH_MISMATCH: "La pantalla táctil no coincide con lo que buscas",
  TOUCH_UNKNOWN: "No tenemos confirmado si tiene pantalla táctil",
  SCREEN_SIZE_OK: "El tamaño de pantalla está dentro de lo que buscas",
  SCREEN_SIZE_OUT_OF_RANGE: "El tamaño de pantalla no está dentro de lo que buscas",
  SCREEN_SIZE_UNKNOWN: "No tenemos confirmado el tamaño de pantalla",
  RAM_ALREADY_SUFFICIENT: "Ya trae la RAM que necesitas",
  RAM_UPGRADE_AVAILABLE: "Se le puede mejorar la RAM",
  RAM_UPGRADE_UNAVAILABLE: "No es posible mejorar la RAM lo suficiente",
  STORAGE_ALREADY_SUFFICIENT: "Ya trae el almacenamiento que necesitas",
  STORAGE_UPGRADE_AVAILABLE: "Se le puede mejorar el almacenamiento",
  STORAGE_UPGRADE_UNAVAILABLE: "No es posible mejorar el almacenamiento lo suficiente",
  WITHIN_BUDGET: "Dentro de tu presupuesto",
  WITHIN_BUDGET_TOLERANCE: "Un poco por encima de tu presupuesto",
  OVER_BUDGET: "Fuera de tu presupuesto",
  IN_STOCK: "Disponible en inventario",
  OUT_OF_STOCK: "Actualmente agotado",
};

export function translateReason(code: MatchReasonCode): string {
  return REASON_TEXT[code];
}

export function translateReasons(codes: MatchReasonCode[]): string[] {
  return codes.map(translateReason);
}
