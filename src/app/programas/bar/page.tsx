import ProgramaProximamente, { proximamenteMetadata } from "@/components/programas/ProgramaProximamente";

export const metadata = proximamenteMetadata("bar");

export default function Page() {
  return <ProgramaProximamente slug="bar" />;
}
