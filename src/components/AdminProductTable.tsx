'use client';

import type { Product } from '@/types/product';

interface AdminProductTableProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (id: string) => Promise<void>;
  onToggleVisible?: (id: string, visible: boolean) => Promise<void>;
}

export default function AdminProductTable({
  products,
  onEdit,
  onDelete,
  onToggleVisible,
}: AdminProductTableProps) {
  if (products.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-surface p-4 text-sm text-muted">
        No hay productos.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-surface text-muted">
          <tr>
            <th className="px-3 py-2">Título</th>
            <th className="px-3 py-2">Marca</th>
            <th className="px-3 py-2">Precio</th>
            <th className="px-3 py-2">Stock</th>
            <th className="px-3 py-2">Visible</th>
            <th className="px-3 py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} className="border-t border-border">
              <td className="px-3 py-2 font-medium text-text">{product.title}</td>
              <td className="px-3 py-2 text-muted">{product.brand}</td>
              <td className="px-3 py-2 text-text">
                ${product.price.toLocaleString('es-CO')}
              </td>
              <td className="px-3 py-2 text-muted">{product.stock}</td>
              <td className="px-3 py-2">
                <button
                  onClick={() => onToggleVisible?.(product.id, !product.visibleWeb)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    product.visibleWeb
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-surface text-muted hover:bg-border'
                  }`}
                >
                  {product.visibleWeb ? '👁 Visible' : '🙈 Oculto'}
                </button>
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(product)}
                    className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-text transition hover:border-primary hover:text-primary"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('¿Seguro que deseas eliminar este producto?')) {
                        void onDelete(product.id);
                      }
                    }}
                    className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
                  >
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
