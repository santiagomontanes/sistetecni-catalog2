"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/supabase/client";
import { getProductByIdAdmin, getProductsList } from "@/supabase/db";
import { createUpgradeOptionsRepository } from "@/lib/repositories/upgradeOptions.repository";
import { createProductUpgradeOptionsRepository } from "@/lib/repositories/productUpgradeOptions.repository";
import { callAdminAction } from "@/lib/callAdminAction";
import { setProductCompatibility, copyProductCompatibility } from "@/app/admin/personalizador/actions";
import { formatCOP } from "@/lib/personalizadorUi";
import type { UpgradeOption } from "@/types/upgrade";
import type { Product } from "@/types/product";

const upgradesRepo = createUpgradeOptionsRepository(supabase);
const compatibilityRepo = createProductUpgradeOptionsRepository(supabase);

interface AdminProductCompatibilityProps {
  productId: string;
}

function gpuLabel(product: Product | null): string {
  if (!product?.gpuType) return "No confirmado";
  return product.gpuType === "dedicada" ? "Dedicada" : "Integrada";
}

function touchLabel(product: Product | null): string {
  if (product?.touchScreen === null || product?.touchScreen === undefined) return "No confirmado";
  return product.touchScreen ? "Sí" : "No";
}

export default function AdminProductCompatibility({ productId }: AdminProductCompatibilityProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [allUpgrades, setAllUpgrades] = useState<UpgradeOption[]>([]);
  const [compatibleIds, setCompatibleIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [otherProducts, setOtherProducts] = useState<Product[]>([]);
  const [copySourceId, setCopySourceId] = useState("");
  const [copyPreview, setCopyPreview] = useState<UpgradeOption[] | null>(null);
  const [copyLoading, setCopyLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [fullProduct, active, compatible] = await Promise.all([
        getProductByIdAdmin(productId),
        upgradesRepo.findActive(),
        compatibilityRepo.findCompatibleUpgradesForProduct(productId),
      ]);
      setProduct(fullProduct);
      setAllUpgrades(active);
      setCompatibleIds(new Set(compatible.map((c) => c.option.id)));
    } catch {
      setError("No fue posible cargar la compatibilidad de este producto.");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setCopySourceId("");
    setCopyPreview(null);
    void getProductsList({ pageSize: 200 }).then((page) => {
      setOtherProducts(page.items.filter((p) => p.id !== productId));
    });
  }, [productId]);

  function toggle(upgradeId: string) {
    setMessage("");
    setCompatibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(upgradeId)) next.delete(upgradeId);
      else next.add(upgradeId);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await callAdminAction(setProductCompatibility, {
        productId,
        upgradeOptionIds: [...compatibleIds],
      });
      if (!result.ok) {
        setError(
          result.error === "FORBIDDEN" ? "No tienes permisos de administrador." : "No se pudo guardar la compatibilidad."
        );
        return;
      }
      setMessage("Compatibilidad guardada.");
    } catch {
      setError("No se pudo guardar la compatibilidad.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePreviewCopy() {
    if (!copySourceId) return;
    setCopyLoading(true);
    setError("");
    try {
      const compatible = await compatibilityRepo.findCompatibleUpgradesForProduct(copySourceId);
      setCopyPreview(compatible.map((c) => c.option));
    } catch {
      setError("No se pudo previsualizar la compatibilidad del producto origen.");
    } finally {
      setCopyLoading(false);
    }
  }

  async function handleConfirmCopy() {
    if (!copySourceId) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await callAdminAction(copyProductCompatibility, {
        sourceProductId: copySourceId,
        targetProductId: productId,
      });
      if (!result.ok) {
        setError(
          result.error === "FORBIDDEN" ? "No tienes permisos de administrador." : "No se pudo copiar la compatibilidad."
        );
        return;
      }
      setMessage(`Compatibilidad copiada (${result.data.copiedCount} upgrade${result.data.copiedCount !== 1 ? "s" : ""}).`);
      setCopyPreview(null);
      setCopySourceId("");
      await load();
    } catch {
      setError("No se pudo copiar la compatibilidad.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted">Cargando compatibilidad...</p>;

  const ramOptions = allUpgrades.filter((u) => u.category === "ram");
  const storageOptions = allUpgrades.filter((u) => u.category === "storage");

  const checkboxRow = "flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm";

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-surface p-6">
      <div>
        <h2 className="text-lg font-semibold text-text">Compatibilidad de upgrades</h2>
        <p className="text-xs text-muted">
          Ausencia de marca = ese upgrade NO se ofrece para este producto. Nunca se asume compatibilidad por
          modelo o categoría.
        </p>
      </div>

      {/* Punto 5: características base vs. upgrades permitidos */}
      <div className="grid gap-4 rounded-xl border border-border bg-white p-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Características del equipo base</p>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">CPU</dt>
              <dd className="font-medium text-text">{product?.cpu || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">RAM actual</dt>
              <dd className="font-medium text-text">{product?.ram ?? "—"} GB</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Almacenamiento actual</dt>
              <dd className="font-medium text-text">{product?.storage || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Gráfica</dt>
              <dd className="font-medium text-text">{gpuLabel(product)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Táctil</dt>
              <dd className="font-medium text-text">{touchLabel(product)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted">
            CPU y gráfica NO se editan aquí como &quot;upgrade&quot; — son características base. Para cambiarlas,
            edita el producto arriba.
          </p>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">Upgrades permitidos</p>
          {compatibleIds.size === 0 ? (
            <p className="text-sm text-muted">Ninguno todavía — este producto no ofrece ningún upgrade.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {allUpgrades
                .filter((u) => compatibleIds.has(u.id))
                .map((u) => (
                  <li key={u.id} className="flex justify-between">
                    <span className="text-text">{u.label}</span>
                    <span className="text-muted">+{formatCOP(u.extraCost)}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>

      {/* Checklist editable */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold text-text">RAM</p>
          {ramOptions.length === 0 ? (
            <p className="text-xs text-muted">No hay upgrades de RAM activos en el catálogo.</p>
          ) : (
            <div className="space-y-2">
              {ramOptions.map((u) => (
                <label key={u.id} className={checkboxRow}>
                  <input
                    type="checkbox"
                    checked={compatibleIds.has(u.id)}
                    onChange={() => toggle(u.id)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="text-text">{u.label}</span>
                  <span className="ml-auto text-muted">+{formatCOP(u.extraCost)}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-text">Almacenamiento</p>
          {storageOptions.length === 0 ? (
            <p className="text-xs text-muted">No hay upgrades de almacenamiento activos en el catálogo.</p>
          ) : (
            <div className="space-y-2">
              {storageOptions.map((u) => (
                <label key={u.id} className={checkboxRow}>
                  <input
                    type="checkbox"
                    checked={compatibleIds.has(u.id)}
                    onChange={() => toggle(u.id)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="text-text">{u.label}</span>
                  <span className="ml-auto text-muted">+{formatCOP(u.extraCost)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-500">{message}</p> : null}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {saving ? "Guardando..." : "Guardar compatibilidad"}
      </button>

      {/* D3: copiar compatibilidad desde otro producto */}
      <div className="space-y-3 rounded-xl border border-dashed border-border bg-white p-4">
        <p className="text-sm font-semibold text-text">Copiar compatibilidad desde otro producto</p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={copySourceId}
            onChange={(e) => {
              setCopySourceId(e.target.value);
              setCopyPreview(null);
            }}
            className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-text outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Selecciona un producto…</option>
            {otherProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handlePreviewCopy()}
            disabled={!copySourceId || copyLoading}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-text transition hover:border-primary hover:text-primary disabled:opacity-60"
          >
            {copyLoading ? "Cargando..." : "Ver vista previa"}
          </button>
        </div>

        {copyPreview ? (
          <div className="space-y-2 rounded-xl bg-surface p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Vista previa — {copyPreview.length} upgrade{copyPreview.length !== 1 ? "s" : ""}
            </p>
            {copyPreview.length === 0 ? (
              <p className="text-sm text-muted">El producto origen no tiene ningún upgrade compatible.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {copyPreview.map((u) => (
                  <li key={u.id}>
                    {u.label} <span className="text-muted">(+{formatCOP(u.extraCost)})</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted">
              Esto REEMPLAZARÁ la compatibilidad actual de este producto por la del producto origen. Se copian
              relaciones nuevas e independientes — modificar una después no afecta a la otra.
            </p>
            <button
              type="button"
              onClick={() => void handleConfirmCopy()}
              disabled={saving}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Copiando..." : "Confirmar copia"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
