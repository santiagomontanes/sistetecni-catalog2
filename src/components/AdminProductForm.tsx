"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabase/client";
import { createProduct, updateProduct, getProductByIdAdmin } from "@/supabase/db";
import { checkImageFile, IMAGE_MAX_BYTES, IMAGE_WARN_BYTES, uploadProductImage } from "@/supabase/storage";
import type { GpuType, Product } from "@/types/product";

interface AdminProductFormProps {
  selectedProduct: Product | null;
  onSaved: () => Promise<void>;
  onCancelEdit: () => void;
}

interface ProductFormState {
  title: string;
  brand: string;
  model: string;
  cpu: string;
  ram: number;
  storage: string;
  screen: string;
  price: number;
  condition: string;
  stock: number;
  featured: boolean;
  visibleWeb: boolean;
  // Columnas del personalizador (Fase 2B/B6) — características BASE del
  // equipo, nunca "upgradeables" desde aquí (eso lo define la sección de
  // Compatibilidad, sobre RAM/almacenamiento). null = no confirmado, nunca
  // se asume un valor por defecto silenciosamente.
  cpuGeneration: number | null;
  gpuType: GpuType | null;
  gpuModel: string;
  touchScreen: boolean | null;
  screenSizeInches: number | null;
  storageGb: number | null;
}

const initialState: ProductFormState = {
  title: "",
  brand: "",
  model: "",
  cpu: "",
  ram: 8,
  storage: "",
  screen: "",
  price: 0,
  condition: "Usado",
  stock: 1,
  featured: false,
  visibleWeb: true,
  cpuGeneration: null,
  gpuType: null,
  gpuModel: "",
  touchScreen: null,
  screenSizeInches: null,
  storageGb: null,
};

function fromProduct(product: Product): ProductFormState {
  return {
    title: product.title ?? "",
    brand: product.brand ?? "",
    model: product.model ?? "",
    cpu: product.cpu ?? "",
    ram: Number(product.ram ?? 8),
    storage: product.storage ?? "",
    screen: product.screen ?? "",
    price: Number(product.price ?? 0),
    condition: product.condition ?? "Usado",
    stock: Number(product.stock ?? 1),
    featured: Boolean(product.featured),
    visibleWeb: product.visibleWeb !== false,
    cpuGeneration: product.cpuGeneration ?? null,
    gpuType: product.gpuType ?? null,
    gpuModel: product.gpuModel ?? "",
    touchScreen: product.touchScreen ?? null,
    screenSizeInches: product.screenSizeInches ?? null,
    storageGb: product.storageGb ?? null,
  };
}

function formatError(err: unknown): string {
  if (!err) return "Error desconocido.";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Ocurrió un error.";
}

/**
 * Si tus imágenes vienen de Supabase Storage public:
 * https://xxxx.supabase.co/storage/v1/object/public/<bucket>/<path>
 * Aquí intentamos extraer <path> para hacer remove([path])
 */
function getStoragePathFromPublicUrl(url: string, bucket: string) {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.substring(idx + marker.length);
}

export default function AdminProductForm({
  selectedProduct,
  onSaved,
  onCancelEdit,
}: AdminProductFormProps) {
  const [form, setForm] = useState<ProductFormState>(initialState);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [imageWarning, setImageWarning] = useState("");

  const isEditing = useMemo(() => Boolean(selectedProduct?.id), [selectedProduct]);

  useEffect(() => {
    setMessage("");
    setError("");
    setImageWarning("");
    setNewImages([]);

    if (selectedProduct) {
      // `selectedProduct` viene del listado (getProductsList), que omite
      // las columnas del personalizador para no aumentar el egress de la
      // página pública de catálogo (mismo query que usa /catalog). Se
      // relee el producto completo aquí — solo al entrar a editar, no en
      // cada render del listado.
      setForm(fromProduct(selectedProduct));
      setImages(selectedProduct.images ?? []);
      void getProductByIdAdmin(selectedProduct.id).then((full) => {
        if (full) {
          setForm(fromProduct(full));
          setImages(full.images ?? []);
        }
      });
    } else {
      setForm(initialState);
      setImages([]);
    }
  }, [selectedProduct]);

  const handleChange = (field: keyof ProductFormState, value: string | number | boolean | null) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // ✅ Eliminar una imagen (array + BD + intenta borrar del Storage)
  const onRemoveImage = async (url: string) => {
    if (!selectedProduct?.id) return;

    setError("");
    setMessage("");
    setImageWarning("");

    const next = images.filter((img) => img !== url);
    setImages(next);

    try {
      // 1) actualiza en BD
      await updateProduct(selectedProduct.id, { images: next });

      // 2) intenta borrar del Storage (opcional)
      // Cambia "products" si tu bucket tiene otro nombre
      const BUCKET = "products";
      const path = getStoragePathFromPublicUrl(url, BUCKET);
      if (path) {
        const { error: delErr } = await supabase.storage.from(BUCKET).remove([path]);
        if (delErr) {
          // no bloquea, solo avisa
          setImageWarning(`Se eliminó del producto, pero no se pudo borrar del storage. (${delErr.message})`);
        }
      }

      setMessage("Imagen eliminada.");
      await onSaved();
    } catch (err) {
      setError(`No se pudo eliminar la imagen. (${formatError(err)})`);
      // rollback visual si falla
      setImages(images);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setImageWarning("");
    setIsSaving(true);

    try {
      // 1) Guarda/actualiza el producto
      const payload = { ...form, images };

      let productId = selectedProduct?.id;

      if (isEditing && productId) {
        await updateProduct(productId, payload);
      } else {
        productId = await createProduct(payload);
      }

      // 2) Subir imágenes nuevas (si falla, no daña guardado)
      if (newImages.length > 0 && productId) {
        try {
          const uploadedUrls: string[] = [];

          for (const file of newImages) {
            const url = await uploadProductImage(productId, file);
            if (url) uploadedUrls.push(url);
          }

          if (uploadedUrls.length > 0) {
            const merged = [...images, ...uploadedUrls];
            setImages(merged);
            await updateProduct(productId, { images: merged });
          }
        } catch (imgErr) {
          setImageWarning(`El producto se guardó, pero no se pudieron subir las imágenes. (${formatError(imgErr)})`);
        }
      }

      setMessage(isEditing ? "Producto actualizado correctamente." : "Producto creado correctamente.");
      setNewImages([]);

      if (!isEditing) {
        setForm(initialState);
        setImages([]);
      }

      await onSaved();
      if (isEditing) onCancelEdit();
    } catch (err) {
      setError(`No se pudo guardar el producto. (${formatError(err)})`);
    } finally {
      setIsSaving(false);
    }
  };

  // ✅ estilos dark consistentes
  const panel = "space-y-4 rounded-2xl border border-border bg-surface p-6";
  const h2 = "text-xl font-semibold text-text";
  const label = "block text-sm font-medium text-muted";
  const input =
    "w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text placeholder:text-muted outline-none focus:ring-2 focus:ring-primary/20";
  const buttonPrimary =
    "rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60";
  const buttonGhost =
    "rounded-xl border border-border bg-surface px-5 py-3 text-sm font-semibold text-text transition hover:border-primary hover:text-primary";

  return (
    <form onSubmit={handleSubmit} className={panel}>
      <h2 className={h2}>{isEditing ? "Editar producto" : "Nuevo producto"}</h2>

      <div className="grid gap-3 md:grid-cols-2">
        <input
          required
          value={form.title}
          onChange={(e) => handleChange("title", e.target.value)}
          placeholder="Título"
          className={input}
        />
        <input
          required
          value={form.brand}
          onChange={(e) => handleChange("brand", e.target.value)}
          placeholder="Marca"
          className={input}
        />
        <input
          required
          value={form.model}
          onChange={(e) => handleChange("model", e.target.value)}
          placeholder="Modelo"
          className={input}
        />
        <input value={form.cpu} onChange={(e) => handleChange("cpu", e.target.value)} placeholder="CPU" className={input} />
        <input
          type="number"
          min={1}
          value={form.ram}
          onChange={(e) => handleChange("ram", Number(e.target.value))}
          placeholder="RAM"
          className={input}
        />
        <input
          value={form.storage}
          onChange={(e) => handleChange("storage", e.target.value)}
          placeholder="Almacenamiento"
          className={input}
        />
        <input
          value={form.screen}
          onChange={(e) => handleChange("screen", e.target.value)}
          placeholder="Pantalla"
          className={input}
        />
        <input
          type="number"
          min={0}
          value={form.price}
          onChange={(e) => handleChange("price", Number(e.target.value))}
          placeholder="Precio"
          className={input}
        />
        <input
          value={form.condition}
          onChange={(e) => handleChange("condition", e.target.value)}
          placeholder="Condición"
          className={input}
        />
        <input
          type="number"
          min={0}
          value={form.stock}
          onChange={(e) => handleChange("stock", Number(e.target.value))}
          placeholder="Stock"
          className={input}
        />
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-white p-4">
        <div>
          <p className="text-sm font-semibold text-text">Características del personalizador</p>
          <p className="text-xs text-muted">
            Especificaciones BASE del equipo — nunca se ofrecen como &quot;upgrade&quot;. Solo RAM y
            almacenamiento se amplían, y eso se configura aparte en Compatibilidad. Deja un campo vacío si no
            está confirmado — nunca se asume un valor por defecto.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className={label}>Generación de CPU</label>
            <input
              type="number"
              min={1}
              value={form.cpuGeneration ?? ""}
              onChange={(e) => handleChange("cpuGeneration", e.target.value === "" ? null : Number(e.target.value))}
              placeholder="Ej. 8 (no confirmado si vacío)"
              className={input}
            />
          </div>

          <div>
            <label className={label}>Tarjeta gráfica</label>
            <select
              value={form.gpuType ?? ""}
              onChange={(e) => handleChange("gpuType", e.target.value === "" ? null : (e.target.value as GpuType))}
              className={input}
            >
              <option value="">No confirmado</option>
              <option value="integrada">Integrada</option>
              <option value="dedicada">Dedicada</option>
            </select>
          </div>

          <div>
            <label className={label}>Modelo de GPU (opcional)</label>
            <input
              value={form.gpuModel}
              onChange={(e) => handleChange("gpuModel", e.target.value)}
              placeholder="Ej. NVIDIA GeForce MX450"
              className={input}
            />
          </div>

          <div>
            <label className={label}>Pantalla táctil</label>
            <select
              value={form.touchScreen === null ? "" : form.touchScreen ? "si" : "no"}
              onChange={(e) =>
                handleChange("touchScreen", e.target.value === "" ? null : e.target.value === "si")
              }
              className={input}
            >
              <option value="">No confirmado</option>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </div>

          <div>
            <label className={label}>Tamaño de pantalla (pulgadas)</label>
            <input
              type="number"
              min={1}
              step={0.1}
              value={form.screenSizeInches ?? ""}
              onChange={(e) =>
                handleChange("screenSizeInches", e.target.value === "" ? null : Number(e.target.value))
              }
              placeholder="Ej. 14"
              className={input}
            />
          </div>

          <div>
            <label className={label}>Almacenamiento actual (GB)</label>
            <input
              type="number"
              min={1}
              value={form.storageGb ?? ""}
              onChange={(e) => handleChange("storageGb", e.target.value === "" ? null : Number(e.target.value))}
              placeholder="Ej. 256"
              className={input}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={form.featured}
            onChange={(e) => handleChange("featured", e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Producto destacado
        </label>
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={form.visibleWeb}
            onChange={(e) => handleChange("visibleWeb", e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Visible en catálogo público
        </label>
      </div>

      <div className="space-y-2">
        <label className={label}>
          Imágenes (opcionales) — máx {Math.round(IMAGE_MAX_BYTES / 1024)} KB c/u, recomendado &lt;{Math.round(IMAGE_WARN_BYTES / 1024)} KB. Convierte a WebP en{" "}
          <a
            href="https://squoosh.app"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            squoosh.app
          </a>{" "}
          antes de subir.
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            const valid: File[] = [];
            const problems: string[] = [];
            files.forEach((f) => {
              const c = checkImageFile(f);
              if (!c.ok) {
                problems.push(`✗ ${f.name}: ${c.error}`);
              } else {
                valid.push(f);
                if (c.warning) problems.push(`⚠ ${f.name}: ${c.warning}`);
              }
            });
            setNewImages(valid);
            setImageWarning(problems.join("\n"));
            if (problems.length > 0) {
              // Limpiamos el input si TODO fue rechazado para no confundir
              if (valid.length === 0) e.target.value = "";
            }
          }}
          className="block w-full text-sm text-muted file:mr-4 file:rounded-lg file:border-0 file:bg-surface file:px-4 file:py-2 file:text-sm file:font-semibold file:text-text hover:file:bg-border"
        />
        {newImages.length > 0 ? (
          <p className="text-xs text-muted">
            {newImages.length} archivo{newImages.length !== 1 ? "s" : ""} listo
            {newImages.length !== 1 ? "s" : ""} para subir ·{" "}
            {Math.round(newImages.reduce((a, f) => a + f.size, 0) / 1024)} KB total
          </p>
        ) : null}

        {/* Imágenes actuales */}
        {isEditing ? (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="mb-3 text-sm font-semibold text-text">Imágenes actuales</p>

            {images.length === 0 ? (
              <p className="text-sm text-muted">No hay imágenes todavía.</p>
            ) : (
              <ul className="space-y-2">
                {images.map((url) => (
                  <li
                    key={url}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3"
                  >
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-sm text-primary hover:underline"
                      title={url}
                    >
                      Ver imagen
                    </a>

                    <button type="button" onClick={() => void onRemoveImage(url)} className={buttonGhost}>
                      Eliminar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {imageWarning ? (
        <pre className="whitespace-pre-wrap rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
          {imageWarning}
        </pre>
      ) : null}
      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button disabled={isSaving} className={buttonPrimary}>
          {isSaving ? "Guardando..." : isEditing ? "Actualizar" : "Crear"}
        </button>

        {isEditing ? (
          <button type="button" onClick={onCancelEdit} className={buttonGhost}>
            Cancelar edición
          </button>
        ) : null}
      </div>
    </form>
  );
}
