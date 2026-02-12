import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '@/firebase/config';

export async function getPublicFileUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage, path));
}
