import type { BadgeTone } from "@/lib/personalizadorUi";

const TONE_CLASSES: Record<BadgeTone, string> = {
  positive: "bg-green-50 text-success",
  warning: "bg-amber-50 text-amber-700",
  negative: "bg-red-50 text-red-600",
};

export default function Badge({ label, tone }: { label: string; tone: BadgeTone }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${TONE_CLASSES[tone]}`}>
      {label}
    </span>
  );
}
