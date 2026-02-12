export interface Testimonial {
  id: string;
  clientName: string;
  text: string;
  rating: number;
  date: Date | null;
  source: string;
  photoUrl?: string;
}
