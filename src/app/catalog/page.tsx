'use client';

import { useEffect, useState } from 'react';
import ProductCard from '@/components/ProductCard';
import ProductFilters from '@/components/ProductFilters';
import { getProducts } from '@/supabase/db';
import type { Product, ProductFilters as ProductFilterValues } from '@/types/product';

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState<ProductFilterValues>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProducts = async (activeFilters?: ProductFilterValues) => {
    try {
      setLoading(true);
      setError('');
      const nextProducts = await getProducts(activeFilters);
      setProducts(nextProducts);
    } catch {
      setError('No se pudo cargar el catálogo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">Catálogo</h1>
        <p className="mt-2 text-sm text-slate-600">Explora nuestros productos disponibles.</p>
      </header>

      <ProductFilters
        filters={filters}
        onChange={setFilters}
        onApply={() => void loadProducts(filters)}
        onClear={() => {
          setFilters({});
          void loadProducts({});
        }}
      />

      {loading ? <p className="text-sm text-slate-500">Cargando productos...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!loading && !error && products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          No hay productos aún.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
