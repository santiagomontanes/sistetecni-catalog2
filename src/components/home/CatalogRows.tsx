"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import type { Product } from "@/types/product";

function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
}

// Los dígitos del precio "giran" hacia su lugar una sola vez, como una pizarra de salidas.
function FlipText({ text }: { text: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  // Se observa el contenedor (visible), no los dígitos: éstos empiezan recortados fuera de su caja.
  const inView = useInView(ref, { once: true, margin: "-40px" });
  if (reduce) return <>{text}</>;
  return (
    <span ref={ref} aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom" aria-hidden="true">
          <motion.span
            className="inline-block"
            initial={false}
            animate={{ y: inView ? 0 : "105%" }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: i * 0.035 }}
          >
            {ch === " " ? "\u00A0" : ch}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

function conditionLabel(condition: string) {
  const c = condition?.toLowerCase() ?? "";
  if (c.includes("reacondicionado")) return "Reacondicionado";
  if (c.includes("nuevo")) return "Nuevo";
  if (c.includes("buen")) return "Buen estado";
  return null;
}

export function CatalogRowSkeleton() {
  return (
    <li className="grid animate-pulse grid-cols-[88px_1fr] gap-4 border-b border-ink/10 px-4 py-4 md:grid-cols-[104px_1fr_110px_130px_190px_32px] md:items-center">
      <div className="aspect-square rounded bg-ink/10" />
      <div className="space-y-2.5">
        <div className="h-3 w-1/3 rounded bg-ink/10" />
        <div className="h-5 w-4/5 rounded bg-ink/10" />
        <div className="h-5 w-1/4 rounded bg-ink/10 md:hidden" />
      </div>
    </li>
  );
}

export default function CatalogRows({ products }: { products: Product[] }) {
  return (
    <ul className="overflow-hidden rounded-xl border-2 border-ink bg-white">
      {products.map((product, idx) => {
        const imageUrl = product.images?.[0] || "/placeholder.jpg";
        const inStock = product.stock > 0;
        const cond = conditionLabel(product.condition);
        const price = product.finishesEnabled ? "Ver acabados y precios" : formatCOP(Number(product.price || 0));
        return (
          <li key={product.id} className={idx > 0 ? "border-t border-ink/15" : ""}>
            <Link
              href={`/product?id=${product.id}`}
              className="group grid grid-cols-[88px_1fr] gap-4 px-4 py-4 transition-colors duration-200 hover:bg-primary hover:text-white focus-visible:bg-primary focus-visible:text-white md:grid-cols-[104px_1fr_110px_130px_190px_32px] md:items-center motion-reduce:transition-none"
            >
              <div className="relative aspect-square overflow-hidden rounded bg-paper">
                <img
                  src={imageUrl}
                  alt={product.title}
                  loading={idx < 2 ? "eager" : "lazy"}
                  decoding="async"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105 motion-reduce:transition-none"
                />
                {!inStock && (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/80 font-display text-sm font-bold uppercase text-ink">
                    Agotado
                  </span>
                )}
              </div>

              <div className="min-w-0 md:contents">
                <div className="min-w-0">
                  <p className="font-data text-[11px] font-medium uppercase tracking-wider opacity-70">
                    {product.brand} · {product.model}
                    {cond ? ` · ${cond}` : ""}
                  </p>
                  <h3 className="mt-0.5 line-clamp-2 font-display text-2xl font-bold uppercase leading-tight">{product.title}</h3>
                  {!product.finishesEnabled && (product.ram || product.storage) ? (
                    <p className="mt-1 font-data text-xs font-medium opacity-75 md:hidden">
                      {product.ram ? `${product.ram} GB RAM` : ""}
                      {product.ram && product.storage ? " · " : ""}
                      {product.storage || ""}
                    </p>
                  ) : null}
                </div>

                <p className="hidden font-data text-sm font-medium opacity-80 md:block">
                  {!product.finishesEnabled && product.ram ? `${product.ram} GB RAM` : ""}
                </p>
                <p className="hidden font-data text-sm font-medium opacity-80 md:block">
                  {!product.finishesEnabled ? product.storage || "" : ""}
                </p>
                <p className="tnum mt-2 font-data text-xl font-bold text-primary group-hover:text-tape md:mt-0 md:text-right">
                  <FlipText text={price} />
                </p>
                <ArrowRight className="hidden h-5 w-5 transition-transform duration-200 group-hover:translate-x-1 md:block motion-reduce:transition-none" aria-hidden="true" />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
