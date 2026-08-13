/**
 * Inserción de una cotización con reintento SOLO ante colisión del UNIQUE
 * de `quote_requests.code` (Postgres SQLSTATE 23505). Cualquier otro error
 * de base de datos se propaga de inmediato — nunca se reintenta a ciegas
 * un fallo que un reintento no puede resolver (timeout, permisos, etc.).
 *
 * Máximo MAX_CODE_ATTEMPTS intentos, nunca un loop infinito.
 */
import { generateQuoteCode, type RandomBytesFn } from "../personalizador";
import { RepositoryError } from "../repositories/errors";
import type { QuoteRequestsRepository } from "../repositories/quoteRequests.repository";
import type { CreateQuoteRequestInput, QuoteRequest } from "../../types/quote";

export const MAX_CODE_ATTEMPTS = 3;

export class QuoteCodeCollisionExhaustedError extends Error {
  constructor(attempts: number, public readonly cause?: unknown) {
    super(`No se pudo generar un código de cotización único tras ${attempts} intento(s).`);
    this.name = "QuoteCodeCollisionExhaustedError";
  }
}

/** SQLSTATE 23505 = unique_violation. quote_requests solo tiene un UNIQUE relevante en insert (code). */
export function isUniqueCodeViolation(err: unknown): boolean {
  if (!(err instanceof RepositoryError)) return false;
  const cause = err.cause as { code?: string } | undefined;
  return cause?.code === "23505";
}

export interface CreateQuoteWithRetryDeps {
  quoteRequestsRepo: QuoteRequestsRepository;
  /** Inyectable para tests deterministas (mismo mecanismo que B3/code.ts). */
  randomBytesFn?: RandomBytesFn;
}

export async function createQuoteWithRetry(
  buildInput: (code: string) => CreateQuoteRequestInput,
  deps: CreateQuoteWithRetryDeps
): Promise<QuoteRequest> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateQuoteCode(deps.randomBytesFn);
    try {
      return await deps.quoteRequestsRepo.create(buildInput(code));
    } catch (err) {
      if (!isUniqueCodeViolation(err)) throw err;
      lastError = err;
    }
  }
  throw new QuoteCodeCollisionExhaustedError(MAX_CODE_ATTEMPTS, lastError);
}
