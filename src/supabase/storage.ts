import { supabase } from './client';

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'products';
const GALLERY_BUCKET = 'gallery';
const ASSETS_BUCKET = 'assets';

// 1 año — los archivos llevan nombre único (immutable), así que el CDN
// los puede cachear el máximo tiempo posible y deja de descontar
// Cached Egress en cada visita repetida.
const ONE_YEAR = '31536000';

// Límites de subida (en bytes). Imágenes pesadas son la causa principal
// del consumo en planes gratuitos; las rechazamos en el cliente.
export const IMAGE_MAX_BYTES = 1024 * 1024;        // 1 MB hard limit
export const IMAGE_WARN_BYTES = 500 * 1024;        // 500 KB warn
export const VIDEO_MAX_BYTES = 25 * 1024 * 1024;   // 25 MB hard limit

export interface ImageCheckResult {
  ok: boolean;
  warning?: string;
  error?: string;
  sizeKB: number;
}

export function checkImageFile(file: File): ImageCheckResult {
  const sizeKB = Math.round(file.size / 1024);

  if (!file.type.startsWith('image/')) {
    return { ok: false, error: 'El archivo debe ser una imagen.', sizeKB };
  }

  if (file.size > IMAGE_MAX_BYTES) {
    return {
      ok: false,
      error: `La imagen pesa ${sizeKB} KB. Máximo permitido: ${Math.round(IMAGE_MAX_BYTES / 1024)} KB. Comprímela (usa squoosh.app o convierte a WebP) antes de subir.`,
      sizeKB,
    };
  }

  if (file.size > IMAGE_WARN_BYTES) {
    return {
      ok: true,
      warning: `La imagen pesa ${sizeKB} KB. Recomendado: ${Math.round(IMAGE_WARN_BYTES / 1024)} KB o menos. Considera convertirla a WebP.`,
      sizeKB,
    };
  }

  return { ok: true, sizeKB };
}

export function checkVideoFile(file: File): ImageCheckResult {
  const sizeKB = Math.round(file.size / 1024);
  if (file.size > VIDEO_MAX_BYTES) {
    return {
      ok: false,
      error: `El video pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. Máximo permitido: ${VIDEO_MAX_BYTES / 1024 / 1024} MB. Usa YouTube/Vimeo o comprime el archivo.`,
      sizeKB,
    };
  }
  return { ok: true, sizeKB };
}

function getExt(filename: string) {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : 'jpg';
}

function randomId() {
  // compatible en browser sin libs extra
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function uploadProductImage(productId: string, file: File): Promise<string> {
  const check = checkImageFile(file);
  if (!check.ok) throw new Error(check.error ?? 'Imagen inválida');

  const ext = getExt(file.name);
  const path = `${productId}/${randomId()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: ONE_YEAR,
    upsert: false,
    contentType: file.type || undefined,
  });

  if (error) throw error;

  // Si el bucket es PUBLIC:
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('No se pudo generar publicUrl');

  return data.publicUrl;
}

export async function deleteProductImageByUrl(imageUrl: string): Promise<void> {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = imageUrl.indexOf(marker);
  if (idx === -1) return;

  const path = imageUrl.slice(idx + marker.length);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export async function uploadGalleryImage(file: File): Promise<string> {
  const check = checkImageFile(file);
  if (!check.ok) throw new Error(check.error ?? 'Imagen inválida');

  const ext = getExt(file.name);
  const path = `${randomId()}.${ext}`;

  const { error } = await supabase.storage.from(GALLERY_BUCKET).upload(path, file, {
    cacheControl: ONE_YEAR,
    upsert: false,
    contentType: file.type || undefined,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(GALLERY_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('No se pudo generar publicUrl de galería');

  return data.publicUrl;
}

export async function uploadAssetFile(name: string, file: File): Promise<string> {
  // El bucket "assets" guarda logo y video del hero; sólo validamos
  // tamaño de imágenes (los videos pasan por checkVideoFile aparte).
  if (file.type.startsWith('image/')) {
    const check = checkImageFile(file);
    if (!check.ok) throw new Error(check.error ?? 'Imagen inválida');
  } else if (file.type.startsWith('video/')) {
    const check = checkVideoFile(file);
    if (!check.ok) throw new Error(check.error ?? 'Video inválido');
  }

  const ext = getExt(file.name);
  const path = `${name}-${randomId()}.${ext}`;

  const { error } = await supabase.storage.from(ASSETS_BUCKET).upload(path, file, {
    cacheControl: ONE_YEAR,
    upsert: true,
    contentType: file.type || undefined,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('No se pudo generar publicUrl de asset');

  return data.publicUrl;
}
