"use client";

import type { ProductFilters as ProductFilterValues } from "@/types/product";

const BRAND_OPTIONS = ["Todos", "Dell", "HP", "Lenovo", "Apple", "Asus", "Acer"];
const RAM_OPTIONS = [
  { label: "Toda RAM", value: "" },
  { label: "4 GB", value: "4" },
  { label: "8 GB", value: "8" },
  { label: "16 GB", value: "16" },
  { label: "32 GB", value: "32" },
];

interface ProductFiltersProps {
  filters: ProductFilterValues;
  onChange: (next: ProductFilterValues) => void;
  // Recibe los filtros directamente para evitar stale closure en el padre
  onApply: (f: ProductFilterValues) => void;
  onClear: () => void;
}

export default function ProductFilters({
  filters,
  onChange,
  onApply,
  onClear,
}: ProductFiltersProps) {
  const inputClass =
    "rounded-lg border-2 border-ink/20 bg-white px-4 py-2.5 font-data text-sm text-ink placeholder:text-muted outline-none transition focus:border-primary";

  return (
    <div className="space-y-4">
      {/* Brand pills */}
      <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
        {BRAND_OPTIONS.map((brand) => {
          const isActive =
            brand === "Todos" ? !filters.brand : filters.brand === brand;
          return (
            <button
              key={brand}
              onClick={() => {
                const next: ProductFilterValues = {
                  ...filters,
                  brand: brand === "Todos" ? undefined : brand,
                };
                onChange(next);
                // Pasamos `next` directamente — evita el stale closure
                onApply(next);
              }}
              className={`shrink-0 rounded border-2 px-4 py-2 font-display text-base font-bold uppercase tracking-wide transition ${
                isActive
                  ? "border-ink bg-ink text-white"
                  : "border-ink/20 bg-white text-ink hover:border-primary hover:text-primary"
              }`}
            >
              {brand}
            </button>
          );
        })}
      </div>

      {/* Advanced filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filters.ram ?? ""}
          onChange={(e) =>
            onChange({
              ...filters,
              ram: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          className={inputClass}
        >
          {RAM_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <input
          type="number"
          className={`${inputClass} w-36`}
          placeholder="Precio mín"
          value={filters.minPrice ?? ""}
          onChange={(e) =>
            onChange({
              ...filters,
              minPrice: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />

        <input
          type="number"
          className={`${inputClass} w-36`}
          placeholder="Precio máx"
          value={filters.maxPrice ?? ""}
          onChange={(e) =>
            onChange({
              ...filters,
              maxPrice: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />

        <button
          onClick={() => onApply(filters)}
          className="rounded-lg bg-primary px-5 py-2.5 font-display text-base font-bold uppercase tracking-wide text-white transition hover:bg-ink"
        >
          Aplicar
        </button>

        <button
          onClick={onClear}
          className="rounded-lg border-2 border-ink/20 px-5 py-2.5 font-display text-base font-bold uppercase tracking-wide text-ink transition hover:border-primary hover:text-primary"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}
