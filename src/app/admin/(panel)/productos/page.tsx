"use client";

import { useEffect, useState } from "react";
import AdminProductForm from "@/components/AdminProductForm";
import AdminProductTable from "@/components/AdminProductTable";
import { deleteProduct, getProducts, setProductVisibility } from "@/supabase/db";
import type { Product } from "@/types/product";

export default function AdminProductosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProducts = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getProducts();
      setProducts(data);
    } catch {
      setError("No fue posible cargar los productos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

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
      await loadProducts();
    } catch {
      setError("No fue posible cambiar la visibilidad.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Productos</h1>
        <p className="mt-1 text-sm text-muted">Gestiona el catálogo de equipos</p>
      </div>

      <AdminProductForm
        selectedProduct={selectedProduct}
        onSaved={loadProducts}
        onCancelEdit={() => setSelectedProduct(null)}
      />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-text">Lista de productos</h2>
        {loading && <p className="text-sm text-muted">Cargando productos...</p>}
        {error && (
          <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}
        {!loading && (
          <AdminProductTable
            products={products}
            onEdit={setSelectedProduct}
            onDelete={handleDelete}
            onToggleVisible={handleToggleVisible}
          />
        )}
      </div>
    </div>
  );
}
