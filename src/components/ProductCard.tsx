import Link from "next/link";
import type { Product } from "@/types/product";

interface ProductCardProps {
  product: Product;
  // Cuando true, la imagen se carga de inmediato (above-the-fold).
  // Por defecto se difiere con loading="lazy" para no descargar
  // imágenes fuera del viewport (principal causa de egress al hacer
  // scroll-grandes en el catálogo).
  priority?: boolean;
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
  if (c.includes("reacondicionado")) return { label: "Reacondicionado", cls: "bg-ink text-white" };
  if (c.includes("nuevo")) return { label: "Nuevo", cls: "bg-success text-white" };
  if (c.includes("buen")) return { label: "Buen estado", cls: "bg-primary text-white" };
  return null;
}

export default function ProductCard({ product, priority = false }: ProductCardProps) {
  const imageUrl = product.images?.[0] || "/placeholder.jpg";
  const price = Number(product.price || 0);
  const badge = getConditionBadge(product.condition);
  const inStock = product.stock > 0;

  return (
    <Link
      href={`/product?id=${product.id}`}
      className="group block overflow-hidden rounded-xl border-2 border-ink bg-white transition-colors duration-200 hover:border-primary motion-reduce:transition-none"
    >
      {/* Square image */}
      <div className="relative aspect-square overflow-hidden bg-surface">
        <img
          src={imageUrl}
          alt={product.title}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "low"}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105 motion-reduce:transition-none"
        />

        {/* Condition badge */}
        {badge && (
          <span
            className={`absolute left-3 top-3 rounded px-2 py-1 font-data text-[10px] font-bold uppercase tracking-wider ${badge.cls}`}
          >
            {badge.label}
          </span>
        )}

        {/* Out of stock overlay */}
        {!inStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80">
            <span className="rounded bg-tape px-4 py-1.5 font-display text-sm font-bold uppercase tracking-wide text-ink">
              Agotado
            </span>
          </div>
        )}
      </div>

      {/* Product info */}
      <div className="space-y-2 border-t-2 border-ink p-4 group-hover:border-primary">
        <p className="font-data text-[11px] font-medium uppercase tracking-wider text-muted">
          {product.brand} · {product.model}
        </p>

        <h3 className="line-clamp-2 font-display text-xl font-bold uppercase leading-tight text-ink">
          {product.title}
        </h3>

        {/* Spec chips */}
        {!product.finishesEnabled && (product.ram || product.storage) && (
          <div className="flex flex-wrap gap-1.5">
            {product.ram ? (
              <span className="rounded bg-paper px-2 py-0.5 font-data text-[11px] font-medium text-ink">
                {product.ram} GB RAM
              </span>
            ) : null}
            {product.storage ? (
              <span className="rounded bg-paper px-2 py-0.5 font-data text-[11px] font-medium text-ink">
                {product.storage}
              </span>
            ) : null}
          </div>
        )}

        {/* Descripción comercial (P20.21A).
            FUENTE ÚNICA: `products.descripcion`, la misma que escribe el
            administrador por WhatsApp y que leen el bot y el catálogo PDF.
            El recorte a 3 líneas es SOLO VISUAL (line-clamp, CSS): el texto
            completo viaja íntegro y se muestra entero en la ficha.
            Se renderiza como texto normal de React —nunca
            dangerouslySetInnerHTML—, así que cualquier cosa que parezca
            HTML se escapa y jamás se ejecuta.
            Sin descripción NO se pinta ningún placeholder: un "N/A"
            ensucia la tarjeta y no aporta nada. */}
        {product.description && !product.finishesEnabled ? (
          <p className="line-clamp-3 text-xs leading-relaxed text-muted">
            {product.description}
          </p>
        ) : null}

        {/* Price */}
        <p className={`tnum text-primary ${product.finishesEnabled ? "font-display text-xl font-bold uppercase" : "font-data text-lg font-bold"}`}>{product.finishesEnabled ? "Ver acabados y precios" : formatCOP(price)}</p>

        {/* Hover CTA */}
        <div className="pt-1">
          <span className="block w-full rounded border-2 border-primary py-2 text-center font-display text-sm font-bold uppercase tracking-wide text-primary transition group-hover:bg-primary group-hover:text-white motion-reduce:transition-none">
            Ver producto
          </span>
        </div>
      </div>
    </Link>
  );
}
