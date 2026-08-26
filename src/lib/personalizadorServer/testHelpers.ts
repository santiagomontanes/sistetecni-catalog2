/**
 * Dobles de prueba en memoria para los repositorios de B2 — SIN red, sin
 * Supabase. Implementan las mismas interfaces que los repositorios reales
 * (products.repository.ts, productUpgradeOptions.repository.ts,
 * quoteRequests.repository.ts) para que los tests de B4 ejerciten el
 * código de orquestación real, con datos controlados. No es en sí un
 * archivo de test (node --test no lo recoge — no matchea *.test.ts).
 */
import { RepositoryError } from "../repositories/errors";
import type { ProductsRepository } from "../repositories/products.repository";
import type { ProductUpgradeOptionsRepository } from "../repositories/productUpgradeOptions.repository";
import type { QuoteRequestsRepository } from "../repositories/quoteRequests.repository";
import type { Product } from "../../types/product";
import type { CompatibleUpgrade } from "../../types/upgrade";
import type { CreateQuoteRequestInput, QuoteRequest } from "../../types/quote";

export function makeFakeProductsRepository(products: Product[]): ProductsRepository {
  return {
    async findById(id) {
      return products.find((p) => p.id === id) ?? null;
    },
    async findManyByIds(ids) {
      const byId = new Map(products.map((p) => [p.id, p]));
      return ids.map((id) => byId.get(id)).filter((p): p is Product => p !== undefined);
    },
    async findPersonalizerCandidates() {
      return products.filter((p) => p.visibleWeb !== false);
    },
    async search(query, limit = 20) {
      const needle = query.toLowerCase();
      return products
        .filter(
          (p) =>
            p.title.toLowerCase().includes(needle) ||
            p.brand.toLowerCase().includes(needle) ||
            p.model.toLowerCase().includes(needle)
        )
        .slice(0, limit);
    },
  };
}

export function makeFakeProductUpgradeOptionsRepository(
  byProductId: Map<string, CompatibleUpgrade[]>
): ProductUpgradeOptionsRepository {
  return {
    async findCompatibleUpgradesForProduct(productId) {
      return byProductId.get(productId) ?? [];
    },
    async findCompatibleUpgradesForProducts(productIds) {
      const result = new Map<string, CompatibleUpgrade[]>();
      for (const id of productIds) {
        const list = byProductId.get(id);
        if (list && list.length > 0) result.set(id, list);
      }
      return result;
    },
    async isCompatible(productId, upgradeOptionId) {
      return (byProductId.get(productId) ?? []).some((c) => c.option.id === upgradeOptionId);
    },
    async setCompatibility(productId, upgradeOptionIds) {
      const current = byProductId.get(productId) ?? [];
      const kept = current.filter((c) => upgradeOptionIds.includes(c.option.id));
      byProductId.set(productId, kept);
    },
  };
}

export interface FakeQuoteRequestsRepositoryOptions {
  /** Simula N colisiones UNIQUE (23505) antes de aceptar el insert. */
  collisionsBeforeSuccess?: number;
  /** Simula un error de base de datos que NO es colisión — no debe reintentarse. */
  failWithNonUniqueError?: boolean;
}

export interface FakeQuoteRequestsRepository extends QuoteRequestsRepository {
  store: Map<string, QuoteRequest>;
  createAttempts: number;
}

export function makeFakeQuoteRequestsRepository(
  options: FakeQuoteRequestsRepositoryOptions = {}
): FakeQuoteRequestsRepository {
  const store = new Map<string, QuoteRequest>();
  let collisionsLeft = options.collisionsBeforeSuccess ?? 0;
  let idCounter = 0;
  let createAttempts = 0;

  return {
    store,
    get createAttempts() {
      return createAttempts;
    },
    async findByCode(code) {
      return store.get(code) ?? null;
    },
    async create(input: CreateQuoteRequestInput) {
      createAttempts += 1;

      if (options.failWithNonUniqueError) {
        throw new RepositoryError("fallo de base de datos simulado (no-unique)", { code: "53300" });
      }
      if (collisionsLeft > 0) {
        collisionsLeft -= 1;
        throw new RepositoryError("colisión de código simulada", { code: "23505" });
      }

      idCounter += 1;
      const now = new Date();
      const quote: QuoteRequest = {
        id: `fake-id-${idCounter}`,
        code: input.code,
        productId: input.productId,
        isSpecialRequest: input.isSpecialRequest,
        basePriceSnapshot: input.basePriceSnapshot,
        baseConfigSnapshot: input.baseConfigSnapshot,
        requestedConfig: input.requestedConfig,
        selectedUpgradesSnapshot: input.selectedUpgradesSnapshot,
        estimatedPrice: input.estimatedPrice,
        customerBudget: input.customerBudget,
        customerCity: input.customerCity,
        customerNote: input.customerNote,
        status: "nueva",
        channel: "web_personalizador",
        createdAt: now,
        updatedAt: now,
        expiresAt: input.expiresAt,
      };
      store.set(input.code, quote);
      return quote;
    },
    async list(filter) {
      let rows = [...store.values()];
      if (filter?.status) rows = rows.filter((q) => q.status === filter.status);
      if (filter?.codeSearch) {
        const needle = filter.codeSearch.toLowerCase();
        rows = rows.filter((q) => q.code.toLowerCase().includes(needle));
      }
      return rows.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
    },
    async updateStatus(id, status) {
      const entry = [...store.entries()].find(([, q]) => q.id === id);
      if (!entry) {
        throw new RepositoryError(`updateStatus(${id}) falló: no encontrado`, null);
      }
      const [code, quote] = entry;
      const updated: QuoteRequest = { ...quote, status, updatedAt: new Date() };
      store.set(code, updated);
      return updated;
    },
  };
}
