'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import WhatsAppButton from '@/components/WhatsAppButton';
import { getBusinessProfile, getProductById } from '@/supabase/db';
import type { BusinessProfile } from '@/types/business';
import type { Product } from '@/types/product';

export default function ProductClient() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  const [product, setProduct] = useState<Product | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadProductData() {
      if (!id) {
        setError('No se recibió un ID de producto.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const [productData, profileData] = await Promise.all([getProductById(id), getBusinessProfile()]);

        if (!productData) {
          setError('Producto no encontrado.');
        } else {
          setProduct(productData);
        }

        setProfile(profileData);
      } catch {
        setError('No se pudo cargar el producto.');
      } finally {
        setLoading(false);
      }
    }

    void loadProductData();
  }, [id]);

  if (loading) return <p className="text-sm text-slate-500">Cargando producto...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!product) return <p className="text-sm text-slate-500">Sin información de producto.</p>;

  return (
    <section className="space-y-6 p-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{product.title}</h1>
        <p className="mt-2 text-sm text-slate-600">{product.brand} {product.model}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid gap-3 sm:grid-cols-2">
          {product.images.length > 0 ? (
            product.images.map((imageUrl, index) => (
              <img key={`${imageUrl}-${index}`} src={imageUrl} alt={`${product.title} ${index + 1}`} className="h-44 w-full rounded-lg object-cover" />
            ))
          ) : (
            <p className="text-sm text-slate-500">Sin imágenes del producto.</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
          <p><strong>Precio:</strong> ${product.price.toLocaleString('es-CO')}</p>
          <p><strong>Condición:</strong> {product.condition}</p>
          <p><strong>Stock:</strong> {product.stock}</p>
          <p><strong>CPU:</strong> {product.cpu}</p>
          <p><strong>RAM:</strong> {product.ram} GB</p>
          <p><strong>Almacenamiento:</strong> {product.storage}</p>
          <p><strong>Pantalla:</strong> {product.screen}</p>
          <div className="mt-4">
            <WhatsAppButton phone={profile?.phoneWhatsApp} product={product} fixed={false} />
          </div>
        </div>
      </div>
    </section>
  );
}
