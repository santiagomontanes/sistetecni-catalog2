"use client";

import { useEffect, useRef, useState } from "react";
import { getBusinessProfile, updateBusinessProfile } from "@/supabase/db";
import { uploadAssetFile } from "@/supabase/storage";

interface FormState {
  company_name: string;
  description: string;
  address: string;
  hours: string;
  phone_whatsapp: string;
  email: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  map_link: string;
  logo_url: string;
}

const empty: FormState = {
  company_name: "",
  description: "",
  address: "",
  hours: "",
  phone_whatsapp: "",
  email: "",
  instagram: "",
  facebook: "",
  tiktok: "",
  map_link: "",
  logo_url: "",
};

export default function AdminConfiguracionPage() {
  const [form, setForm] = useState<FormState>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getBusinessProfile()
      .then((profile) => {
        if (profile) {
          setForm({
            company_name: profile.companyName,
            description: profile.description,
            address: profile.address,
            hours: profile.hours,
            phone_whatsapp: profile.phoneWhatsApp,
            email: profile.email,
            instagram: profile.socialLinks.instagram ?? "",
            facebook: profile.socialLinks.facebook ?? "",
            tiktok: profile.socialLinks.tiktok ?? "",
            map_link: profile.locationMapLink ?? "",
            logo_url: profile.logoUrl ?? "",
          });
        }
      })
      .catch(() => setError("No se pudo cargar la configuración."))
      .finally(() => setLoading(false));
  }, []);

  const set = (key: keyof FormState, value: string) =>
    setForm((p) => ({ ...p, [key]: value }));

  const handleUploadLogo = async (file: File) => {
    try {
      setUploading(true);
      setError("");
      const url = await uploadAssetFile("logo", file);
      set("logo_url", url);
      setMsg("Logo subido. Guarda los cambios para aplicar.");
    } catch (e) {
      setError(`Error al subir logo: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMsg("");
    try {
      await updateBusinessProfile(form);
      setMsg("Configuración guardada correctamente.");
    } catch (e) {
      setError(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-text outline-none focus:ring-2 focus:ring-primary/20";
  const labelCls = "block text-sm font-medium text-muted mb-1";
  const btnPrimary =
    "rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60";
  const sectionCls = "rounded-2xl border border-border bg-surface p-6 space-y-4";

  if (loading) return <p className="text-sm text-muted">Cargando configuración...</p>;

  return (
    <form onSubmit={(e) => void handleSave(e)} className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Configuración del negocio</h1>
        <p className="mt-1 text-sm text-muted">Datos generales, contacto y redes sociales</p>
      </div>

      {error && (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {msg && (
        <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {msg}
        </p>
      )}

      {/* Datos generales */}
      <div className={sectionCls}>
        <h2 className="font-semibold text-text">Datos generales</h2>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Nombre del negocio</label>
            <input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} className={inputCls} placeholder="Sistetecni" />
          </div>
          <div>
            <label className={labelCls}>Descripción</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              className={inputCls + " resize-none"}
              placeholder="Descripción del negocio..."
            />
          </div>
          <div>
            <label className={labelCls}>Dirección</label>
            <input value={form.address} onChange={(e) => set("address", e.target.value)} className={inputCls} placeholder="San Diego, Bogotá" />
          </div>
          <div>
            <label className={labelCls}>Horario de atención</label>
            <input value={form.hours} onChange={(e) => set("hours", e.target.value)} className={inputCls} placeholder="Lunes a Sábado · 10:00 AM – 6:00 PM" />
          </div>
        </div>
      </div>

      {/* Contacto */}
      <div className={sectionCls}>
        <h2 className="font-semibold text-text">Contacto</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={labelCls}>WhatsApp (con código de país)</label>
            <input value={form.phone_whatsapp} onChange={(e) => set("phone_whatsapp", e.target.value)} className={inputCls} placeholder="+57 3202210698" />
          </div>
          <div>
            <label className={labelCls}>Email de contacto</label>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} placeholder="correo@ejemplo.com" />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Link de Google Maps</label>
            <input value={form.map_link} onChange={(e) => set("map_link", e.target.value)} className={inputCls} placeholder="https://maps.google.com/..." />
          </div>
        </div>
      </div>

      {/* Redes sociales */}
      <div className={sectionCls}>
        <h2 className="font-semibold text-text">Redes sociales</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className={labelCls}>Instagram (usuario)</label>
            <input value={form.instagram} onChange={(e) => set("instagram", e.target.value)} className={inputCls} placeholder="sistetecni_oficial" />
          </div>
          <div>
            <label className={labelCls}>Facebook (ruta)</label>
            <input value={form.facebook} onChange={(e) => set("facebook", e.target.value)} className={inputCls} placeholder="share/1CKGvFvska/" />
          </div>
          <div>
            <label className={labelCls}>TikTok (usuario)</label>
            <input value={form.tiktok} onChange={(e) => set("tiktok", e.target.value)} className={inputCls} placeholder="@sistetecnioficial" />
          </div>
        </div>
      </div>

      {/* Logo */}
      <div className={sectionCls}>
        <h2 className="font-semibold text-text">Logo del negocio</h2>
        <div className="flex items-center gap-5">
          <div className="h-16 w-16 rounded-xl border border-border bg-white overflow-hidden flex items-center justify-center">
            {form.logo_url ? (
              <img src={form.logo_url} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              <img src="/logo.svg" alt="Logo placeholder" className="h-full w-full object-contain" />
            )}
          </div>
          <div className="space-y-2">
            <input
              ref={logoRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUploadLogo(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => logoRef.current?.click()}
              disabled={uploading}
              className={btnPrimary}
            >
              {uploading ? "Subiendo..." : "Subir nuevo logo"}
            </button>
            <p className="text-xs text-muted">PNG, SVG, WebP — recomendado 200×200 px</p>
          </div>
        </div>
        {form.logo_url && (
          <div className="space-y-1">
            <label className={labelCls}>O pegar URL del logo</label>
            <input value={form.logo_url} onChange={(e) => set("logo_url", e.target.value)} className={inputCls} placeholder="https://..." />
          </div>
        )}
      </div>

      <button disabled={saving} className={btnPrimary}>
        {saving ? "Guardando..." : "💾 Guardar configuración"}
      </button>
    </form>
  );
}
