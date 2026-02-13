"use client";

import { useEffect, useState } from "react";
import ProductCard from "@/components/ProductCard";
import ProductFilters from "@/components/ProductFilters";
import FadeIn from "@/components/FadeIn";
import { getProducts } from "@/supabase/db";
import type { Product, ProductFilters as ProductFilterValues } from "@/types/product";

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState<ProductFilterValues>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProducts = async (activeFilters?: ProductFilterValues) => {
    try {
      setLoading(true);
      setError("");
      const nextProducts = await getProducts(activeFilters);
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
    <section className="space-y-8">
      <FadeIn>
        <header>
          <h1 className="text-3xl font-bold text-text">Catálogo</h1>
          <p className="mt-2 text-sm text-muted">Explora nuestros productos disponibles.</p>
        </header>
      </FadeIn>

      <FadeIn delay={0.08}>
        <ProductFilters
          filters={filters}
          onChange={setFilters}
          onApply={() => void loadProducts(filters)}
          onClear={() => {
            setFilters({});
            void loadProducts({});
          }}
        />
      </FadeIn>

      <FadeIn delay={0.14}>
        <>
          {loading ? <p className="text-sm text-muted">Cargando productos...</p> : null}
          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          {!loading && !error && products.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface p-8 text-sm text-muted">
              No hay productos aún.
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </>
      </FadeIn>
    </section>
  );
}
