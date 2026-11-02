"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ProductCard from "@/components/ProductCard";
import ProductFilters from "@/components/ProductFilters";
import FadeIn from "@/components/FadeIn";
import { getProductsList } from "@/supabase/db";
import type { Product, ProductFilters as ProductFilterValues } from "@/types/product";

const PAGE_SIZE = 12;

function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border-2 border-ink/15 bg-white">
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
        <div className="bleed -mt-8 bg-primary text-white">
          <div className="mx-auto max-w-6xl px-4 py-8 md:py-10">
          <h1 className="font-display text-5xl font-bold uppercase leading-none md:text-6xl">Catálogo</h1>
          <p className="tnum mt-3 font-data text-sm text-white/85">
            {loading
              ? "Cargando equipos…"
              : `Mostrando ${products.length} de ${total} equipo${total !== 1 ? "s" : ""}`}
          </p>
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={0.03}>
        <Link
          href="/personalizar"
          className="flex items-center justify-between gap-4 rounded-xl border-2 border-dashed border-ink/40 bg-white px-5 py-4 transition-colors hover:border-primary motion-reduce:transition-none"
        >
          <div>
            <p className="font-display text-xl font-bold uppercase text-ink">¿No sabes cuál elegir?</p>
            <p className="text-sm text-muted">Personaliza tu portátil y te ayudamos a encontrar el ideal.</p>
          </div>
          <span className="shrink-0 rounded bg-tape px-4 py-2 font-display text-sm font-bold uppercase tracking-wide text-ink">
            Empezar
          </span>
        </Link>
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
          <div className="rounded-xl border-2 border-red-300 bg-red-50 px-6 py-4 text-sm text-red-700">
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
          <div className="rounded-xl border-2 border-dashed border-ink/30 bg-paper p-12 text-center">
            <p className="font-display text-3xl font-bold uppercase text-ink">
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
                  className="rounded border-2 border-primary px-6 py-2.5 font-display text-base font-bold uppercase tracking-wide text-primary transition hover:bg-primary hover:text-white disabled:opacity-60"
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
