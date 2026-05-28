"use client";

import { useCallback, useEffect, useState } from "react";
import ProductCard from "@/components/ProductCard";
import ProductFilters from "@/components/ProductFilters";
import FadeIn from "@/components/FadeIn";
import { getProductsList } from "@/supabase/db";
import type { Product, ProductFilters as ProductFilterValues } from "@/types/product";

const PAGE_SIZE = 12;

function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-border bg-white">
      <div className="aspect-square bg-surface" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-2/5 rounded-md bg-border" />
        <div className="h-4 w-4/5 rounded-md bg-border" />
        <div className="h-3 w-3/5 rounded-md bg-border" />
        <div className="h-6 w-2/5 rounded-md bg-border" />
      </div>
    </div>
  );
}

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [filters, setFilters] = useState<ProductFilterValues>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const loadProducts = useCallback(async (activeFilters?: ProductFilterValues) => {
    try {
      setLoading(true);
      setError("");
      const page = await getProductsList({
        ...activeFilters,
        visibleOnly: true,
        offset: 0,
        pageSize: PAGE_SIZE,
      });
      setProducts(page.items);
      setTotal(page.total);
      setHasMore(page.hasMore);
    } catch {
      setError("No se pudo cargar el catálogo.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    try {
      setLoadingMore(true);
      const page = await getProductsList({
        ...filters,
        visibleOnly: true,
        offset: products.length,
        pageSize: PAGE_SIZE,
      });
      setProducts((prev) => [...prev, ...page.items]);
      setTotal(page.total);
      setHasMore(page.hasMore);
    } catch {
      setError("No se pudieron cargar más productos.");
    } finally {
      setLoadingMore(false);
    }
  }, [filters, hasMore, loadingMore, products.length]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  return (
    <section className="space-y-6">
      <FadeIn>
        <div className="border-b border-border pb-6">
          <h1 className="text-3xl font-bold text-text">Catálogo</h1>
          <p className="mt-1 text-sm text-muted">
            {loading
              ? "Cargando equipos…"
              : `Mostrando ${products.length} de ${total} equipo${total !== 1 ? "s" : ""}`}
          </p>
        </div>
      </FadeIn>

      <FadeIn delay={0.06}>
        <ProductFilters
          filters={filters}
          onChange={setFilters}
          onApply={(f) => void loadProducts(f)}
          onClear={() => {
            setFilters({});
            void loadProducts({});
          }}
        />
      </FadeIn>

      <FadeIn delay={0.12}>
        {error ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-6 py-4 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : null}

        {!loading && !error && products.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-12 text-center">
            <p className="text-4xl">📦</p>
            <p className="mt-3 font-semibold text-text">
              No hay productos con esos filtros
            </p>
            <p className="mt-1 text-sm text-muted">
              Intenta con otros criterios de búsqueda.
            </p>
          </div>
        ) : null}

        {!loading && products.length > 0 ? (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((product, idx) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  // Las 4 primeras tarjetas suelen estar above the fold
                  priority={idx < 4}
                />
              ))}
            </div>

            {hasMore ? (
              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="rounded-full border border-primary px-6 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary hover:text-white disabled:opacity-60"
                >
                  {loadingMore ? "Cargando..." : `Ver más (${total - products.length} restantes)`}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </FadeIn>
    </section>
  );
}
