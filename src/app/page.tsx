"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Benefits from "@/components/Benefits";
import Hero from "@/components/Hero";
import ProductCard from "@/components/ProductCard";
import Testimonials from "@/components/Testimonials";
import Stats from "@/components/Stats";
import CommercialGallery from "@/components/CommercialGallery";
import BigCTA from "@/components/BigCTA";
import FadeIn from "@/components/FadeIn";
import SoftwarePreview from "@/components/SoftwarePreview";

import { getBusinessProfile, getProducts, getTestimonials } from "@/supabase/db";
import type { BusinessProfile } from "@/types/business";
import type { Product } from "@/types/product";
import type { Testimonial } from "@/types/testimonial";

function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-border bg-white">
      <div className="aspect-square bg-surface" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-2/5 rounded-md bg-border" />
        <div className="h-4 w-4/5 rounded-md bg-border" />
        <div className="h-3 w-3/5 rounded-md bg-border" />
        <div className="h-6 w-2/5 rounded-md bg-border" />
      </div>
    </div>
  );
}

export default function HomePage() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadHomeData = async () => {
      try {
        setLoading(true);
        setError("");

        const [businessData, productsData, testimonialsData] = await Promise.all([
          getBusinessProfile(),
          getProducts({ featured: true, maxItems: 4, visibleOnly: true }),
          getTestimonials(4),
        ]);

        setProfile(businessData);
        setFeaturedProducts(productsData);
        setTestimonials(testimonialsData);
      } catch {
        setError("No se pudo cargar la información pública.");
      } finally {
        setLoading(false);
      }
    };

    void loadHomeData();
  }, []);

  return (
    <div className="space-y-16">
      <FadeIn>
        <Hero
          companyName={profile?.companyName ?? "Sistetecni"}
          description={
            profile?.description ??
            "Tecnología corporativa y software para impulsar tu negocio, con equipos reacondicionados, garantía real y soporte postventa."
          }
        />
      </FadeIn>

      <FadeIn delay={0.06}>
        <Benefits />
      </FadeIn>

      {/* Featured products */}
      <FadeIn delay={0.1}>
        <section>
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold text-text">Productos destacados</h2>
              <p className="mt-1 text-sm text-muted">
                Los equipos más buscados esta semana
              </p>
            </div>
            <Link
              href="/catalog"
              className="hidden text-sm font-semibold text-primary transition hover:underline md:block"
            >
              Ver todos →
            </Link>
          </div>

          {error && (
            <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
              : featuredProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
          </div>

          {!loading && featuredProducts.length === 0 && !error && (
            <p className="mt-4 rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
              No hay productos destacados aún.
            </p>
          )}

          <div className="mt-6 text-center md:hidden">
            <Link
              href="/catalog"
              className="inline-block rounded-full border border-primary px-6 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary hover:text-white"
            >
              Ver todos los equipos →
            </Link>
          </div>
        </section>
      </FadeIn>

      <FadeIn delay={0.14}>
        <Stats />
      </FadeIn>

      <FadeIn delay={0.18}>
        <SoftwarePreview />
      </FadeIn>

      <FadeIn delay={0.22}>
        <CommercialGallery />
      </FadeIn>

      <FadeIn delay={0.26}>
        <Testimonials testimonials={testimonials} />
      </FadeIn>

      <FadeIn delay={0.3}>
        <BigCTA />
      </FadeIn>
    </div>
  );
}
