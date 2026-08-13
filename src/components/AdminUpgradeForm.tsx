"use client";

import { useEffect, useState } from "react";
import { callAdminAction } from "@/lib/callAdminAction";
import { createUpgrade, updateUpgrade } from "@/app/admin/personalizador/actions";
import type { UpgradeOption, UpgradeCategory } from "@/types/upgrade";

interface AdminUpgradeFormProps {
  selectedUpgrade: UpgradeOption | null;
  onSaved: () => Promise<void>;
  onCancelEdit: () => void;
}

interface FormState {
  category: UpgradeCategory;
  label: string;
  value: number;
  interfaceValue: string;
  extraCost: number;
  componentCost: number | null;
  installCost: number | null;
  active: boolean;
}

const initialState: FormState = {
  category: "ram",
  label: "",
  value: 16,
  interfaceValue: "",
  extraCost: 0,
  componentCost: null,
  installCost: null,
  active: true,
};

function fromUpgrade(u: UpgradeOption): FormState {
  return {
    category: u.category,
    label: u.label,
    value: u.value,
    interfaceValue: u.interface ?? "",
    extraCost: u.extraCost,
    componentCost: u.componentCost,
    installCost: u.installCost,
    active: u.active,
  };
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Ocurrió un error.";
}

export default function AdminUpgradeForm({ selectedUpgrade, onSaved, onCancelEdit }: AdminUpgradeFormProps) {
  const [form, setForm] = useState<FormState>(initialState);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isEditing = Boolean(selectedUpgrade?.id);

  useEffect(() => {
    setMessage("");
    setError("");
    setForm(selectedUpgrade ? fromUpgrade(selectedUpgrade) : initialState);
  }, [selectedUpgrade]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSaving(true);

    try {
      const payload = {
        category: form.category,
        label: form.label,
        value: form.value,
        interface: form.interfaceValue.trim() === "" ? null : form.interfaceValue.trim(),
        extraCost: form.extraCost,
        componentCost: form.componentCost,
        installCost: form.installCost,
        active: form.active,
      };

      const result =
        isEditing && selectedUpgrade
          ? await callAdminAction(updateUpgrade, { id: selectedUpgrade.id, ...payload })
          : await callAdminAction(createUpgrade, payload);

      if (!result.ok) {
        setError(
          result.error === "VALIDATION_ERROR"
            ? result.issues.join(" ")
            : result.error === "FORBIDDEN"
              ? "No tienes permisos de administrador."
              : "No se pudo guardar el upgrade."
        );
        return;
      }

      setMessage(isEditing ? "Upgrade actualizado." : "Upgrade creado.");
      await onSaved();
      if (isEditing) onCancelEdit();
      else setForm(initialState);
    } catch (err) {
      setError(`No se pudo guardar el upgrade. (${formatError(err)})`);
    } finally {
      setIsSaving(false);
    }
  };

  const panel = "space-y-4 rounded-2xl border border-border bg-surface p-6";
  const label = "block text-sm font-medium text-muted";
  const input =
    "w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-text placeholder:text-muted outline-none focus:ring-2 focus:ring-primary/20";
  const buttonPrimary =
    "rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60";
  const buttonGhost =
    "rounded-xl border border-border bg-surface px-5 py-3 text-sm font-semibold text-text transition hover:border-primary hover:text-primary";

  return (
    <form onSubmit={handleSubmit} className={panel}>
      <h2 className="text-xl font-semibold text-text">{isEditing ? "Editar upgrade" : "Nuevo upgrade"}</h2>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className={label}>Categoría</label>
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as UpgradeCategory }))}
            className={input}
          >
            <option value="ram">RAM</option>
            <option value="storage">Almacenamiento</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className={label}>Etiqueta (lo que ve el cliente)</label>
          <input
            required
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Ej. 16 GB RAM"
            className={input}
          />
        </div>

        <div>
          <label className={label}>Capacidad final (GB)</label>
          <input
            required
            type="number"
            min={1}
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) }))}
            className={input}
          />
        </div>

        {form.category === "storage" ? (
          <div>
            <label className={label}>Interfaz (opcional)</label>
            <input
              value={form.interfaceValue}
              onChange={(e) => setForm((f) => ({ ...f, interfaceValue: e.target.value }))}
              placeholder="Ej. NVMe"
              className={input}
            />
          </div>
        ) : null}

        <div>
          <label className={label}>Precio extra al cliente (COP)</label>
          <input
            required
            type="number"
            min={0}
            value={form.extraCost}
            onChange={(e) => setForm((f) => ({ ...f, extraCost: Number(e.target.value) }))}
            className={input}
          />
        </div>

        <div>
          <label className={label}>Costo del componente (interno, opcional)</label>
          <input
            type="number"
            min={0}
            value={form.componentCost ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, componentCost: e.target.value === "" ? null : Number(e.target.value) }))
            }
            className={input}
          />
        </div>

        <div>
          <label className={label}>Costo de instalación (interno, opcional)</label>
          <input
            type="number"
            min={0}
            value={form.installCost ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, installCost: e.target.value === "" ? null : Number(e.target.value) }))
            }
            className={input}
          />
        </div>
      </div>

      <p className="text-xs text-muted">
        El precio extra es el ÚNICO valor que ve y paga el cliente — los costos internos son solo para análisis
        de margen. No se maneja cantidad de inventario: solo activo/inactivo.
      </p>

      <label className="flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        Activo (disponible para ofrecerse en el personalizador)
      </label>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-500">{message}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button disabled={isSaving} className={buttonPrimary}>
          {isSaving ? "Guardando..." : isEditing ? "Actualizar" : "Crear"}
        </button>
        {isEditing ? (
          <button type="button" onClick={onCancelEdit} className={buttonGhost}>
            Cancelar edición
          </button>
        ) : null}
      </div>
    </form>
  );
}
