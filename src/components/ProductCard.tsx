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

function getConditionBadge(condition: string) {
  const c = condition?.toLowerCase() ?? "";
  if (c.includes("reacondicionado")) return { label: "Reacondicionado", cls: "bg-primary text-white" };
  if (c.includes("nuevo")) return { label: "Nuevo", cls: "bg-success text-white" };
  if (c.includes("buen")) return { label: "Buen estado", cls: "bg-blue-500 text-white" };
  return null;
}

export default function ProductCard({ product }: ProductCardProps) {
  const imageUrl = product.images?.[0] || "/placeholder.jpg";
  const price = Number(product.price || 0);
  const badge = getConditionBadge(product.condition);
  const inStock = product.stock > 0;

  return (
    <Link
      href={`/product?id=${product.id}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-white transition duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10"
    >
      {/* Square image */}
      <div className="relative aspect-square overflow-hidden bg-surface">
        <img
          src={imageUrl}
          alt={product.title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />

        {/* Condition badge */}
        {badge && (
          <span
            className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold ${badge.cls}`}
          >
            {badge.label}
          </span>
        )}

        {/* Out of stock overlay */}
        {!inStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm">
            <span className="rounded-full bg-text px-4 py-1.5 text-xs font-semibold text-white">
              Agotado
            </span>
          </div>
        )}
      </div>

      {/* Product info */}
      <div className="space-y-2 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {product.brand} · {product.model}
        </p>

        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-text">
          {product.title}
        </h3>

        {/* Spec chips */}
        {(product.ram || product.storage) && (
          <div className="flex flex-wrap gap-1.5">
            {product.ram ? (
              <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
                {product.ram} GB RAM
              </span>
            ) : null}
            {product.storage ? (
              <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
                {product.storage}
              </span>
            ) : null}
          </div>
        )}

        {/* Price */}
        <p className="text-xl font-bold text-primary">{formatCOP(price)}</p>

        {/* Hover CTA */}
        <div className="pt-1">
          <span className="block w-full rounded-full border border-primary py-2 text-center text-xs font-semibold text-primary transition group-hover:bg-primary group-hover:text-white">
            Ver producto
          </span>
        </div>
      </div>
    </Link>
  );
}
