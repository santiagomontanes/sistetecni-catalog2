/**
 * Validación de entrada específica de B4 — separada de src/lib/personalizador/
 * (B3) a propósito: B3 valida la FORMA de CustomerRequirements + honeypot
 * (dominio puro, sin Supabase). `customerCity` es un concepto de B4/B5
 * (dato de contacto pre-WhatsApp, D5), no del motor de matching — no
 * pertenece al esquema de B3.
 */
import { z } from "zod";
import {
  personalizadorRequestSchema,
  isHoneypotTriggered,
  type CustomerRequirements,
} from "../personalizador";

const MAX_CITY_LENGTH = 80;

/** (D5) Único dato de contacto pre-WhatsApp: solo ciudad, sanitizada, sin nombre/teléfono/correo. */
export const customerCitySchema = z.string().trim().min(1).max(MAX_CITY_LENGTH);

export interface ParsedCustomerRequest {
  requirements: CustomerRequirements;
  honeypotTriggered: boolean;
}

export type ParseResult =
  | { ok: true; value: ParsedCustomerRequest }
  | { ok: false; issues: string[] };

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "(raíz)"}: ${issue.message}`);
}

/**
 * Valida forma + rango (delegado en el schema de B3) y separa el honeypot
 * de los requisitos reales — el objeto `requirements` devuelto NUNCA
 * contiene el campo honeypot, así que no puede filtrarse a un snapshot ni
 * a ningún log de "requestedConfig".
 */
export function parseCustomerRequest(rawInput: unknown): ParseResult {
  const result = personalizadorRequestSchema.safeParse(rawInput);
  if (!result.success) {
    return { ok: false, issues: formatIssues(result.error) };
  }

  const parsed = result.data;
  const requirements: CustomerRequirements = {
    budgetMax: parsed.budgetMax,
    ramMinGb: parsed.ramMinGb,
    storageMinGb: parsed.storageMinGb,
    cpuGenerationMin: parsed.cpuGenerationMin,
    gpu: parsed.gpu,
    touch: parsed.touch,
    screenSize: parsed.screenSize,
  };

  return {
    ok: true,
    value: { requirements, honeypotTriggered: isHoneypotTriggered(parsed) },
  };
}

/** null si no vino, vino vacía, o excede el límite — nunca lanza, nunca "adivina" un valor sanitizado. */
export function parseCustomerCity(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const result = customerCitySchema.safeParse(raw);
  return result.success ? result.data : null;
}
