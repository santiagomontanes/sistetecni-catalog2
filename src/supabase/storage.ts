import { supabase } from './client';

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'products';

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
  // solo funciona si es URL del mismo bucket
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = imageUrl.indexOf(marker);
  if (idx === -1) return;

  const path = imageUrl.slice(idx + marker.length);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
