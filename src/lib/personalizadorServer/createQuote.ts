/**
 * crearCotizacionPersonalizada — orquesta B2 + B3 para persistir una
 * cotización. Principio central (pedido explícitamente): el navegador NO
 * decide precio ni compatibilidad. `selectedProductId` es solo un
 * puntero — el servidor relee el producto y sus upgrades AHORA MISMO y
 * vuelve a correr evaluateCandidate() (B3) desde cero. selectedUpgrades,
 * basePrice, finalPrice, etc. enviados por el cliente (si los hubiera)
 * simplemente no se leen en ningún punto de este archivo.
 *
 * Dos caminos, cada uno re-verificado server-side, nunca asumido:
 *   - selectedProductId: evalúa ESE candidato de nuevo.
 *   - wantsSpecialQuote: vuelve a correr la búsqueda COMPLETA y solo la
 *     honra si de verdad no hay ningún candidato (ni disponible ni
 *     agotado) — nunca confía en que el cliente "diga" que no encontró
 *     nada.
 */
import type { ProductsRepository } from "../repositories/products.repository";
import type { ProductUpgradeOptionsRepository } from "../repositories/productUpgradeOptions.repository";
import type { QuoteRequestsRepository } from "../repositories/quoteRequests.repository";
import {
  evaluateCandidate,
  matchProducts,
  buildQuoteSnapshotFromMatch,
  buildSpecialQuoteSnapshot,
  type ProductCandidate,
  type RandomBytesFn,
} from "../personalizador";
import { parseCustomerRequest, parseCustomerCity } from "./validation";
import { toPublicQuoteDTO } from "./mappers";
import { createQuoteWithRetry, QuoteCodeCollisionExhaustedError } from "./codeRetry";
import type { CreateQuoteInput, CreateQuoteResult } from "./types";

const GENERIC_INVALID_MESSAGE = "Solicitud inválida.";

export interface CreateQuoteDeps {
  productsRepo: ProductsRepository;
  productUpgradeOptionsRepo: ProductUpgradeOptionsRepository;
  quoteRequestsRepo: QuoteRequestsRepository;
  /** Inyectable para tests deterministas (mismo mecanismo que B3/code.ts). */
  randomBytesFn?: RandomBytesFn;
  /** Inyectable para tests deterministas de expiración (D6). */
  now?: Date;
  onHoneypotTriggered?: () => void;
}

async function buildCandidatesFromCatalog(deps: CreateQuoteDeps): Promise<ProductCandidate[]> {
  const products = await deps.productsRepo.findPersonalizerCandidates();
  const compatibleByProduct = await deps.productUpgradeOptionsRepo.findCompatibleUpgradesForProducts(
    products.map((p) => p.id)
  );
  return products.map((product) => ({
    product,
    compatibleUpgrades: compatibleByProduct.get(product.id) ?? [],
  }));
}

export async function crearCotizacionPersonalizada(
  input: CreateQuoteInput,
  deps: CreateQuoteDeps
): Promise<CreateQuoteResult> {
  const parsed = parseCustomerRequest(input.requirements);
  if (!parsed.ok) {
    return { ok: false, error: "VALIDATION_ERROR", issues: parsed.issues };
  }

  if (parsed.value.honeypotTriggered) {
    deps.onHoneypotTriggered?.();
    // Misma forma que un fallo de validación genérico — ver
    // searchOptions.ts para el mismo criterio y su justificación.
    return { ok: false, error: "VALIDATION_ERROR", issues: [GENERIC_INVALID_MESSAGE] };
  }

  const { requirements } = parsed.value;
  const customerCity = parseCustomerCity(input.customerCity);
  const now = deps.now ?? new Date();

  if (input.selectedProductId) {
    const product = await deps.productsRepo.findById(input.selectedProductId);
    if (!product) {
      return { ok: false, error: "PRODUCT_NOT_ELIGIBLE" };
    }

    const compatibleUpgrades = await deps.productUpgradeOptionsRepo.findCompatibleUpgradesForProduct(
      product.id
    );
    const result = evaluateCandidate({ product, compatibleUpgrades }, requirements);
    if (!result) {
      return { ok: false, error: "PRODUCT_NOT_ELIGIBLE" };
    }

    try {
      const created = await createQuoteWithRetry(
        (code) => ({
          ...buildQuoteSnapshotFromMatch(result, requirements, code, now),
          customerCity,
        }),
        { quoteRequestsRepo: deps.quoteRequestsRepo, randomBytesFn: deps.randomBytesFn }
      );
      return { ok: true, data: toPublicQuoteDTO(created) };
    } catch (err) {
      if (err instanceof QuoteCodeCollisionExhaustedError) {
        return { ok: false, error: "CODE_GENERATION_FAILED" };
      }
      throw err;
    }
  }

  if (input.wantsSpecialQuote) {
    const candidates = await buildCandidatesFromCatalog(deps);
    const outcome = matchProducts(requirements, candidates);

    if (!outcome.specialQuoteRequired) {
      return { ok: false, error: "SPECIAL_QUOTE_NOT_APPLICABLE" };
    }

    try {
      const created = await createQuoteWithRetry(
        (code) => ({
          ...buildSpecialQuoteSnapshot(requirements, code, now),
          customerCity,
        }),
        { quoteRequestsRepo: deps.quoteRequestsRepo, randomBytesFn: deps.randomBytesFn }
      );
      return { ok: true, data: toPublicQuoteDTO(created) };
    } catch (err) {
      if (err instanceof QuoteCodeCollisionExhaustedError) {
        return { ok: false, error: "CODE_GENERATION_FAILED" };
      }
      throw err;
    }
  }

  return {
    ok: false,
    error: "VALIDATION_ERROR",
    issues: ["Debe indicar selectedProductId o wantsSpecialQuote=true."],
  };
}
