"use client";
// Selector de lista fija. `empty` es el texto de "sin dato"; si el valor actual no está en la lista (datos viejos) se agrega para no perderlo.
export default function Pick({ label, value, options, empty, className, onPick, name, show }: {
  label: string; value: string | number | null | undefined; options: readonly (string | number)[]; empty: string; className?: string; name?: string;
  onPick: (value: string) => void; show?: (option: string | number) => string;
}) {
  const current = value == null ? "" : String(value);
  const all = current && !options.map(String).includes(current) ? [...options, current] : options;
  return <select aria-label={label} name={name} className={className} defaultValue={current} onChange={e => onPick(e.target.value)}>
    <option value="">{empty}</option>{all.map(o => <option key={o} value={String(o)}>{show ? show(o) : String(o)}</option>)}
  </select>;
}
