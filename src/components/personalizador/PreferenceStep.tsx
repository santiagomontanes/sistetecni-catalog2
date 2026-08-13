"use client";

import StepShell from "./StepShell";
import { PREFERENCE_OPTIONS } from "@/lib/personalizadorUi";
import type { PreferenceKey } from "@/lib/personalizadorUi";

interface PreferenceStepProps {
  progress: { current: number; total: number } | null;
  onBack: () => void;
  onAnswer: (preference: PreferenceKey) => void;
}

export default function PreferenceStep({ progress, onBack, onAnswer }: PreferenceStepProps) {
  return (
    <StepShell title="¿Alguna preferencia?" subtitle="Puedes elegir una o dejarlo sin preferencia." progress={progress} onBack={onBack}>
      <div className="space-y-2.5">
        {PREFERENCE_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onAnswer(option.key)}
            className="block w-full rounded-2xl border border-border bg-white px-4 py-3.5 text-left text-sm font-medium text-text transition hover:border-primary hover:text-primary"
          >
            {option.label}
          </button>
        ))}
      </div>
    </StepShell>
  );
}
