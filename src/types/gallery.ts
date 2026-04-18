export interface GalleryImage {
  id: number;
  url: string;
  caption: string | null;
  orden: number;
  activa: boolean;
  createdAt: Date | null;
}
