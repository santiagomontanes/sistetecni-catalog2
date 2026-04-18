import { supabase } from './client';

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'products';
const GALLERY_BUCKET = 'gallery';
const ASSETS_BUCKET = 'assets';

function getExt(filename: string) {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : 'jpg';
}

function randomId() {
  // compatible en browser sin libs extra
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function uploadProductImage(productId: string, file: File): Promise<string> {
  const ext = getExt(file.name);
  const path = `${productId}/${randomId()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
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
  const ext = getExt(file.name);
  const path = `${randomId()}.${ext}`;

  const { error } = await supabase.storage.from(GALLERY_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(GALLERY_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('No se pudo generar publicUrl de galería');

  return data.publicUrl;
}

export async function uploadAssetFile(name: string, file: File): Promise<string> {
  const ext = getExt(file.name);
  const path = `${name}-${randomId()}.${ext}`;

  const { error } = await supabase.storage.from(ASSETS_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type || undefined,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('No se pudo generar publicUrl de asset');

  return data.publicUrl;
}
