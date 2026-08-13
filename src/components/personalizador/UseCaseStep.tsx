"use client";

import StepShell from "./StepShell";
import { USE_CASE_OPTIONS } from "@/lib/personalizadorUi";
import type { UseCaseKey } from "@/lib/personalizadorUi";

interface UseCaseStepProps {
  progress: { current: number; total: number } | null;
  onBack: () => void;
  onAnswer: (useCase: UseCaseKey) => void;
}

export default function UseCaseStep({ progress, onBack, onAnswer }: UseCaseStepProps) {
  return (
    <StepShell title="¿Para qué lo necesitas?" progress={progress} onBack={onBack}>
      <div className="grid grid-cols-2 gap-3">
        {USE_CASE_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onAnswer(option.key)}
            className="rounded-2xl border border-border bg-white p-4 text-left transition hover:border-primary hover:shadow-md"
          >
            <span className="block text-sm font-semibold text-text">{option.label}</span>
            <span className="mt-0.5 block text-xs text-muted">{option.description}</span>
          </button>
        ))}
      </div>
    </StepShell>
  );
}
