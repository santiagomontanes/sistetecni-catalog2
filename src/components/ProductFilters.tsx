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
  onApply: () => void;
  onClear: () => void;
}

export default function ProductFilters({
  filters,
  onChange,
  onApply,
  onClear,
}: ProductFiltersProps) {
  const inputClass =
    "rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-text placeholder:text-muted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

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
                const next = {
                  ...filters,
                  brand: brand === "Todos" ? undefined : brand,
                };
                onChange(next);
                onApply();
              }}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-white text-muted hover:border-primary hover:text-primary"
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
          onClick={onApply}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90"
        >
          Aplicar
        </button>

        <button
          onClick={onClear}
          className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-muted transition hover:border-primary hover:text-primary"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}
