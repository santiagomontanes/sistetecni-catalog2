import Link from 'next/link';
import type { Product } from '@/types/product';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  return (
    <article className="rounded-xl border border-slate-200 p-4">
      <h3 className="text-lg font-semibold text-slate-900">{product.name}</h3>
      <p className="mt-2 text-sm text-slate-600">{product.description}</p>
      <Link href={`/product?id=${product.id}`} className="mt-4 inline-block text-sm font-medium text-brand-700">
        Ver detalle
      </Link>
    </article>
  );
}
