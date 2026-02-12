'use client';

import type { Product } from '@/types/product';

interface AdminProductTableProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (id: string) => Promise<void>;
}

export default function AdminProductTable({ products, onEdit, onDelete }: AdminProductTableProps) {
  if (products.length === 0) {
    return <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">No hay productos.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-100 text-slate-700">
          <tr>
            <th className="px-3 py-2">Título</th>
            <th className="px-3 py-2">Marca</th>
            <th className="px-3 py-2">Precio</th>
            <th className="px-3 py-2">Stock</th>
            <th className="px-3 py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} className="border-t border-slate-100">
              <td className="px-3 py-2">{product.title}</td>
              <td className="px-3 py-2">{product.brand}</td>
              <td className="px-3 py-2">${product.price.toLocaleString('es-CO')}</td>
              <td className="px-3 py-2">{product.stock}</td>
              <td className="px-3 py-2">
                <div className="flex gap-2">
                  <button onClick={() => onEdit(product)} className="rounded border border-slate-300 px-2 py-1 text-xs">Editar</button>
                  <button
                    onClick={() => {
                      if (window.confirm('¿Seguro que deseas eliminar este producto?')) {
                        void onDelete(product.id);
                      }
                    }}
                    className="rounded border border-red-300 px-2 py-1 text-xs text-red-700"
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
