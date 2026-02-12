'use client';

import { useEffect, useState } from 'react';
import Benefits from '@/components/Benefits';
import Gallery from '@/components/Gallery';
import Hero from '@/components/Hero';
import ProductCard from '@/components/ProductCard';
import Testimonials from '@/components/Testimonials';
import { getBusinessProfile, getProducts, getTestimonials } from '@/firebase/firestore';
import type { BusinessProfile } from '@/types/business';
import type { Product } from '@/types/product';
import type { Testimonial } from '@/types/testimonial';

export default function HomePage() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [testimonials, setTestimonialsState] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
        setError('No se pudo cargar la información pública.');
      } finally {
        setLoading(false);
      }
    }

    void loadHomeData();
  }, []);

  return (
    <div className="space-y-12">
      <Hero
        companyName={profile?.companyName ?? 'Sistetecni'}
        description={profile?.description ?? 'Tecnología confiable para impulsar tu negocio.'}
      />
      <Benefits />

      <section>
        <h2 className="text-2xl font-semibold text-slate-900">Productos destacados</h2>
        {loading ? <p className="mt-4 text-sm text-slate-500">Cargando productos...</p> : null}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {!loading && !error && featuredProducts.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
            No hay productos destacados aún.
          </p>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {featuredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <Gallery photos={profile?.localPhotos ?? []} />
      <Testimonials testimonials={testimonials} />
    </div>
  );
}
