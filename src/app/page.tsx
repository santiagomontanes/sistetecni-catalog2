"use client";

import { useEffect, useState } from "react";
import Benefits from "@/components/Benefits";
import Hero from "@/components/Hero";
import ProductCard from "@/components/ProductCard";
import Testimonials from "@/components/Testimonials";
import Stats from "@/components/Stats";
import CommercialGallery from "@/components/CommercialGallery";
import BigCTA from "@/components/BigCTA";
import FadeIn from "@/components/FadeIn";

import { getBusinessProfile, getProducts, getTestimonials } from "@/supabase/db";
import type { BusinessProfile } from "@/types/business";
import type { Product } from "@/types/product";
import type { Testimonial } from "@/types/testimonial";

export default function HomePage() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [testimonials, setTestimonialsState] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadHomeData() {
      try {
        setLoading(true);
        const [businessData, productsData, testimonialsData] = await Promise.all([
          getBusinessProfile(),
          getProducts({ featured: true, maxItems: 4 }),
          getTestimonials(4),
        ]);

        setProfile(businessData);
        setFeaturedProducts(productsData);
        setTestimonialsState(testimonialsData);
      } catch {
        setError("No se pudo cargar la información pública.");
      } finally {
        setLoading(false);
      }
    }

    void loadHomeData();
  }, []);

  return (
    <div className="space-y-14">
      <FadeIn>
        <Hero
          companyName={profile?.companyName ?? "Sistetecni"}
          description={
            profile?.description ??
            "Computadores corporativos reacondicionados con garantía real, soporte post-venta y envíos nacionales desde Bogotá."
          }
        />
      </FadeIn>

      <FadeIn delay={0.06}>
        <Benefits />
      </FadeIn>

      <FadeIn delay={0.1}>
        <Stats />
      </FadeIn>

      <FadeIn delay={0.14}>
        <section>
          <h2 className="text-2xl font-semibold text-text">Productos destacados</h2>

          {loading ? <p className="mt-4 text-sm text-muted">Cargando productos...</p> : null}
          {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

          {!loading && !error && featuredProducts.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
              No hay productos destacados aún.
            </p>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      </FadeIn>

      <FadeIn delay={0.18}>
        <CommercialGallery />
      </FadeIn>

      <FadeIn delay={0.22}>
        <Testimonials testimonials={testimonials} />
      </FadeIn>

      <FadeIn delay={0.26}>
        <BigCTA />
      </FadeIn>
    </div>
  );
}
