import type { Product } from '@/types/product';

interface WhatsAppButtonProps {
  phone?: string;
  product?: Product;
  fixed?: boolean;
}

export default function WhatsAppButton({ phone, product, fixed = true }: WhatsAppButtonProps) {
  const phoneValue = (phone ?? '573000000000').replace(/\D/g, '');
  const message = product
    ? `Hola, estoy interesado en ${product.title} (${product.brand} ${product.model}) por ${product.price}. ¿Sigue disponible?`
    : 'Hola, quiero más información de sus productos y servicios.';

  return (
    <a
      href={`https://wa.me/${phoneValue}?text=${encodeURIComponent(message)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={
        fixed
          ? 'fixed bottom-5 right-5 rounded-full bg-green-500 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-green-600'
          : 'inline-flex rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-600'
      }
    >
      WhatsApp
    </a>
  );
}
