import { Beer, Shirt, Store, UtensilsCrossed } from "lucide-react";
import type { ProgramaSlug } from "@/lib/programas";

const icons = { bar: Beer, restaurante: UtensilsCrossed, lavanderia: Shirt, negocios: Store } as const;

export default function ProgramaIcono({ slug, className }: { slug: ProgramaSlug; className?: string }) {
  const Icon = icons[slug];
  return <Icon className={className} aria-hidden="true" />;
}
