"use client";

import { useState } from "react";
import StepShell from "./StepShell";
import { formatCOP } from "@/lib/personalizadorUi";
import {
  DEFAULT_MANUAL_FORM,
  RAM_OPTIONS_GB,
  STORAGE_OPTIONS_GB,
  CPU_GENERATION_OPTIONS,
  SCREEN_PREFERENCE_LABELS,
  validateManualForm,
} from "@/lib/personalizadorUi";
import type { CustomerRequirements, ManualFormValues, ScreenPreference } from "@/lib/personalizadorUi";
import type { GpuRequirement, TouchRequirement } from "@/lib/personalizador";

interface ManualFormStepProps {
  progress: { current: number; total: number } | null;
  onBack: () => void;
  onSubmit: (requirements: CustomerRequirements) => void;
}

const selectClass =
  "w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";
const labelClass = "mb-1.5 block text-sm font-medium text-text";

export default function ManualFormStep({ progress, onBack, onSubmit }: ManualFormStepProps) {
  const [values, setValues] = useState<ManualFormValues>(DEFAULT_MANUAL_FORM);
  const [budgetText, setBudgetText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const budgetMax = budgetText.trim() === "" ? null : Number(budgetText);
    const result = validateManualForm({ ...values, budgetMax });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    onSubmit(result.requirements);
  }

  return (
    <StepShell title="Elige las características que buscas" progress={progress} onBack={onBack}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="manual-budget" className={labelClass}>
            Presupuesto
          </label>
          <input
            id="manual-budget"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="Ej. 800000"
            value={budgetText}
            onChange={(e) => setBudgetText(e.target.value)}
            className="w-full rounded-xl border border-border bg-white px-4 py-3.5 text-lg font-semibold text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {budgetText.trim() !== "" && Number.isInteger(Number(budgetText)) && Number(budgetText) > 0 ? (
            <p className="mt-1.5 text-sm text-muted">{formatCOP(Number(budgetText))}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="manual-ram" className={labelClass}>
              RAM mínima
            </label>
            <select
              id="manual-ram"
              className={selectClass}
              value={values.ramMinGb}
              onChange={(e) => setValues((v) => ({ ...v, ramMinGb: Number(e.target.value) as ManualFormValues["ramMinGb"] }))}
            >
              {RAM_OPTIONS_GB.map((gb) => (
                <option key={gb} value={gb}>
                  {gb} GB
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="manual-storage" className={labelClass}>
              Almacenamiento mínimo
            </label>
            <select
              id="manual-storage"
              className={selectClass}
              value={values.storageMinGb}
              onChange={(e) =>
                setValues((v) => ({ ...v, storageMinGb: Number(e.target.value) as ManualFormValues["storageMinGb"] }))
              }
            >
              {STORAGE_OPTIONS_GB.map((gb) => (
                <option key={gb} value={gb}>
                  {gb >= 1000 ? `${gb / 1000} TB` : `${gb} GB`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="manual-cpu" className={labelClass}>
            Generación mínima de procesador
          </label>
          <select
            id="manual-cpu"
            className={selectClass}
            value={values.cpuGenerationMin ?? ""}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                cpuGenerationMin: e.target.value === "" ? null : (Number(e.target.value) as ManualFormValues["cpuGenerationMin"]),
              }))
            }
          >
            <option value="">Cualquiera</option>
            {CPU_GENERATION_OPTIONS.map((gen) => (
              <option key={gen} value={gen}>
                {gen}va generación o superior
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="manual-gpu" className={labelClass}>
              Tarjeta gráfica
            </label>
            <select
              id="manual-gpu"
              className={selectClass}
              value={values.gpu}
              onChange={(e) => setValues((v) => ({ ...v, gpu: e.target.value as GpuRequirement }))}
            >
              <option value="cualquiera">Cualquiera</option>
              <option value="integrada">Integrada</option>
              <option value="dedicada">Dedicada</option>
            </select>
          </div>

          <div>
            <label htmlFor="manual-touch" className={labelClass}>
              Pantalla táctil
            </label>
            <select
              id="manual-touch"
              className={selectClass}
              value={values.touch}
              onChange={(e) => setValues((v) => ({ ...v, touch: e.target.value as TouchRequirement }))}
            >
              <option value="cualquiera">Cualquiera</option>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="manual-screen" className={labelClass}>
            Tamaño de pantalla
          </label>
          <select
            id="manual-screen"
            className={selectClass}
            value={values.screenPreference}
            onChange={(e) => setValues((v) => ({ ...v, screenPreference: e.target.value as ScreenPreference }))}
          >
            {(Object.keys(SCREEN_PREFERENCE_LABELS) as ScreenPreference[]).map((key) => (
              <option key={key} value={key}>
                {SCREEN_PREFERENCE_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-muted">
          El procesador, la tarjeta gráfica y la pantalla son características del equipo base — no se pueden
          &quot;mejorar&quot; después. RAM y almacenamiento sí se pueden ampliar si hace falta.
        </p>

        {errors.length > 0 ? (
          <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            <ul className="list-inside list-disc space-y-0.5">
              {errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <button
          type="submit"
          className="w-full rounded-full bg-primary py-3.5 text-sm font-semibold text-white transition hover:bg-primary/90"
        >
          Buscar opciones
        </button>
      </form>
    </StepShell>
  );
}
