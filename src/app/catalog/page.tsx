import ProductCard from '@/components/ProductCard';
import ProductFilters from '@/components/ProductFilters';
import type { Product } from '@/types/product';

const placeholderProducts: Product[] = [
  { id: 'router-wifi', name: 'Router WiFi', description: 'Conectividad estable para oficina y hogar.' },
  { id: 'camara-ip', name: 'Cámara IP', description: 'Monitoreo en tiempo real desde cualquier lugar.' },
  { id: 'ups-1500', name: 'UPS 1500VA', description: 'Respaldo eléctrico para equipos críticos.' },
];

export default function CatalogPage() {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">Catálogo</h1>
        <p className="mt-2 text-sm text-slate-600">Explora nuestros productos disponibles.</p>
      </header>
      <ProductFilters />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {placeholderProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
