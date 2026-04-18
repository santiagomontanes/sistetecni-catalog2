import { supabase } from "@/supabase/client";
import type { BusinessProfile } from "@/types/business";
import type { Product, ProductFilters } from "@/types/product";
import type { Testimonial } from "@/types/testimonial";
import type { GalleryImage } from "@/types/gallery";

type ProductPayload = Omit<Product, "id" | "createdAt">;

type DbRow = Record<string, unknown>;

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function mapProduct(row: DbRow): Product {
  return {
    id: String(row.id),
    title: String(row.title ?? "Producto sin título"),
    brand: String(row.brand ?? "Sin marca"),
    model: String(row.model ?? "N/A"),
    cpu: String(row.cpu ?? "N/A"),
    ram: Number(row.ram ?? 0),
    storage: String(row.storage ?? "N/A"),
    screen: String(row.screen ?? "N/A"),
    price: Number(row.price ?? 0),
    condition: String(row.condition ?? "No especificado"),
    stock: Number(row.stock ?? 0),
    images: Array.isArray(row.images) ? (row.images as string[]) : [],
    featured: Boolean(row.featured),
    visibleWeb: row.visible_web !== false,
    createdAt: toDate(row.created_at),
  };
}

function mapTestimonial(row: DbRow): Testimonial {
  return {
    id: String(row.id),
    clientName: String(row.client_name ?? "Cliente"),
    text: String(row.text ?? ""),
    rating: Number(row.rating ?? 5),
    date: toDate(row.created_at),
    source: String(row.source ?? "Google"),
    photoUrl: typeof row.photo_url === "string" ? row.photo_url : undefined,
    active: row.active !== false,
  };
}

function mapGalleryImage(row: DbRow): GalleryImage {
  return {
    id: Number(row.id),
    url: String(row.url ?? ""),
    caption: typeof row.caption === "string" ? row.caption : null,
    orden: Number(row.orden ?? 0),
    activa: Boolean(row.activa),
    createdAt: toDate(row.created_at),
  };
}

function asRowArray(data: unknown): DbRow[] {
  return Array.isArray(data) ? (data as DbRow[]) : [];
}

export async function getUserRole(uid: string): Promise<{ role: string; active: boolean } | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", uid)
    .maybeSingle<{ is_admin: boolean | null }>();

  if (error || !data) return null;

  const isAdmin = data.is_admin === true;
  return { role: isAdmin ? "admin" : "user", active: true };
}

export async function getBusinessProfile(): Promise<BusinessProfile | null> {
  const { data, error } = await supabase
    .from("business_profile")
    .select("*")
    .eq("id", 1)
    .maybeSingle<DbRow>();

  if (error || !data) return null;

  return {
    companyName: String(data.company_name ?? "Sistetecni"),
    description: String(data.description ?? ""),
    address: String(data.address ?? ""),
    hours: String(data.hours ?? ""),
    phoneWhatsApp: String(data.phone_whatsapp ?? "+57 3202210698"),
    email: String(data.email ?? ""),
    socialLinks: {
      instagram: String(data.instagram ?? ""),
      facebook: String(data.facebook ?? ""),
      tiktok: String(data.tiktok ?? ""),
    },
    locationMapLink: String(data.map_link ?? ""),
    logoUrl: typeof data.logo_url === "string" && data.logo_url ? data.logo_url : undefined,
    localPhotos: Array.isArray(data.local_photos) ? (data.local_photos as string[]) : [],
    heroVideoUrl: typeof data.hero_video_url === "string" && data.hero_video_url ? data.hero_video_url : undefined,
    heroMediaType: data.hero_media_type === "video" ? "video" : "image",
  };
}

export interface BusinessProfileUpdatePayload {
  company_name?: string;
  description?: string;
  address?: string;
  hours?: string;
  phone_whatsapp?: string;
  email?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  map_link?: string;
  logo_url?: string;
}

export async function updateBusinessProfile(data: BusinessProfileUpdatePayload): Promise<void> {
  const { error } = await supabase.from("business_profile").update(data).eq("id", 1);
  if (error) throw new Error(error.message);
}

export async function updateHeroVideo(url: string, type: "image" | "video"): Promise<void> {
  const { error } = await supabase
    .from("business_profile")
    .update({ hero_video_url: url, hero_media_type: type })
    .eq("id", 1);
  if (error) throw new Error(error.message);
}

export async function getProducts(filters?: ProductFilters): Promise<Product[]> {
  let q = supabase.from("products").select("*").order("created_at", { ascending: false });

  if (filters?.visibleOnly) q = q.eq("visible_web", true);
  if (filters?.brand) q = q.eq("brand", filters.brand);
  if (typeof filters?.ram === "number") q = q.eq("ram", filters.ram);
  if (typeof filters?.minPrice === "number") q = q.gte("price", filters.minPrice);
  if (typeof filters?.maxPrice === "number") q = q.lte("price", filters.maxPrice);
  if (typeof filters?.featured === "boolean") q = q.eq("featured", filters.featured);
  if (typeof filters?.maxItems === "number") q = q.limit(filters.maxItems);

  const { data, error } = await q;
  if (error || !data) return [];

  return asRowArray(data).map(mapProduct);
}

export async function getProductById(id: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("visible_web", true)
    .maybeSingle<DbRow>();

  if (error || !data) return null;
  return mapProduct(data);
}

function cleanProductPayload(data: Partial<ProductPayload>): Record<string, unknown> {
  return {
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.brand !== undefined ? { brand: data.brand } : {}),
    ...(data.model !== undefined ? { model: data.model } : {}),
    ...(data.cpu !== undefined ? { cpu: data.cpu } : {}),
    ...(data.ram !== undefined ? { ram: data.ram } : {}),
    ...(data.storage !== undefined ? { storage: data.storage } : {}),
    ...(data.screen !== undefined ? { screen: data.screen } : {}),
    ...(data.price !== undefined ? { price: data.price } : {}),
    ...(data.condition !== undefined ? { condition: data.condition } : {}),
    ...(data.stock !== undefined ? { stock: data.stock } : {}),
    ...(data.images !== undefined ? { images: data.images } : {}),
    ...(data.featured !== undefined ? { featured: data.featured } : {}),
    ...(data.visibleWeb !== undefined ? { visible_web: data.visibleWeb } : {}),
  };
}

export async function createProduct(data: ProductPayload): Promise<string> {
  const payload = cleanProductPayload(data);

  const { data: created, error } = await supabase
    .from("products")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();

  if (error || !created) throw new Error(error.message);
  return String(created.id);
}

export async function updateProduct(id: string, partial: Partial<ProductPayload>): Promise<void> {
  const payload = cleanProductPayload(partial);

  const { error } = await supabase.from("products").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setFeatured(id: string, featured: boolean): Promise<void> {
  await updateProduct(id, { featured });
}

export async function setProductVisibility(id: string, visible: boolean): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update({ visible_web: visible })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Testimonials ──────────────────────────────────────────

export async function getTestimonials(maxItems = 6): Promise<Testimonial[]> {
  const { data, error } = await supabase
    .from("testimonials")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(maxItems);

  if (error || !data) return [];
  return asRowArray(data).map(mapTestimonial);
}

export async function getAllTestimonials(): Promise<Testimonial[]> {
  const { data, error } = await supabase
    .from("testimonials")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return asRowArray(data).map(mapTestimonial);
}

export interface TestimonialPayload {
  clientName: string;
  text: string;
  rating: number;
  source: string;
  photoUrl?: string;
  active?: boolean;
}

export async function createTestimonial(data: TestimonialPayload): Promise<string> {
  const { data: created, error } = await supabase
    .from("testimonials")
    .insert({
      client_name: data.clientName,
      text: data.text,
      rating: data.rating,
      source: data.source,
      photo_url: data.photoUrl ?? null,
      active: data.active !== false,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !created) throw new Error(error?.message ?? "Error al crear testimonio");
  return String(created.id);
}

export async function updateTestimonial(id: string, data: Partial<TestimonialPayload>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (data.clientName !== undefined) payload.client_name = data.clientName;
  if (data.text !== undefined) payload.text = data.text;
  if (data.rating !== undefined) payload.rating = data.rating;
  if (data.source !== undefined) payload.source = data.source;
  if (data.photoUrl !== undefined) payload.photo_url = data.photoUrl;
  if (data.active !== undefined) payload.active = data.active;

  const { error } = await supabase.from("testimonials").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTestimonial(id: string): Promise<void> {
  const { error } = await supabase.from("testimonials").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function toggleTestimonialActive(id: string, active: boolean): Promise<void> {
  await updateTestimonial(id, { active });
}

// ── Gallery ───────────────────────────────────────────────

export async function getGalleryImages(): Promise<GalleryImage[]> {
  const { data, error } = await supabase
    .from("gallery_images")
    .select("*")
    .eq("activa", true)
    .order("orden", { ascending: true });

  if (error || !data) return [];
  return asRowArray(data).map(mapGalleryImage);
}

export async function getAllGalleryImages(): Promise<GalleryImage[]> {
  const { data, error } = await supabase
    .from("gallery_images")
    .select("*")
    .order("orden", { ascending: true });

  if (error || !data) return [];
  return asRowArray(data).map(mapGalleryImage);
}

export async function createGalleryImage(data: {
  url: string;
  caption?: string;
  orden?: number;
}): Promise<number> {
  const { data: created, error } = await supabase
    .from("gallery_images")
    .insert({ url: data.url, caption: data.caption ?? null, orden: data.orden ?? 0, activa: true })
    .select("id")
    .single<{ id: number }>();

  if (error || !created) throw new Error(error?.message ?? "Error al crear imagen");
  return created.id;
}

export async function updateGalleryImage(
  id: number,
  data: { url?: string; caption?: string; orden?: number; activa?: boolean }
): Promise<void> {
  const { error } = await supabase.from("gallery_images").update(data).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteGalleryImage(id: number): Promise<void> {
  const { error } = await supabase.from("gallery_images").update({ activa: false }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function reorderGalleryImages(ids: number[]): Promise<void> {
  await Promise.all(
    ids.map((id, index) =>
      supabase.from("gallery_images").update({ orden: index }).eq("id", id)
    )
  );
}
