"use client";

import { formatCOP } from "@/lib/personalizadorUi";
import type { UpgradeOption } from "@/types/upgrade";

interface AdminUpgradeTableProps {
  upgrades: UpgradeOption[];
  onEdit: (upgrade: UpgradeOption) => void;
  onToggleActive: (id: string, active: boolean) => void;
}

const CATEGORY_LABEL: Record<UpgradeOption["category"], string> = {
  ram: "RAM",
  storage: "Almacenamiento",
};

export default function AdminUpgradeTable({ upgrades, onEdit, onToggleActive }: AdminUpgradeTableProps) {
  if (upgrades.length === 0) {
    return <p className="text-sm text-muted">Todavía no hay upgrades creados.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-white">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3">Categoría</th>
            <th className="px-4 py-3">Etiqueta</th>
            <th className="px-4 py-3">Capacidad</th>
            <th className="px-4 py-3">Precio extra</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {upgrades.map((u) => (
            <tr key={u.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 text-muted">{CATEGORY_LABEL[u.category]}</td>
              <td className="px-4 py-3 font-medium text-text">{u.label}</td>
              <td className="px-4 py-3 text-muted">
                {u.value} GB{u.interface ? ` · ${u.interface}` : ""}
              </td>
              <td className="px-4 py-3 font-semibold text-text">{formatCOP(u.extraCost)}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    u.active ? "bg-green-50 text-success" : "bg-surface text-muted"
                  }`}
                >
                  {u.active ? "Activo" : "Inactivo"}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(u)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text transition hover:border-primary hover:text-primary"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleActive(u.id, !u.active)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text transition hover:border-primary hover:text-primary"
                  >
                    {u.active ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
