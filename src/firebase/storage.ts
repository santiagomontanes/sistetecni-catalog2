import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '@/firebase/config';

export async function getPublicFileUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage, path));
}

export async function uploadProductImage(productId: string, file: File): Promise<string> {
  const extension = file.name.split('.').pop() || 'jpg';
  const filename = `${crypto.randomUUID()}.${extension}`;
  const path = `products/${productId}/${filename}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' });
  return getDownloadURL(storageRef);
}
