import Link from 'next/link';
import type { Product } from '@/types/product';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const imageUrl = product.images?.[0] || '/placeholder.jpg';

  return (
    <Link
      href={`/product?id=${product.id}`}
      className="block overflow-hidden rounded-xl border border-slate-200 bg-white hover:shadow-sm"
    >
      <img
        src={imageUrl}
        alt={product.title}
        className="h-48 w-full object-cover"
      />

      <div className="p-4 space-y-1">
        <h3 className="text-base font-semibold text-slate-900">{product.title}</h3>
        <p className="text-sm text-slate-600">
          {product.brand} {product.model}
        </p>
        <p className="text-sm font-semibold text-slate-900">
          ${Number(product.price || 0).toLocaleString('es-CO')}
        </p>
      </div>
    </Link>
  );
}
