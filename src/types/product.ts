export interface Product {
  id: string;
  title: string;
  brand: string;
  model: string;
  cpu: string;
  ram: number;
  storage: string;
  screen: string;
  price: number;
  condition: string;
  stock: number;
  images: string[];
  featured: boolean;
  createdAt: Date | null;
}

export interface ProductFilters {
  brand?: string;
  ram?: number;
  minPrice?: number;
  maxPrice?: number;
  featured?: boolean;
  maxItems?: number;
}
