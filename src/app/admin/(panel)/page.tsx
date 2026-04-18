"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getProducts, getAllGalleryImages, getAllTestimonials } from "@/supabase/db";

interface StatCard {
  label: string;
  value: number | null;
  icon: string;
  href: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<StatCard[]>([
    { label: "Total productos", value: null, icon: "📦", href: "/admin/productos" },
    { label: "Visibles en web", value: null, icon: "👁", href: "/admin/productos" },
    { label: "Fotos galería", value: null, icon: "🖼️", href: "/admin/galeria" },
    { label: "Testimonios", value: null, icon: "✍️", href: "/admin/testimonios" },
  ]);

  useEffect(() => {
    Promise.all([getProducts(), getAllGalleryImages(), getAllTestimonials()])
      .then(([products, gallery, testimonials]) => {
        setStats([
          { label: "Total productos", value: products.length, icon: "📦", href: "/admin/productos" },
          {
            label: "Visibles en web",
            value: products.filter((p) => p.visibleWeb).length,
            icon: "👁",
            href: "/admin/productos",
          },
          { label: "Fotos galería", value: gallery.filter((g) => g.activa).length, icon: "🖼️", href: "/admin/galeria" },
          { label: "Testimonios", value: testimonials.length, icon: "✍️", href: "/admin/testimonios" },
        ]);
      })
      .catch(() => {});
  }, []);

  const quickLinks = [
    { href: "/admin/productos", icon: "📦", label: "Gestionar productos", desc: "Crear, editar y controlar visibilidad" },
    { href: "/admin/galeria", icon: "🖼️", label: "Galería de fotos", desc: "Subir y reordenar fotos de equipos" },
    { href: "/admin/media", icon: "🎬", label: "Media del inicio", desc: "Cambiar imagen o video del hero" },
    { href: "/admin/testimonios", icon: "✍️", label: "Testimonios", desc: "Gestionar reseñas de clientes" },
    { href: "/admin/configuracion", icon: "⚙️", label: "Configuración", desc: "Datos del negocio y redes sociales" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">Resumen del catálogo Sistetecni</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="block rounded-2xl border border-border bg-surface p-5 transition hover:border-primary"
          >
            <div className="text-2xl mb-2">{stat.icon}</div>
            <div className="text-3xl font-bold text-text">
              {stat.value === null ? (
                <span className="inline-block h-8 w-10 animate-pulse rounded bg-border" />
              ) : (
                stat.value
              )}
            </div>
            <div className="mt-1 text-sm text-muted">{stat.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quickLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-5 transition hover:border-primary"
          >
            <span className="text-2xl">{item.icon}</span>
            <div>
              <div className="text-sm font-semibold text-text">{item.label}</div>
              <div className="mt-0.5 text-xs text-muted">{item.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
