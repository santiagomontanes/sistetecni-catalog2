"use client";

import { useCallback, useEffect, useState } from "react";
import { callAdminAction } from "@/lib/callAdminAction";
import { createCustomer, listCustomers } from "@/app/admin/clientes/actions";
import type { AdminCustomerDTO } from "@/lib/erpAdmin/types";

const EMPTY_FORM = {
  fullName: "",
  documentType: "CC",
  documentNumber: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  notes: "",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export default function AdminClientesPage() {
  const [items, setItems] = useState<AdminCustomerDTO[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async (search = "") => {
    try {
      setLoading(true);
      setError("");
      const result = await callAdminAction(listCustomers, { query: search });
      if (!result.ok) {
        setError(result.error === "FORBIDDEN" ? "No tienes permisos de administrador." : "No fue posible cargar los clientes.");
        return;
      }
      setItems(result.data.items);
    } catch {
      setError("No fue posible cargar los clientes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const result = await callAdminAction(createCustomer, form);
      if (!result.ok) {
        if (result.error === "VALIDATION_ERROR") setError(result.issues.join(" "));
        else if (result.error === "FORBIDDEN") setError("No tienes permisos de administrador.");
        else setError("No fue posible crear el cliente.");
        return;
      }

      setItems((prev) => [result.data, ...prev.filter((item) => item.id !== result.data.id)]);
      setForm(EMPTY_FORM);
      setSuccess(`Cliente ${result.data.fullName} creado correctamente.`);
    } catch {
      setError("No fue posible crear el cliente.");
    } finally {
      setSaving(false);
    }
  };

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    void load(query.trim());
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">ERP · Clientes</p>
        <h1 className="mt-1 text-2xl font-bold text-text">Clientes</h1>
        <p className="mt-1 text-sm text-muted">
          Registro canónico de clientes. Las ventas conservarán sus datos históricos aunque el cliente se actualice después.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre, documento, celular o correo"
              className="min-w-0 flex-1 rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white">Buscar</button>
          </form>

          {loading ? <p className="text-sm text-muted">Cargando clientes...</p> : null}
          {error ? <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
          {success ? <p className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

          {!loading && items.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
              No hay clientes que coincidan con la búsqueda.
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            {items.map((customer) => (
              <article key={customer.id} className="rounded-2xl border border-border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-text">{customer.fullName}</h2>
                    <p className="text-xs text-muted">Creado {formatDate(customer.createdAt)}</p>
                  </div>
                  {customer.city ? (
                    <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-muted">{customer.city}</span>
                  ) : null}
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-muted">Documento</dt><dd className="text-right font-medium text-text">{customer.documentNumber ? `${customer.documentType ?? "DOC"} ${customer.documentNumber}` : "—"}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-muted">Celular</dt><dd className="text-right text-text">{customer.phone ?? "—"}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-muted">Correo</dt><dd className="truncate text-right text-text">{customer.email ?? "—"}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <aside className="h-fit rounded-2xl border border-border bg-white p-5 xl:sticky xl:top-24">
          <h2 className="text-lg font-bold text-text">Nuevo cliente</h2>
          <p className="mt-1 text-xs text-muted">Solo el nombre es obligatorio. Documento y contacto pueden completarse después.</p>

          <form onSubmit={handleCreate} className="mt-5 space-y-4">
            <label className="block text-sm font-medium text-text">
              Nombre completo *
              <input required value={form.fullName} onChange={(e) => update("fullName", e.target.value)} className="mt-1.5 w-full rounded-xl border border-border px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary/20" />
            </label>

            <div className="grid grid-cols-[120px_1fr] gap-2">
              <label className="block text-sm font-medium text-text">
                Tipo
                <select value={form.documentType} onChange={(e) => update("documentType", e.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5">
                  <option value="CC">CC</option>
                  <option value="CE">CE</option>
                  <option value="NIT">NIT</option>
                  <option value="Pasaporte">Pasaporte</option>
                  <option value="Otro">Otro</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-text">
                Documento
                <input value={form.documentNumber} onChange={(e) => update("documentNumber", e.target.value)} className="mt-1.5 w-full rounded-xl border border-border px-3 py-2.5" />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <label className="block text-sm font-medium text-text">Celular<input value={form.phone} onChange={(e) => update("phone", e.target.value)} className="mt-1.5 w-full rounded-xl border border-border px-3 py-2.5" /></label>
              <label className="block text-sm font-medium text-text">Ciudad<input value={form.city} onChange={(e) => update("city", e.target.value)} className="mt-1.5 w-full rounded-xl border border-border px-3 py-2.5" /></label>
            </div>

            <label className="block text-sm font-medium text-text">Correo<input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} className="mt-1.5 w-full rounded-xl border border-border px-3 py-2.5" /></label>
            <label className="block text-sm font-medium text-text">Dirección<input value={form.address} onChange={(e) => update("address", e.target.value)} className="mt-1.5 w-full rounded-xl border border-border px-3 py-2.5" /></label>
            <label className="block text-sm font-medium text-text">Notas<textarea rows={3} value={form.notes} onChange={(e) => update("notes", e.target.value)} className="mt-1.5 w-full rounded-xl border border-border px-3 py-2.5" /></label>

            <button disabled={saving} className="w-full rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? "Guardando..." : "Crear cliente"}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
