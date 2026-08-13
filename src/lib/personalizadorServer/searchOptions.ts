/**
 * buscarOpcionesPersonalizadas — orquesta B2 (repositorios) + B3 (motor),
 * sin decidir ninguna regla de matching/precio por su cuenta.
 *
 * Flujo: valida input (B4) -> candidatos públicos elegibles (B2,
 * ProductsRepository.findPersonalizerCandidates) -> compatibilidades en
 * UNA sola consulta en lote (B2, findCompatibleUpgradesForProducts, evita
 * N+1) -> matchProducts (B3) -> rankResults (B3) -> DTO serializable.
 *
 * NO persiste nada — es exploración. Guardar una cotización es
 * responsabilidad exclusiva de createQuote.ts.
 */
import type { ProductsRepository } from "../repositories/products.repository";
import type { ProductUpgradeOptionsRepository } from "../repositories/productUpgradeOptions.repository";
import { matchProducts, rankResults } from "../personalizador";
import type { ProductCandidate } from "../personalizador";
import { parseCustomerRequest } from "./validation";
import { toSearchOptionDTO } from "./mappers";
import type { SearchOptionsResult } from "./types";

const GENERIC_INVALID_MESSAGE = "Solicitud inválida.";

export interface SearchOptionsDeps {
  productsRepo: ProductsRepository;
  productUpgradeOptionsRepo: ProductUpgradeOptionsRepository;
  /** Inyectable para tests/logging — nunca imprime el payload completo (podría crecer sin control). */
  onHoneypotTriggered?: () => void;
}

export async function buscarOpcionesPersonalizadas(
  rawInput: unknown,
  deps: SearchOptionsDeps
): Promise<SearchOptionsResult> {
  const parsed = parseCustomerRequest(rawInput);
  if (!parsed.ok) {
    return { ok: false, error: "VALIDATION_ERROR", issues: parsed.issues };
  }

  if (parsed.value.honeypotTriggered) {
    deps.onHoneypotTriggered?.();
    // Respuesta idéntica en forma a un fallo de validación genérico — nunca
    // se revela que el motivo real fue el honeypot (ver README).
    return { ok: false, error: "VALIDATION_ERROR", issues: [GENERIC_INVALID_MESSAGE] };
  }

  const { requirements } = parsed.value;

  const products = await deps.productsRepo.findPersonalizerCandidates();
  const compatibleByProduct = await deps.productUpgradeOptionsRepo.findCompatibleUpgradesForProducts(
    products.map((p) => p.id)
  );

  const candidates: ProductCandidate[] = products.map((product) => ({
    product,
    compatibleUpgrades: compatibleByProduct.get(product.id) ?? [],
  }));

  const outcome = matchProducts(requirements, candidates);

  return {
    ok: true,
    data: {
      available: rankResults(outcome.available).map(toSearchOptionDTO),
      referenceOnly: rankResults(outcome.referenceOnly).map(toSearchOptionDTO),
      specialQuoteRequired: outcome.specialQuoteRequired,
    },
  };
}
