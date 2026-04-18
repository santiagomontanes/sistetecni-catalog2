"use client";

import { useEffect, useState } from "react";
import {
  getAllTestimonials,
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
  toggleTestimonialActive,
} from "@/supabase/db";
import type { Testimonial } from "@/types/testimonial";
import type { TestimonialPayload } from "@/supabase/db";

const emptyForm: TestimonialPayload = {
  clientName: "",
  text: "",
  rating: 5,
  source: "Google",
  active: true,
};

export default function AdminTestimoniosPage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<TestimonialPayload>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const data = await getAllTestimonials();
      setTestimonials(data);
    } catch {
      setError("No se pudo cargar los testimonios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMsg("");
    try {
      if (editing) {
        await updateTestimonial(editing, form);
        setMsg("Testimonio actualizado.");
      } else {
        await createTestimonial(form);
        setMsg("Testimonio creado.");
      }
      setForm(emptyForm);
      setEditing(null);
      await load();
    } catch (e) {
      setError(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (t: Testimonial) => {
    setEditing(t.id);
    setForm({
      clientName: t.clientName,
      text: t.text,
      rating: t.rating,
      source: t.source,
      photoUrl: t.photoUrl,
      active: t.active !== false,
    });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Eliminar este testimonio?")) return;
    try {
      await deleteTestimonial(id);
      setMsg("Testimonio eliminado.");
      await load();
    } catch {
      setError("No se pudo eliminar.");
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await toggleTestimonialActive(id, active);
      await load();
    } catch {
      setError("No se pudo cambiar el estado.");
    }
  };

  const inputCls =
    "w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-text outline-none focus:ring-2 focus:ring-primary/20";
  const btnPrimary =
    "rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60";
  const btnGhost =
    "rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted transition hover:border-primary hover:text-primary";

  const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Testimonios</h1>
        <p className="mt-1 text-sm text-muted">Reseñas de clientes visibles en la página de inicio</p>
      </div>

      {error && (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {msg && (
        <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {msg}
        </p>
      )}

      {/* Form */}
      <form onSubmit={(e) => void handleSubmit(e)} className="rounded-2xl border border-border bg-surface p-6 space-y-4">
        <h2 className="font-semibold text-text">
          {editing ? "Editar testimonio" : "Nuevo testimonio"}
        </h2>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm text-muted">Nombre del cliente</label>
            <input
              required
              value={form.clientName}
              onChange={(e) => setForm((p) => ({ ...p, clientName: e.target.value }))}
              placeholder="Juan Pérez"
              className={inputCls}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted">Fuente</label>
            <input
              value={form.source}
              onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
              placeholder="Google, WhatsApp, etc."
              className={inputCls}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-muted">Reseña</label>
          <textarea
            required
            value={form.text}
            onChange={(e) => setForm((p) => ({ ...p, text: e.target.value }))}
            placeholder="Excelente servicio..."
            rows={3}
            className={inputCls + " resize-none"}
          />
        </div>

        <div className="flex flex-wrap items-center gap-5">
          <div className="space-y-1">
            <label className="text-sm text-muted">Calificación</label>
            <select
              value={form.rating}
              onChange={(e) => setForm((p) => ({ ...p, rating: Number(e.target.value) }))}
              className={inputCls + " w-auto"}
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>{stars(n)}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-text mt-4">
            <input
              type="checkbox"
              checked={form.active !== false}
              onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
              className="h-4 w-4 accent-primary"
            />
            Activo (visible en web)
          </label>
        </div>

        <div className="flex gap-3">
          <button disabled={saving} className={btnPrimary}>
            {saving ? "Guardando..." : editing ? "Actualizar" : "Crear"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => { setEditing(null); setForm(emptyForm); }}
              className={btnGhost}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      {/* List */}
      {loading ? (
        <p className="text-sm text-muted">Cargando...</p>
      ) : testimonials.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          No hay testimonios.
        </p>
      ) : (
        <div className="space-y-3">
          {testimonials.map((t) => (
            <div
              key={t.id}
              className={`rounded-2xl border p-4 ${t.active !== false ? "border-border bg-white" : "border-border bg-surface opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-text text-sm">{t.clientName}</span>
                    <span className="text-xs text-muted">{t.source}</span>
                    <span className="text-xs text-yellow-500">{stars(t.rating)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.active !== false
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-surface text-muted"
                      }`}
                    >
                      {t.active !== false ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted line-clamp-2">{t.text}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => void handleToggle(t.id, !(t.active !== false))}
                    className={btnGhost}
                  >
                    {t.active !== false ? "Desactivar" : "Activar"}
                  </button>
                  <button onClick={() => handleEdit(t)} className={btnGhost}>
                    Editar
                  </button>
                  <button
                    onClick={() => void handleDelete(t.id)}
                    className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
