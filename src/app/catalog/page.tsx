"use client";

import { useEffect, useState } from "react";
import ProductCard from "@/components/ProductCard";
import ProductFilters from "@/components/ProductFilters";
import FadeIn from "@/components/FadeIn";
import { getProducts } from "@/supabase/db";
import type { Product, ProductFilters as ProductFilterValues } from "@/types/product";

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
  const [filters, setFilters] = useState<ProductFilterValues>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProducts = async (activeFilters?: ProductFilterValues) => {
    try {
      setLoading(true);
      setError("");
      const nextProducts = await getProducts({ ...activeFilters, visibleOnly: true });
      setProducts(nextProducts);
    } catch {
      setError("No se pudo cargar el catálogo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  return (
    <section className="space-y-6">
      <FadeIn>
        <div className="border-b border-border pb-6">
          <h1 className="text-3xl font-bold text-text">Catálogo</h1>
          <p className="mt-1 text-sm text-muted">
            {loading
              ? "Cargando equipos…"
              : `${products.length} equipo${products.length !== 1 ? "s" : ""} disponible${products.length !== 1 ? "s" : ""}`}
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
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : null}
      </FadeIn>
    </section>
  );
}
