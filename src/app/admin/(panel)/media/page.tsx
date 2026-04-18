"use client";

import { useEffect, useRef, useState } from "react";
import { getBusinessProfile, updateHeroVideo } from "@/supabase/db";
import { uploadAssetFile } from "@/supabase/storage";

type MediaType = "image" | "video";

export default function AdminMediaPage() {
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getBusinessProfile()
      .then((profile) => {
        if (profile) {
          setMediaType(profile.heroMediaType ?? "image");
          setVideoUrl(profile.heroVideoUrl ?? "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleUploadVideo = async (file: File) => {
    try {
      setUploading(true);
      setError("");
      const url = await uploadAssetFile("hero-video", file);
      setVideoUrl(url);
      setMsg("Video subido. Guarda los cambios para aplicar.");
    } catch (e) {
      setError(`Error al subir: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError("");
      setMsg("");
      await updateHeroVideo(videoUrl.trim(), mediaType);
      setMsg("Configuración guardada correctamente.");
    } catch (e) {
      setError(`Error al guardar: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-text outline-none focus:ring-2 focus:ring-primary/20";
  const btnPrimary =
    "rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60";

  if (loading) return <p className="text-sm text-muted">Cargando configuración...</p>;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Media de la página de inicio</h1>
        <p className="mt-1 text-sm text-muted">
          Configura la imagen o video del hero principal
        </p>
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

      <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
        {/* Type selector */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-text">Tipo de media</p>
          <div className="flex gap-6">
            {(["image", "video"] as MediaType[]).map((t) => (
              <label key={t} className="flex items-center gap-2 cursor-pointer text-sm text-text">
                <input
                  type="radio"
                  name="mediaType"
                  value={t}
                  checked={mediaType === t}
                  onChange={() => setMediaType(t)}
                  className="accent-primary"
                />
                {t === "image" ? "🖼️ Imagen (hero.jpg)" : "🎬 Video"}
              </label>
            ))}
          </div>
        </div>

        {mediaType === "video" && (
          <>
            {/* File upload */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-text">
                Subir video MP4 (máx 50 MB)
              </label>
              <div className="flex gap-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/mp4,video/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUploadVideo(file);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className={btnPrimary}
                >
                  {uploading ? "Subiendo..." : "Seleccionar archivo"}
                </button>
              </div>
            </div>

            {/* URL input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-text">
                O pegar URL de video
              </label>
              <input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=... o URL directa MP4"
                className={inputCls}
              />
              <p className="text-xs text-muted">
                Acepta YouTube, Vimeo o URL directa a archivo MP4
              </p>
            </div>

            {/* Preview */}
            {videoUrl && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-text">Vista previa</p>
                <div className="relative overflow-hidden rounded-xl bg-black aspect-video">
                  <video
                    src={videoUrl}
                    controls
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            )}
          </>
        )}

        <button onClick={() => void handleSave()} disabled={saving} className={btnPrimary}>
          {saving ? "Guardando..." : "💾 Guardar"}
        </button>
      </div>
    </div>
  );
}
