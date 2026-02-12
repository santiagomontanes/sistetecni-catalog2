import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { Product } from '@/types/product';

export async function getCatalogPreview(maxItems = 8): Promise<Product[]> {
  const productsQuery = query(collection(db, 'products'), limit(maxItems));
  const snapshot = await getDocs(productsQuery);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<Product, 'id'>),
  }));
}
