"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import HomeHero from "@/components/home/HomeHero";
import TapeMarquee from "@/components/home/TapeMarquee";
import TrackingSteps from "@/components/home/TrackingSteps";
import CatalogRows, { CatalogRowSkeleton } from "@/components/home/CatalogRows";
import SocialVideos from "@/components/home/SocialVideos";
import { ArrowRight } from "lucide-react";
import Testimonials from "@/components/Testimonials";
import CommercialGallery from "@/components/CommercialGallery";
import BigCTA from "@/components/BigCTA";
import SoftwarePreview from "@/components/SoftwarePreview";

import { getBusinessProfile, getProducts, getTestimonials, getGalleryImages } from "@/supabase/db";
import type { BusinessProfile } from "@/types/business";
import type { Product } from "@/types/product";
import type { Testimonial } from "@/types/testimonial";
import type { GalleryImage } from "@/types/gallery";

export default function HomePage() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadHomeData = async () => {
      try {
        setLoading(true);
        setError("");

        const [businessData, productsData, testimonialsData, galleryData] = await Promise.all([
          getBusinessProfile(),
          getProducts({ featured: true, maxItems: 4, visibleOnly: true }),
          getTestimonials(4),
          getGalleryImages(),
        ]);

        setProfile(businessData);
        setFeaturedProducts(productsData);
        setTestimonials(testimonialsData);
        setGalleryImages(galleryData);
      } catch {
        setError("No se pudo cargar la información pública.");
      } finally {
        setLoading(false);
      }
    };

    void loadHomeData();
  }, []);

  return (
    <div>
      <HomeHero
        companyName={profile?.companyName ?? "Sistetecni"}
        description={
          profile?.description ??
          "Tecnología corporativa y software para impulsar tu negocio, con equipos reacondicionados, garantía real y soporte postventa."
        }
        heroVideoUrl={profile?.heroVideoUrl}
        heroMediaType={profile?.heroMediaType}
      />

      <TapeMarquee />

      <TrackingSteps />

      {/* Productos destacados */}
      <section className="on-white py-20">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-4xl font-extrabold uppercase leading-none text-ink md:text-5xl">
              Productos destacados
            </h2>
            <p className="mt-3 font-body text-lg text-ink/70">Los equipos más buscados esta semana</p>
          </div>
          <Link
            href="/catalog"
            className="hidden shrink-0 items-center gap-2 font-display text-xl font-bold uppercase tracking-wide text-primary underline-offset-4 transition hover:underline md:inline-flex"
          >
            Ver todos <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-md border-2 border-red-600 bg-red-50 px-4 py-3 font-body text-base text-red-700">
            {error}
          </p>
        )}

        {loading ? (
          <ul className="overflow-hidden rounded-xl border-2 border-ink bg-white">
            {Array.from({ length: 4 }).map((_, i) => (
              <CatalogRowSkeleton key={i} />
            ))}
          </ul>
        ) : (
          featuredProducts.length > 0 && <CatalogRows products={featuredProducts} />
        )}

        {!loading && featuredProducts.length === 0 && !error && (
          <p className="rounded-md border-2 border-dashed border-ink/30 p-6 text-center font-body text-base text-ink/70">
            No hay productos destacados aún.
          </p>
        )}

        <div className="mt-8">
          <Link
            href="/catalog"
            className="inline-flex h-14 items-center justify-center rounded-xl bg-primary px-9 font-display text-xl font-bold uppercase tracking-wide text-white transition duration-200 hover:bg-ink motion-reduce:transition-none max-md:w-full"
          >
            Ver todos los equipos
          </Link>
        </div>
      </section>

      <SocialVideos socialLinks={profile?.socialLinks} />

      <SoftwarePreview />

      <CommercialGallery images={galleryImages} />

      <Testimonials testimonials={testimonials} />

      <BigCTA />
    </div>
  );
}
