import type { ProductFilters as ProductFilterValues } from "@/types/product";

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
    "w-full rounded-xl border border-border bg-bg/40 px-4 py-3 text-sm text-text placeholder:text-muted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="grid gap-3 md:grid-cols-6">
        <input
          className={inputClass}
          placeholder="Marca"
          value={filters.brand ?? ""}
          onChange={(event) =>
            onChange({ ...filters, brand: event.target.value || undefined })
          }
        />

        <input
          type="number"
          className={inputClass}
          placeholder="RAM (GB)"
          value={filters.ram ?? ""}
          onChange={(event) =>
            onChange({
              ...filters,
              ram: event.target.value ? Number(event.target.value) : undefined,
            })
          }
        />

        <input
          type="number"
          className={inputClass}
          placeholder="Precio mín"
          value={filters.minPrice ?? ""}
          onChange={(event) =>
            onChange({
              ...filters,
              minPrice: event.target.value
                ? Number(event.target.value)
                : undefined,
            })
          }
        />

        <input
          type="number"
          className={inputClass}
          placeholder="Precio máx"
          value={filters.maxPrice ?? ""}
          onChange={(event) =>
            onChange({
              ...filters,
              maxPrice: event.target.value
                ? Number(event.target.value)
                : undefined,
            })
          }
        />

        <button
          onClick={onApply}
          className="rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 md:col-span-1"
        >
          Aplicar
        </button>

        <button
          onClick={onClear}
          className="rounded-xl border border-border bg-bg/20 px-4 py-3 text-sm font-medium text-muted transition hover:bg-bg/40 md:col-span-1"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}
