import type { Metadata } from "next";

// Las páginas de /admin/ventas/* son "use client" y no pueden exportar
// `metadata` ellas mismas — de ahí este layout intermedio, aislado a esta
// sección del panel (no toca el resto de /admin).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function VentasLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
