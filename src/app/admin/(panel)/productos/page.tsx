"use client";

import { useCallback, useEffect, useState } from "react";
import AdminProductForm from "@/components/AdminProductForm";
import AdminProductTable from "@/components/AdminProductTable";
import { deleteProduct, getProductsList, setProductVisibility } from "@/supabase/db";
import type { Product } from "@/types/product";

const PAGE_SIZE = 24;

export default function AdminProductosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const page = await getProductsList({ offset: 0, pageSize: PAGE_SIZE });
      setProducts(page.items);
      setTotal(page.total);
      setHasMore(page.hasMore);
    } catch {
      setError("No fue posible cargar los productos.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    try {
      setLoadingMore(true);
      const page = await getProductsList({
        offset: products.length,
        pageSize: PAGE_SIZE,
      });
      setProducts((prev) => [...prev, ...page.items]);
      setTotal(page.total);
      setHasMore(page.hasMore);
    } catch {
      setError("No fue posible cargar más productos.");
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, products.length]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const handleDelete = async (id: string) => {
    try {
      await deleteProduct(id);
      if (selectedProduct?.id === id) setSelectedProduct(null);
      await loadProducts();
    } catch {
      setError("No fue posible eliminar el producto.");
    }
  };

  const handleToggleVisible = async (id: string, visible: boolean) => {
    try {
      await setProductVisibility(id, visible);
      // Actualización optimista: evita refetch completo (y por tanto
      // re-descarga del array `images` de cada producto).
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, visibleWeb: visible } : p))
      );
    } catch {
      setError("No fue posible cambiar la visibilidad.");
      await loadProducts();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Productos</h1>
        <p className="mt-1 text-sm text-muted">
          Gestiona el catálogo de equipos · {total} en total
        </p>
      </div>

      <AdminProductForm
        selectedProduct={selectedProduct}
        onSaved={loadProducts}
        onCancelEdit={() => setSelectedProduct(null)}
      />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-text">
          Lista de productos ({products.length}/{total})
        </h2>
        {loading && <p className="text-sm text-muted">Cargando productos...</p>}
        {error && (
          <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}
        {!loading && (
          <>
            <AdminProductTable
              products={products}
              onEdit={setSelectedProduct}
              onDelete={handleDelete}
              onToggleVisible={handleToggleVisible}
            />
            {hasMore && (
              <div className="pt-4 text-center">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-text transition hover:border-primary hover:text-primary disabled:opacity-60"
                >
                  {loadingMore
                    ? "Cargando..."
                    : `Cargar más (${total - products.length} restantes)`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
