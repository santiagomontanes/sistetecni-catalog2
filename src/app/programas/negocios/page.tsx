import ProgramaProximamente, { proximamenteMetadata } from "@/components/programas/ProgramaProximamente";

export const metadata = proximamenteMetadata("negocios");

export default function Page() {
  return <ProgramaProximamente slug="negocios" />;
}
