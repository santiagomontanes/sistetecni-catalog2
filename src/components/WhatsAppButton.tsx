import type { Product } from "@/types/product";

interface WhatsAppButtonProps {
  phone?: string;
  product?: Product;
  fixed?: boolean;
}

function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function WhatsAppButton({
  phone,
  product,
  fixed = true,
}: WhatsAppButtonProps) {
  const phoneValue = (phone ?? "573115996339").replace(/\D/g, "");

  const message = product
    ? `Hola 👋

Estoy interesado en este equipo:

• Producto: ${product.title}
• Marca: ${product.brand} ${product.model}
• Precio: ${formatCOP(product.price)}

¿Sigue disponible?`
    : "Hola 👋 quiero más información sobre sus productos disponibles.";

  const url = `https://wa.me/${phoneValue}?text=${encodeURIComponent(
    message
  )}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={
        fixed
          ? "fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-green-500 px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-green-500/30 transition hover:scale-105 hover:bg-green-600"
          : "inline-flex items-center gap-2 rounded-xl bg-green-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-green-500/20 transition hover:scale-105 hover:bg-green-600"
      }
    >
      <span>WhatsApp</span>
    </a>
  );
}
