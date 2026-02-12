import type { ProductFilters as ProductFilterValues } from '@/types/product';

interface ProductFiltersProps {
  filters: ProductFilterValues;
  onChange: (next: ProductFilterValues) => void;
  onApply: () => void;
  onClear: () => void;
}

export default function ProductFilters({ filters, onChange, onApply, onClear }: ProductFiltersProps) {
  return (
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-5">
      <input
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Marca"
        value={filters.brand ?? ''}
        onChange={(event) => onChange({ ...filters, brand: event.target.value || undefined })}
      />
      <input
        type="number"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="RAM (GB)"
        value={filters.ram ?? ''}
        onChange={(event) => onChange({ ...filters, ram: event.target.value ? Number(event.target.value) : undefined })}
      />
      <input
        type="number"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Precio mín"
        value={filters.minPrice ?? ''}
        onChange={(event) =>
          onChange({ ...filters, minPrice: event.target.value ? Number(event.target.value) : undefined })
        }
      />
      <input
        type="number"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Precio máx"
        value={filters.maxPrice ?? ''}
        onChange={(event) =>
          onChange({ ...filters, maxPrice: event.target.value ? Number(event.target.value) : undefined })
        }
      />
      <div className="flex gap-2">
        <button onClick={onApply} className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white">
          Aplicar
        </button>
        <button onClick={onClear} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          Limpiar
        </button>
      </div>
    </div>
  );
}
