import Link from 'next/link';
import type { Product } from '@/types/product';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const coverImage = product.images[0];

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {coverImage ? <img src={coverImage} alt={product.title} className="h-44 w-full object-cover" /> : null}
      <div className="p-4">
        <h3 className="text-lg font-semibold text-slate-900">{product.title}</h3>
        <p className="mt-1 text-sm text-slate-600">{product.brand} {product.model}</p>
        <p className="mt-2 text-lg font-bold text-slate-900">${product.price.toLocaleString('es-CO')}</p>
        <p className="text-xs text-slate-500">Stock: {product.stock} · {product.condition}</p>
        <Link href={`/product?id=${product.id}`} className="mt-4 inline-block text-sm font-medium text-sky-700">
          Ver detalle
        </Link>
      </div>
    </article>
  );
}
