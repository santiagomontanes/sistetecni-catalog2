'use client';

import { useEffect, useMemo, useState } from 'react';
import { createProduct, updateProduct } from '@/supabase/db';
import { uploadProductImage } from '@/supabase/storage';
import type { Product } from '@/types/product';

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
}

const initialState: ProductFormState = {
  title: '',
  brand: '',
  model: '',
  cpu: '',
  ram: 8,
  storage: '',
  screen: '',
  price: 0,
  condition: 'Usado',
  stock: 1,
  featured: false,
};

function fromProduct(product: Product): ProductFormState {
  return {
    title: product.title ?? '',
    brand: product.brand ?? '',
    model: product.model ?? '',
    cpu: product.cpu ?? '',
    ram: Number(product.ram ?? 8),
    storage: product.storage ?? '',
    screen: product.screen ?? '',
    price: Number(product.price ?? 0),
    condition: product.condition ?? 'Usado',
    stock: Number(product.stock ?? 1),
    featured: Boolean(product.featured),
  };
}

function formatError(err: unknown): string {
  if (!err) return 'Error desconocido.';
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && 'message' in err) return String((err as any).message);
  return 'Ocurrió un error.';
}

export default function AdminProductForm({ selectedProduct, onSaved, onCancelEdit }: AdminProductFormProps) {
  const [form, setForm] = useState<ProductFormState>(initialState);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [imageWarning, setImageWarning] = useState('');

  const isEditing = useMemo(() => Boolean(selectedProduct?.id), [selectedProduct]);

  useEffect(() => {
    setMessage('');
    setError('');
    setImageWarning('');
    setNewImages([]);

    if (selectedProduct) setForm(fromProduct(selectedProduct));
    else setForm(initialState);
  }, [selectedProduct]);

  const handleChange = (field: keyof ProductFormState, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setImageWarning('');
    setIsSaving(true);

    try {
      // 1) Guarda/actualiza el producto sin depender de Storage
      const existingImages = selectedProduct?.images ?? [];
      const payload = { ...form, images: existingImages };

      let productId = selectedProduct?.id;

      if (isEditing && productId) {
        await updateProduct(productId, payload);
      } else {
        productId = await createProduct(payload);
      }

      // 2) Si hay imágenes nuevas, intenta subirlas (pero si falla, NO daña el guardado)
      if (newImages.length > 0 && productId) {
        try {
          const uploadedUrls: string[] = [];

          for (const file of newImages) {
            // cada subida puede fallar individualmente
            const url = await uploadProductImage(productId, file);
            if (url) uploadedUrls.push(url);
          }

          if (uploadedUrls.length > 0) {
            const merged = [...existingImages, ...uploadedUrls];
            await updateProduct(productId, { images: merged });
          }
        } catch (imgErr) {
          setImageWarning(
            `El producto se guardó, pero no se pudieron subir las imágenes. (${formatError(imgErr)})`
          );
        }
      }

      setMessage(isEditing ? 'Producto actualizado correctamente.' : 'Producto creado correctamente.');
      setNewImages([]);

      if (!isEditing) setForm(initialState);

      await onSaved();
      if (isEditing) onCancelEdit();
    } catch (err) {
      setError(`No se pudo guardar el producto. (${formatError(err)})`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-xl font-semibold text-slate-900">{isEditing ? 'Editar producto' : 'Nuevo producto'}</h2>

      <div className="grid gap-3 md:grid-cols-2">
        <input
          required
          value={form.title}
          onChange={(e) => handleChange('title', e.target.value)}
          placeholder="Título"
          className="rounded border p-2"
        />
        <input
          required
          value={form.brand}
          onChange={(e) => handleChange('brand', e.target.value)}
          placeholder="Marca"
          className="rounded border p-2"
        />
        <input
          required
          value={form.model}
          onChange={(e) => handleChange('model', e.target.value)}
          placeholder="Modelo"
          className="rounded border p-2"
        />
        <input
          value={form.cpu}
          onChange={(e) => handleChange('cpu', e.target.value)}
          placeholder="CPU"
          className="rounded border p-2"
        />
        <input
          type="number"
          min={1}
          value={form.ram}
          onChange={(e) => handleChange('ram', Number(e.target.value))}
          placeholder="RAM"
          className="rounded border p-2"
        />
        <input
          value={form.storage}
          onChange={(e) => handleChange('storage', e.target.value)}
          placeholder="Almacenamiento"
          className="rounded border p-2"
        />
        <input
          value={form.screen}
          onChange={(e) => handleChange('screen', e.target.value)}
          placeholder="Pantalla"
          className="rounded border p-2"
        />
        <input
          type="number"
          min={0}
          value={form.price}
          onChange={(e) => handleChange('price', Number(e.target.value))}
          placeholder="Precio"
          className="rounded border p-2"
        />
        <input
          value={form.condition}
          onChange={(e) => handleChange('condition', e.target.value)}
          placeholder="Condición"
          className="rounded border p-2"
        />
        <input
          type="number"
          min={0}
          value={form.stock}
          onChange={(e) => handleChange('stock', Number(e.target.value))}
          placeholder="Stock"
          className="rounded border p-2"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={form.featured} onChange={(e) => handleChange('featured', e.target.checked)} />
        Producto destacado
      </label>

      <div className="space-y-2">
        <label className="block text-sm text-slate-700">Imágenes (opcionales)</label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setNewImages(Array.from(e.target.files ?? []))}
          className="block w-full text-sm"
        />

        {isEditing && (selectedProduct?.images?.length ?? 0) > 0 ? (
          <div className="rounded border border-slate-200 p-2">
            <p className="text-xs text-slate-600 mb-2">Imágenes actuales:</p>
            <div className="flex flex-wrap gap-2">
              {selectedProduct!.images.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 underline"
                >
                  Ver
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {imageWarning ? <p className="text-sm text-amber-600">{imageWarning}</p> : null}
      {message ? <p className="text-sm text-emerald-600">{message}</p> : null}

      <div className="flex gap-2">
        <button
          disabled={isSaving}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {isSaving ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear'}
        </button>

        {isEditing ? (
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded border border-slate-300 px-4 py-2 text-sm"
          >
            Cancelar edición
          </button>
        ) : null}
      </div>
    </form>
  );
}
