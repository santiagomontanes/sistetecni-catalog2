'use client';

import { useEffect, useState } from 'react';
import { getBusinessProfile } from '@/firebase/firestore';
import type { BusinessProfile } from '@/types/business';

export default function ContactPage() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadBusinessData() {
      try {
        setLoading(true);
        const businessData = await getBusinessProfile();
        setProfile(businessData);
      } finally {
        setLoading(false);
      }
    }

    void loadBusinessData();
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando información de contacto...</p>;
  }

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-900">Contacto</h1>

      <div className="grid gap-4 rounded-xl border border-slate-200 p-6 text-sm text-slate-700 md:grid-cols-2">
        <p><strong>Dirección:</strong> {profile?.address || 'Pendiente por actualizar'}</p>
        <p><strong>Horario:</strong> {profile?.hours || 'Pendiente por actualizar'}</p>
        <p><strong>Email:</strong> {profile?.email || 'Pendiente por actualizar'}</p>
        <p>
          <strong>Mapa:</strong>{' '}
          {profile?.locationMapLink ? (
            <a href={profile.locationMapLink} target="_blank" rel="noopener noreferrer" className="text-sky-700 underline">
              Ver ubicación
            </a>
          ) : (
            'Pendiente por actualizar'
          )}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 p-6 text-sm">
        <h2 className="text-lg font-semibold text-slate-900">Redes sociales</h2>
        <ul className="mt-3 space-y-2 text-slate-700">
          <li>Instagram: {profile?.socialLinks.instagram || 'No disponible'}</li>
          <li>Facebook: {profile?.socialLinks.facebook || 'No disponible'}</li>
          <li>TikTok: {profile?.socialLinks.tiktok || 'No disponible'}</li>
        </ul>
      </div>
    </section>
  );
}
