"use client";
import type { WorkshopExtra } from "@/lib/workshop/types";

const field = "mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const money = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

// Arreglo adicional ocasional: nombre y valor libres. El valor se suma al costo del equipo y no se edita:
// si hubo un error, un administrador lo anula con motivo y queda el reverso en el libro de costos.
export default function ExtraWork({ extras, disabled, onAdd, onReverse }: {
  extras: WorkshopExtra[]; disabled: boolean;
  onAdd: (payload: { name: string; amountCop: string }) => Promise<void>;
  onReverse: (costEntryId: string, reason: string) => Promise<void>;
}) {
  const active = extras.filter(x => !x.reversed);
  const total = active.reduce((sum, x) => sum + x.amountCop, 0);
  return (
    <details open className="rounded-xl border border-border bg-white p-4 shadow-sm">
      <summary className="cursor-pointer text-base font-semibold">Arreglo adicional <span className="text-sm font-normal text-slate-500">· ocasional, el valor suma al costo del equipo</span></summary>
      {extras.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {extras.map(x => (
            <li key={x.id} className={`flex flex-wrap items-center gap-2 rounded-lg bg-surface/40 px-3 py-2 ${x.reversed ? "text-slate-400 line-through" : ""}`}>
              <span className="font-medium">{x.description.replace(/^Arreglo adicional: /, "")}</span>
              <span className="font-data">{money(x.amountCop)}</span>
              {x.reversed ? <span className="text-xs no-underline">anulado</span> : (
                <button type="button" disabled={disabled} className="ml-auto text-xs text-red-700 hover:underline"
                  onClick={() => { const reason = window.prompt("Motivo para anular este arreglo (solo administrador):"); if (reason && reason.trim().length >= 3) void onReverse(x.id, reason.trim()); }}>Anular</button>
              )}
            </li>
          ))}
          <li className="px-3 pt-1 font-semibold">Total sumado al costo: <span className="font-data">{money(total)}</span></li>
        </ul>
      )}
      <form
        className="mt-3 grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
        onSubmit={e => {
          e.preventDefault();
          const form = e.currentTarget; const fd = new FormData(form);
          void onAdd({ name: String(fd.get("name") ?? "").trim(), amountCop: String(fd.get("amount") ?? "").trim() }).then(() => form.reset());
        }}
      >
        <fieldset disabled={disabled} className="contents">
          <label className="text-sm font-medium">Nombre del arreglo<input name="name" required minLength={3} maxLength={120} placeholder="Ej.: soldadura de bisagra" className={field} /></label>
          <label className="text-sm font-medium">Valor COP<input name="amount" required inputMode="numeric" pattern="[1-9][0-9]*" placeholder="Ej.: 35000" className={field} /></label>
          <button className="rounded-lg bg-primary px-4 py-2 font-semibold text-white">Agregar</button>
        </fieldset>
      </form>
    </details>
  );
}
