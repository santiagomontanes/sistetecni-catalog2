"use client";

import Link from "next/link";
import { useState } from "react";
import { callAdminAction } from "@/lib/callAdminAction";
import {
  receiveProductUnit,
  searchInventoryProducts,
} from "@/app/admin/inventario/actions";
import type {
  AdminInventoryUnitDTO,
  AdminProductOptionDTO,
} from "@/lib/erpAdmin/types";

const EMPTY_FORM = {
  serialNumber: "",
  acquisitionCostCop: "",
  batteryHealthPercent: "",
  storageHealthPercent: "",
  ramGb: "",
  storageGb: "",
  storageType: "SSD",
  conditionNotes: "",
  notes: "",
};

export default function RecibirComputadorPage() {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<AdminProductOptionDTO[]>([]);
  const [selected, setSelected] = useState<AdminProductOptionDTO | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [created, setCreated] = useState<AdminInventoryUnitDTO | null>(null);

  const update = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = query.trim();
    if (!clean) return;
    try {
      setSearching(true);
      setError("");
      const result = await callAdminAction(searchInventoryProducts, { query: clean });
      if (!result.ok) {
        setError(result.error === "FORBIDDEN" ? "No tienes permisos de administrador." : "No fue posible buscar productos.");
        return;
      }
      setProducts(result.data.items);
    } catch {
      setError("No fue posible buscar productos.");
    } finally {
      setSearching(false);
    }
  };

  const handleReceive = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) {
      setError("Selecciona primero el producto al que pertenece este computador.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setCreated(null);
      const result = await callAdminAction(receiveProductUnit, {
        productId: selected.id,
        ...form,
      });

      if (!result.ok) {
        if (result.error === "VALIDATION_ERROR") setError(result.issues.join(" "));
        else if (result.error === "NOT_FOUND") setError("El producto seleccionado ya no existe.");
        else if (result.error === "FORBIDDEN") setError("No tienes permisos de administrador.");
        else setError("No fue posible recibir el computador.");
        return;
      }

      setCreated(result.data);
      setForm(EMPTY_FORM);
    } catch {
      setError("No fue posible recibir el computador.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">ERP · Inventario</p>
          <h1 className="mt-1 text-2xl font-bold text-text">Recibir computador</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Registra una máquina física contra un producto existente. El ERP generará automáticamente su código interno y el movimiento de recepción.
          </p>
        </div>
        <Link href="/admin/inventario" className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-text hover:border-primary hover:text-primary">
          ← Volver al inventario
        </Link>
      </div>

      {error ? <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {created ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
          <p className="text-sm font-semibold text-green-800">Computador recibido correctamente</p>
          <p className="mt-1 text-2xl font-bold text-green-900">{created.unitCode}</p>
          <p className="mt-1 text-sm text-green-800">{created.productTitle}{created.serialNumber ? ` · Serial ${created.serialNumber}` : ""}</p>
          <Link href="/admin/inventario" className="mt-4 inline-block text-sm font-semibold text-green-900 underline">Ver en inventario</Link>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.8fr)]">
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="text-lg font-bold text-text">1. Producto comercial</h2>
          <p className="mt-1 text-xs text-muted">Busca el modelo/producto existente al que pertenece esta unidad física.</p>

          <form onSubmit={handleSearch} className="mt-4 flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ej. Dell Latitude, Acer Corporate..."
              className="min-w-0 flex-1 rounded-xl border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button disabled={searching} className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {searching ? "Buscando..." : "Buscar"}
            </button>
          </form>

          <div className="mt-4 space-y-2">
            {products.map((product) => {
              const active = selected?.id === product.id;
              return (
                <button
                  type="button"
                  key={product.id}
                  onClick={() => setSelected(product)}
                  className={`w-full rounded-xl border p-4 text-left transition ${active ? "border-primary bg-primary/5 ring-2 ring-primary/10" : "border-border hover:border-primary/50"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-text">{product.title}</p>
                      <p className="mt-1 text-xs text-muted">{[product.brand, product.model, product.cpu].filter(Boolean).join(" · ")}</p>
                      <p className="mt-1 text-xs text-muted">{product.ram} GB RAM · {product.storage || "Almacenamiento sin detalle"}</p>
                    </div>
                    <div className="text-right text-xs text-muted">
                      <p>Stock web: {product.stock}</p>
                      <p>{product.visibleWeb ? "Publicado" : "No publicado"}</p>
                    </div>
                  </div>
                </button>
              );
            })}
            {!searching && query.trim() && products.length === 0 ? <p className="py-4 text-sm text-muted">No hay resultados todavía. Ejecuta la búsqueda o prueba otro término.</p> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="text-lg font-bold text-text">2. Unidad física</h2>
          {selected ? (
            <p className="mt-1 rounded-xl bg-surface px-3 py-2 text-xs text-muted">Recibiendo: <strong className="text-text">{selected.title}</strong></p>
          ) : (
            <p className="mt-1 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">Selecciona un producto antes de guardar.</p>
          )}

          <form onSubmit={handleReceive} className="mt-5 space-y-4">
            <label className="block text-sm font-medium text-text">Serial del fabricante<input value={form.serialNumber} onChange={(e) => update("serialNumber", e.target.value)} placeholder="Ej. PF1ABC123" className="mt-1.5 w-full rounded-xl border border-border px-3 py-2.5" /></label>

            <label className="block text-sm font-medium text-text">Costo de adquisición (COP)<input inputMode="numeric" value={form.acquisitionCostCop} onChange={(e) => update("acquisitionCostCop", e.target.value)} placeholder="400000" className="mt-1.5 w-full rounded-xl border border-border px-3 py-2.5" /></label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-text">Salud batería %<input type="number" min="0" max="100" value={form.batteryHealthPercent} onChange={(e) => update("batteryHealthPercent", e.target.value)} className="mt-1.5 w-full rounded-xl border border-border px-3 py-2.5" /></label>
              <label className="block text-sm font-medium text-text">Salud disco %<input type="number" min="0" max="100" value={form.storageHealthPercent} onChange={(e) => update("storageHealthPercent", e.target.value)} className="mt-1.5 w-full rounded-xl border border-border px-3 py-2.5" /></label>
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Configuración real de esta unidad</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-text">RAM GB<input type="number" min="1" value={form.ramGb} onChange={(e) => update("ramGb", e.target.value)} className="mt-1.5 w-full rounded-xl border border-border px-3 py-2.5" /></label>
                <label className="block text-sm font-medium text-text">Almacenamiento GB<input type="number" min="1" value={form.storageGb} onChange={(e) => update("storageGb", e.target.value)} className="mt-1.5 w-full rounded-xl border border-border px-3 py-2.5" /></label>
              </div>
              <label className="mt-3 block text-sm font-medium text-text">Tipo de almacenamiento<select value={form.storageType} onChange={(e) => update("storageType", e.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5"><option>SSD</option><option>NVMe</option><option>HDD</option><option>eMMC</option><option>Otro</option></select></label>
              <label className="mt-3 block text-sm font-medium text-text">Estado / detalles físicos<textarea rows={2} value={form.conditionNotes} onChange={(e) => update("conditionNotes", e.target.value)} placeholder="Ej. tapa con marcas leves, teclado nuevo..." className="mt-1.5 w-full rounded-xl border border-border px-3 py-2.5" /></label>
            </div>

            <label className="block text-sm font-medium text-text">Notas internas<textarea rows={3} value={form.notes} onChange={(e) => update("notes", e.target.value)} className="mt-1.5 w-full rounded-xl border border-border px-3 py-2.5" /></label>

            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
              Al guardar: estado inicial <strong>Recibido</strong> + movimiento de recepción + auditoría. El stock web no cambia en esta fase.
            </div>

            <button disabled={saving || !selected} className="w-full rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Recibiendo..." : "Recibir computador"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
