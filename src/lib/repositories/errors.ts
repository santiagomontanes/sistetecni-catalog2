/**
 * Error tipado para distinguir "la operación falló" de "no se encontró".
 *
 * Sin esto, el patrón que ya usa src/supabase/db.ts (`if (error || !data)
 * return null`) confunde ambos casos: un producto que no existe y un fallo
 * real de red/permisos devuelven exactamente lo mismo. Los repositorios
 * nuevos de la Fase 2B distinguen: "no encontrado" → null (caso válido,
 * esperado); fallo real de Supabase → RepositoryError (se propaga, nunca
 * se traga en silencio).
 */
export class RepositoryError extends Error {
  constructor(
    message: string,
    /** El error original de supabase-js, para logging — nunca para mostrar al usuario final. */
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}
