import ProgramaProximamente, { proximamenteMetadata } from "@/components/programas/ProgramaProximamente";

export const metadata = proximamenteMetadata("restaurante");

export default function Page() {
  return <ProgramaProximamente slug="restaurante" />;
}
