'use client';

import { useEffect, useState } from 'react';
import AdminProductForm from '@/components/AdminProductForm';
import AdminProductTable from '@/components/AdminProductTable';
import ProtectedAdmin from '@/components/ProtectedAdmin';
import { signOutUser } from '@/supabase//auth';
import { deleteProduct, getProducts } from '@/supabase/db';
import type { Product } from '@/types/product';
export const dynamic = 'force-dynamic';
export const revalidate = 0;


export default function AdminDashboardPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProducts = async () => {
    try {
      setLoading(true);
      setError('');
      const nextProducts = await getProducts();
      setProducts(nextProducts);
    } catch {
      setError('No fue posible cargar los productos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  const handleDelete = async (id: string) => {
    await deleteProduct(id);
    if (selectedProduct?.id === id) {
      setSelectedProduct(null);
    }
    await loadProducts();
  };

  return (
    <ProtectedAdmin>
      <section className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold text-slate-900">Panel administrativo</h1>
          <button onClick={() => void signOutUser()} className="rounded border border-slate-300 px-3 py-1 text-sm">
            Cerrar sesión
          </button>
        </div>

        <AdminProductForm
          selectedProduct={selectedProduct}
          onSaved={loadProducts}
          onCancelEdit={() => setSelectedProduct(null)}
        />

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-slate-900">Productos</h2>
          {loading ? <p className="text-sm text-slate-500">Cargando productos...</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {!loading ? <AdminProductTable products={products} onEdit={setSelectedProduct} onDelete={handleDelete} /> : null}
        </div>
      </section>
    </ProtectedAdmin>
  );
}
