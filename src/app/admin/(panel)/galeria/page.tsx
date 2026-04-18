"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  getAllGalleryImages,
  createGalleryImage,
  updateGalleryImage,
  deleteGalleryImage,
  reorderGalleryImages,
} from "@/supabase/db";
import { uploadGalleryImage } from "@/supabase/storage";
import type { GalleryImage } from "@/types/gallery";

const MAX_ACTIVE = 12;

export default function AdminGaleriaPage() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [editCaption, setEditCaption] = useState<Record<number, string>>({});
  const [uploading, setUploading] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      setLoading(true);
      const data = await getAllGalleryImages();
      setImages(data);
      const captions: Record<number, string> = {};
      data.forEach((img) => { captions[img.id] = img.caption ?? ""; });
      setEditCaption(captions);
    } catch {
      setError("No se pudo cargar la galería.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const activeCount = images.filter((i) => i.activa).length;

  const handleUploadFile = async (file: File) => {
    if (activeCount >= MAX_ACTIVE) {
      setError(`Máximo ${MAX_ACTIVE} fotos activas. Elimina alguna primero.`);
      return;
    }
    try {
      setUploading(true);
      setError("");
      const url = await uploadGalleryImage(file);
      await createGalleryImage({ url, orden: activeCount });
      setMsg("Foto subida correctamente.");
      await load();
    } catch (e) {
      setError(`Error al subir: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setUploading(false);
    }
  };

  const handleAddUrl = async () => {
    if (!newUrl.trim()) return;
    if (activeCount >= MAX_ACTIVE) {
      setError(`Máximo ${MAX_ACTIVE} fotos activas.`);
      return;
    }
    try {
      setError("");
      await createGalleryImage({ url: newUrl.trim(), orden: activeCount });
      setNewUrl("");
      setMsg("Foto agregada.");
      await load();
    } catch (e) {
      setError(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    }
  };

  const handleSaveCaption = async (id: number) => {
    try {
      await updateGalleryImage(id, { caption: editCaption[id] ?? "" });
      setMsg("Caption guardado.");
      await load();
    } catch {
      setError("No se pudo guardar el caption.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("¿Eliminar esta foto?")) return;
    try {
      await deleteGalleryImage(id);
      setMsg("Foto eliminada.");
      await load();
    } catch {
      setError("No se pudo eliminar la foto.");
    }
  };

  const handleMove = async (index: number, dir: -1 | 1) => {
    const active = images.filter((i) => i.activa);
    const newOrder = [...active];
    const target = index + dir;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]];
    await reorderGalleryImages(newOrder.map((i) => i.id));
    await load();
  };

  const activeImages = images.filter((i) => i.activa);

  const inputCls =
    "w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-text outline-none focus:ring-2 focus:ring-primary/20";
  const btnPrimary =
    "rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60";
  const btnGhost =
    "rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:border-primary hover:text-primary";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Galería de fotos</h1>
        <p className="mt-1 text-sm text-muted">
          {activeCount}/{MAX_ACTIVE} fotos activas · sección &quot;Equipos reales, calidad real&quot;
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

      {/* Upload section */}
      <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
        <h2 className="font-semibold text-text">Agregar foto</h2>

        <div className="space-y-2">
          <label className="text-sm text-muted">Subir archivo (JPG, PNG, WebP)</label>
          <div className="flex gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUploadFile(file);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading || activeCount >= MAX_ACTIVE}
              className={btnPrimary}
            >
              {uploading ? "Subiendo..." : "Seleccionar archivo"}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted">O pegar URL de imagen</label>
          <div className="flex gap-3">
            <input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://..."
              className={inputCls}
            />
            <button
              onClick={() => void handleAddUrl()}
              disabled={!newUrl.trim() || activeCount >= MAX_ACTIVE}
              className={btnPrimary}
            >
              Agregar
            </button>
          </div>
        </div>
      </div>

      {/* Gallery grid */}
      {loading ? (
        <p className="text-sm text-muted">Cargando galería...</p>
      ) : activeImages.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          No hay fotos en la galería. Agrega la primera.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeImages.map((img, idx) => (
            <div
              key={img.id}
              className="rounded-2xl border border-border bg-surface overflow-hidden"
            >
              <div className="relative h-48">
                <Image
                  src={img.url}
                  alt={img.caption ?? "Foto galería"}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover"
                />
              </div>
              <div className="p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={editCaption[img.id] ?? ""}
                    onChange={(e) =>
                      setEditCaption((prev) => ({ ...prev, [img.id]: e.target.value }))
                    }
                    placeholder="Caption (descripción)"
                    className={inputCls}
                  />
                  <button onClick={() => void handleSaveCaption(img.id)} className={btnPrimary}>
                    ✓
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    <button
                      onClick={() => void handleMove(idx, -1)}
                      disabled={idx === 0}
                      className={btnGhost}
                      title="Mover arriba"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => void handleMove(idx, 1)}
                      disabled={idx === activeImages.length - 1}
                      className={btnGhost}
                      title="Mover abajo"
                    >
                      ↓
                    </button>
                  </div>
                  <button
                    onClick={() => void handleDelete(img.id)}
                    className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
