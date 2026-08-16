/**
 * Saneado de todo lo que puede acabar en un log, en una URL o en el HTML.
 *
 * REGLA ÚNICA de este módulo: de la query entrante solo salen NOMBRES de
 * parámetros, nunca valores. El `code`, el token y el App Secret no pasan por
 * aquí porque no deben pasar por ningún sitio que escriba.
 */

/** Parámetros que sabemos interpretar. Cualquier otro se cuenta, no se copia. */
export const PARAMS_CONOCIDOS = [
  "code",
  "state",
  "error",
  "error_code",
  "error_reason",
  "error_description",
  "waba_id",
  "phone_number_id",
  "business_id",
] as const;

const MAX_NOMBRES = 12;

/**
 * Nombres de los parámetros recibidos, saneados.
 *
 * Un nombre de parámetro lo elige quien llama, así que tampoco se copia crudo:
 * los conocidos se devuelven tal cual y el resto se reduce a un recuento. Sin
 * esto, alguien podría colar texto arbitrario en nuestros logs usándolo como
 * nombre de parámetro.
 */
export function nombresDeParametros(params: URLSearchParams): string[] {
  const conocidos: string[] = [];
  let otros = 0;

  for (const nombre of params.keys()) {
    if ((PARAMS_CONOCIDOS as readonly string[]).includes(nombre)) {
      if (!conocidos.includes(nombre)) conocidos.push(nombre);
    } else {
      otros++;
    }
  }

  conocidos.sort();
  const salida = conocidos.slice(0, MAX_NOMBRES);
  if (otros > 0) salida.push(`otros:${otros}`);
  return salida;
}

/** Solo dígitos. "+57 311 5996339" → "573115996339". */
export function normalizarE164(valor: string | null | undefined): string {
  return String(valor ?? "").replace(/\D/g, "");
}

/**
 * Número parcialmente enmascarado para poder cotejarlo a ojo sin publicarlo
 * entero: se conservan el indicativo y los dos últimos dígitos.
 */
export function enmascararTelefono(valor: string | null | undefined): string | null {
  const digitos = normalizarE164(valor);
  if (digitos.length < 6) return null;
  return `+${digitos.slice(0, 2)}${"·".repeat(digitos.length - 4)}${digitos.slice(-2)}`;
}

/**
 * Códigos internos: mayúsculas, guion bajo y tope de longitud. Se aplica antes
 * de meterlos en una URL o en el HTML, para que un mensaje de Meta no pueda
 * viajar disfrazado de código nuestro.
 */
export function sanearCodigoInterno(valor: string | null | undefined): string {
  const limpio = String(valor ?? "").toUpperCase().replace(/[^A-Z0-9_]/g, "");
  return limpio.slice(0, 40) || "DESCONOCIDO";
}

/** Los identificadores de Meta son numéricos. Lo que no lo sea, no se muestra. */
export function sanearIdentificador(valor: string | null | undefined): string | null {
  const limpio = String(valor ?? "").replace(/\D/g, "");
  return limpio.length > 0 && limpio.length <= 32 ? limpio : null;
}
