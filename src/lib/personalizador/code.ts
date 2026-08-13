/**
 * Generación del código de cotización — diseño de la Fase 2A §12,
 * implementado aquí de forma testeable: la aleatoriedad se INYECTA, nunca
 * se llama a crypto.randomBytes directamente dentro de la función pura.
 *
 * Formato: "COT-" + 6 caracteres de un alfabeto de 32 símbolos sin los
 * caracteres más ambiguos (sin 0/O/1/I — se conserva "L", que no se
 * confunde tan fácilmente como el resto en la mayoría de tipografías, y
 * es lo que permite llegar a exactamente 32 = 36 alfanuméricos - 4
 * excluidos; excluir también "L" da 31, no 32). 32^6 ≈ 1.07 mil millones
 * de combinaciones.
 * No incluye ningún dato personal — es opaco, no codifica nada del
 * cliente ni del producto.
 *
 * La verificación de colisión REAL contra la base de datos (reintento si
 * ya existe) es responsabilidad de B4 al insertar — B3 no toca Supabase.
 */

import { randomBytes as nodeRandomBytes } from "node:crypto";

export const QUOTE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 caracteres exactos — sin 0/O/1/I
const QUOTE_CODE_LENGTH = 6;
const QUOTE_CODE_PREFIX = "COT-";

/** Debe devolver `length` bytes aleatorios. Inyectable para tests deterministas. */
export type RandomBytesFn = (length: number) => Uint8Array;

// Node crypto — primitiva del runtime, no es "Supabase/React/env" ni
// ninguna de las dependencias prohibidas para el motor puro.
function defaultRandomBytes(length: number): Uint8Array {
  return new Uint8Array(nodeRandomBytes(length));
}

export function generateQuoteCode(randomBytesFn: RandomBytesFn = defaultRandomBytes): string {
  const bytes = randomBytesFn(QUOTE_CODE_LENGTH);
  let suffix = "";
  for (let i = 0; i < QUOTE_CODE_LENGTH; i++) {
    suffix += QUOTE_CODE_ALPHABET[bytes[i] % QUOTE_CODE_ALPHABET.length];
  }
  return `${QUOTE_CODE_PREFIX}${suffix}`;
}

/** true si `value` tiene la forma exacta de un código generado por esta función. */
export function isValidQuoteCodeFormat(value: string): boolean {
  const pattern = new RegExp(`^COT-[${QUOTE_CODE_ALPHABET}]{${QUOTE_CODE_LENGTH}}$`);
  return pattern.test(value);
}
