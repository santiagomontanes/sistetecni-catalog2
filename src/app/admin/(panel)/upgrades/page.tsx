"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/supabase/client";
import { createUpgradeOptionsRepository } from "@/lib/repositories/upgradeOptions.repository";
import { callAdminAction } from "@/lib/callAdminAction";
import { toggleUpgrade } from "@/app/admin/personalizador/actions";
import AdminUpgradeForm from "@/components/AdminUpgradeForm";
import AdminUpgradeTable from "@/components/AdminUpgradeTable";
import type { UpgradeOption } from "@/types/upgrade";

// upgrade_options tiene lectura pública (RLS) — se lee directamente con el
// cliente de sesión, igual que el resto del catálogo. Solo las escrituras
// (crear/editar/activar) pasan por las Server Actions admin (B6).
const upgradesRepo = createUpgradeOptionsRepository(supabase);

export default function AdminUpgradesPage() {
  const [upgrades, setUpgrades] = useState<UpgradeOption[]>([]);
  const [selected, setSelected] = useState<UpgradeOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setUpgrades(await upgradesRepo.findAll());
    } catch {
      setError("No fue posible cargar los upgrades.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = async (id: string, active: boolean) => {
    try {
      const result = await callAdminAction(toggleUpgrade, { id, active });
      if (!result.ok) {
        setError("No se pudo cambiar el estado del upgrade.");
        return;
      }
      setUpgrades((prev) => prev.map((u) => (u.id === id ? { ...u, active } : u)));
    } catch {
      setError("No se pudo cambiar el estado del upgrade.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Upgrades</h1>
        <p className="mt-1 text-sm text-muted">
          Catálogo de upgrades de RAM y almacenamiento disponibles para el personalizador · {upgrades.length} en
          total
        </p>
      </div>

      <AdminUpgradeForm
        selectedUpgrade={selected}
        onSaved={load}
        onCancelEdit={() => setSelected(null)}
      />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-text">Lista de upgrades</h2>
        {loading ? <p className="text-sm text-muted">Cargando...</p> : null}
        {error ? (
          <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
        ) : null}
        {!loading ? (
          <AdminUpgradeTable upgrades={upgrades} onEdit={setSelected} onToggleActive={handleToggle} />
        ) : null}
      </div>
    </div>
  );
}
