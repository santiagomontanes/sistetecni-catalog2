"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import FadeIn from "@/components/FadeIn";
import WhatsAppButton from "@/components/WhatsAppButton";
import ProductGallery from "@/components/ProductGallery";
import IncludesSection from "@/components/IncludesSection";
import { getBusinessProfile, getProductById } from "@/supabase/db";
import type { BusinessProfile } from "@/types/business";
import type { Product } from "@/types/product";



function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}


export default function ProductClient() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  const [product, setProduct] = useState<Product | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProductData() {
      if (!id) {
        setError("No se recibió un ID de producto.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const [productData, profileData] = await Promise.all([
          getProductById(id),
          getBusinessProfile(),
        ]);

        if (!productData) {
          setError("Producto no encontrado.");
        } else {
          setProduct(productData);
        }

        setProfile(profileData);
      } catch {
        setError("No se pudo cargar el producto.");
      } finally {
        setLoading(false);
      }
    }

    void loadProductData();
  }, [id]);

  const images = useMemo(() => product?.images ?? [], [product]);

  if (loading) return <p className="text-sm text-muted">Cargando producto...</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!product) return <p className="text-sm text-muted">Sin información de producto.</p>;

  return (
    <section className="space-y-10">
      <FadeIn>
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-widest text-muted">
            {product.brand} {product.model}
          </p>
          <h1 className="text-3xl font-bold text-text md:text-4xl">{product.title}</h1>
          <p className="text-2xl font-bold text-primary">{formatCOP(product.price)}</p>
        </header>
      </FadeIn>

      <FadeIn delay={0.08}>
        <div className="grid gap-8 lg:grid-cols-2">
          <ProductGallery images={images} title={product.title} />

          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold text-text">Especificaciones</h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Spec label="Condición" value={product.condition} />
              <Spec label="Stock" value={String(product.stock)} />
              <Spec label="CPU" value={product.cpu} />
              <Spec label="RAM" value={`${product.ram} GB`} />
              <Spec label="Almacenamiento" value={product.storage} />
              <Spec label="Pantalla" value={product.screen} />
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <WhatsAppButton phone={profile?.phoneWhatsApp} product={product} fixed={false} />

              <a
                href="/catalog"
                className="rounded-xl border border-border bg-bg/20 px-6 py-3 text-sm font-medium text-muted transition hover:bg-bg/40"
              >
                Volver al catálogo
              </a>
            </div>

            <p className="mt-4 text-xs text-muted">
              Garantía 8 meses • Soporte post-venta • Envíos nacionales
            </p>
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={0.16}>
        <IncludesSection />
      </FadeIn>
    </section>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-bg/20 px-4 py-3">
      <span className="text-sm font-medium text-muted">{label}</span>
      <span className="text-sm text-text">{value}</span>
    </div>
  );
}
