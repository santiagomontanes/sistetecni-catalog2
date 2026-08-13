"use client";

import { useState } from "react";
import StepShell from "./StepShell";
import { formatCOP } from "@/lib/personalizadorUi";

interface BudgetStepProps {
  progress: { current: number; total: number } | null;
  initialValue: number | null;
  onBack: () => void;
  onAnswer: (budgetMax: number) => void;
}

export default function BudgetStep({ progress, initialValue, onBack, onAnswer }: BudgetStepProps) {
  const [value, setValue] = useState(initialValue !== null ? String(initialValue) : "");
  const parsed = Number(value);
  const isValid = value.trim() !== "" && Number.isInteger(parsed) && parsed > 0;

  return (
    <StepShell
      title="¿Cuál es tu presupuesto aproximado?"
      subtitle="En pesos colombianos (COP)."
      progress={progress}
      onBack={onBack}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isValid) onAnswer(parsed);
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="budget-input" className="mb-1.5 block text-sm font-medium text-text">
            Presupuesto
          </label>
          <input
            id="budget-input"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder="Ej. 800000"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-xl border border-border bg-white px-4 py-3.5 text-lg font-semibold text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {isValid ? <p className="mt-1.5 text-sm text-muted">{formatCOP(parsed)}</p> : null}
        </div>

        <button
          type="submit"
          disabled={!isValid}
          className="w-full rounded-full bg-primary py-3.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continuar
        </button>
      </form>
    </StepShell>
  );
}
