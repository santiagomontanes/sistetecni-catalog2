import Link from "next/link";
import type { Product } from "@/types/product";

interface ProductCardProps {
  product: Product;
}

function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ProductCard({ product }: ProductCardProps) {
  const imageUrl = product.images?.[0] || "/placeholder.jpg";
  const price = Number(product.price || 0);

  return (
    <Link
      href={`/product?id=${product.id}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-surface transition hover:shadow-lg"
    >
      <div className="relative">
        <img
          src={imageUrl}
          alt={product.title}
          className="h-52 w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg/70 via-transparent to-transparent opacity-80" />
      </div>

      <div className="space-y-1 p-5">
        <h3 className="line-clamp-1 text-base font-semibold text-text">
          {product.title}
        </h3>

        <p className="line-clamp-1 text-sm text-muted">
          {product.brand} {product.model}
        </p>

        <p className="pt-2 text-lg font-bold text-primary">
          {formatCOP(price)}
        </p>
      </div>
    </Link>
  );
}
