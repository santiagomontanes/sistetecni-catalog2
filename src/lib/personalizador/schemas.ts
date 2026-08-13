/**
 * Validación de entrada — Zod (dependencia agregada en este bloque,
 * pre-aprobada desde la Fase 2A/2B para exactamente este propósito).
 *
 * B3 valida FORMA y RANGO del input; NO hace HTTP, NO hace rate limiting
 * (eso es B4). El honeypot (D12) se incluye en el esquema para que el
 * futuro formulario (B5) lo use, pero decidir qué hacer con un honeypot
 * disparado (bloquear, marcar, loguear) es responsabilidad de B4 — aquí
 * solo se ofrece la función pura que lo detecta.
 *
 * `.strict()` en cada objeto rechaza cualquier campo no declarado — esto
 * es, a la vez, la defensa contra payloads gigantes con basura anidada Y
 * la barrera estructural que impide "colar" una característica fija
 * (cpu/gpu/touch/pantalla) como si fuera un campo de upgrade: no existe
 * ningún nombre de campo en el esquema que permita expresar eso.
 */
import { z } from "zod";

const MAX_RAM_GB = 128;
const MAX_STORAGE_GB = 8192; // 8 TB — límite defensivo, no un valor real esperado
const MAX_CPU_GENERATION = 20;
const MIN_SCREEN_INCHES = 9;
const MAX_SCREEN_INCHES = 20;
const MAX_BUDGET_COP = 100_000_000;

export const gpuRequirementSchema = z.enum(["cualquiera", "integrada", "dedicada"]);
export const touchRequirementSchema = z.enum(["cualquiera", "si", "no"]);

export const screenSizeRangeSchema = z
  .object({
    minInches: z.number().min(MIN_SCREEN_INCHES).max(MAX_SCREEN_INCHES).optional(),
    maxInches: z.number().min(MIN_SCREEN_INCHES).max(MAX_SCREEN_INCHES).optional(),
  })
  .strict()
  .refine(
    (v) => v.minInches === undefined || v.maxInches === undefined || v.minInches <= v.maxInches,
    { message: "minInches no puede ser mayor que maxInches" }
  );

export const customerRequirementsSchema = z
  .object({
    budgetMax: z.number().int().positive().max(MAX_BUDGET_COP),
    ramMinGb: z.number().int().positive().max(MAX_RAM_GB),
    storageMinGb: z.number().int().positive().max(MAX_STORAGE_GB),
    cpuGenerationMin: z.number().int().positive().max(MAX_CPU_GENERATION).optional(),
    gpu: gpuRequirementSchema,
    touch: touchRequirementSchema,
    screenSize: screenSizeRangeSchema.optional(),
  })
  .strict();

/**
 * Nombre del campo honeypot — deliberadamente parece un campo legítimo de
 * contacto (que este formulario NUNCA pide de verdad, ver D5: solo
 * "ciudad" es opcional y ese sí es un campo real). Un humano nunca lo
 * completa porque nunca lo ve (CSS lo oculta en B5); un bot que rellena
 * todos los campos de un formulario sí.
 */
export const HONEYPOT_FIELD_NAME = "companyWebsite";

export const personalizadorRequestSchema = customerRequirementsSchema.extend({
  [HONEYPOT_FIELD_NAME]: z.string().optional(),
});

export type PersonalizadorRequestInput = z.infer<typeof personalizadorRequestSchema>;

/** Pura — no bloquea nada por sí sola. B4 decide qué hacer con `true`. */
export function isHoneypotTriggered(input: Record<string, unknown>): boolean {
  const value = input[HONEYPOT_FIELD_NAME];
  return typeof value === "string" && value.trim().length > 0;
}
