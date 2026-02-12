import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type QueryConstraint,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { BusinessProfile } from '@/types/business';
import type { Product, ProductFilters } from '@/types/product';
import type { Testimonial } from '@/types/testimonial';

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  return null;
}

export async function getBusinessProfile(): Promise<BusinessProfile | null> {
  const profileRef = doc(db, 'businessProfile', 'main');
  const snapshot = await getDoc(profileRef);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();

  return {
    companyName: data.companyName ?? 'Sistetecni',
    description: data.description ?? '',
    address: data.address ?? '',
    hours: data.hours ?? '',
    phoneWhatsApp: data.phoneWhatsApp ?? '0000000000',
    email: data.email ?? '',
    socialLinks: {
      instagram: data.socialLinks?.instagram ?? '',
      facebook: data.socialLinks?.facebook ?? '',
      tiktok: data.socialLinks?.tiktok ?? '',
    },
    locationMapLink: data.locationMapLink ?? '',
    logoUrl: data.logoUrl ?? '',
    localPhotos: Array.isArray(data.localPhotos) ? data.localPhotos : [],
  };
}

function mapProduct(id: string, data: Record<string, unknown>): Product {
  return {
    id,
    title: String(data.title ?? 'Producto sin título'),
    brand: String(data.brand ?? 'Sin marca'),
    model: String(data.model ?? 'N/A'),
    cpu: String(data.cpu ?? 'N/A'),
    ram: Number(data.ram ?? 0),
    storage: String(data.storage ?? 'N/A'),
    screen: String(data.screen ?? 'N/A'),
    price: Number(data.price ?? 0),
    condition: String(data.condition ?? 'No especificado'),
    stock: Number(data.stock ?? 0),
    images: Array.isArray(data.images) ? (data.images as string[]) : [],
    featured: Boolean(data.featured),
    createdAt: toDate(data.createdAt),
  };
}

export async function getProducts(filters?: ProductFilters): Promise<Product[]> {
  const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];

  if (filters?.brand) constraints.push(where('brand', '==', filters.brand));
  if (typeof filters?.ram === 'number') constraints.push(where('ram', '==', filters.ram));
  if (typeof filters?.minPrice === 'number') constraints.push(where('price', '>=', filters.minPrice));
  if (typeof filters?.maxPrice === 'number') constraints.push(where('price', '<=', filters.maxPrice));
  if (typeof filters?.featured === 'boolean') constraints.push(where('featured', '==', filters.featured));
  if (typeof filters?.maxItems === 'number') constraints.push(limit(filters.maxItems));

  const productsQuery = query(collection(db, 'products'), ...constraints);
  const snapshot = await getDocs(productsQuery);

  return snapshot.docs.map((productDoc) => mapProduct(productDoc.id, productDoc.data() as Record<string, unknown>));
}

export async function getProductById(id: string): Promise<Product | null> {
  const productSnapshot = await getDoc(doc(db, 'products', id));
  if (!productSnapshot.exists()) return null;
  return mapProduct(productSnapshot.id, productSnapshot.data() as Record<string, unknown>);
}

export async function getTestimonials(maxItems = 6): Promise<Testimonial[]> {
  const testimonialsQuery = query(collection(db, 'testimonials'), orderBy('date', 'desc'), limit(maxItems));
  const snapshot = await getDocs(testimonialsQuery);

  return snapshot.docs.map((testimonialDoc) => {
    const data = testimonialDoc.data() as Record<string, unknown>;
    return {
      id: testimonialDoc.id,
      clientName: String(data.clientName ?? 'Cliente'),
      text: String(data.text ?? ''),
      rating: Number(data.rating ?? 5),
      date: toDate(data.date),
      source: String(data.source ?? 'Google'),
      photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : undefined,
    };
  });
}
