import type { Metadata } from "next";
import PersonalizadorWizard from "@/components/personalizador/PersonalizadorWizard";

export const metadata: Metadata = {
  title: "Personaliza tu portátil",
  description: "Cuéntanos qué necesitas y encuentra el portátil ideal, con la configuración que buscas.",
};

export default function PersonalizarPage() {
  return <PersonalizadorWizard />;
}
