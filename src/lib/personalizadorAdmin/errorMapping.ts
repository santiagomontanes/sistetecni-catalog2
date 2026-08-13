/**
 * Mapeo de errores inesperados a una respuesta segura — usado por
 * src/app/admin/personalizador/actions.ts (withAdmin). Extraído como
 * función pura para poder probarlo sin red: la garantía que importa es
 * estructural (el tipo de retorno NO tiene ningún campo para "message"/
 * "cause"/detalle original), así que ningún error crudo de Supabase
 * (que sí puede traer detalles de la query) puede filtrarse por aquí,
 * ni por accidente.
 */
import { AdminAuthError } from "./auth";

export type UnexpectedErrorMapping = { ok: false; error: "FORBIDDEN" | "INTERNAL_ERROR" };

export function mapUnexpectedError(err: unknown): UnexpectedErrorMapping {
  if (err instanceof AdminAuthError) {
    return { ok: false, error: "FORBIDDEN" };
  }
  return { ok: false, error: "INTERNAL_ERROR" };
}
