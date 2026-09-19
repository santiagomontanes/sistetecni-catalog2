"use client";

import { useState } from "react";
import { downloadAdminCatalogPdf } from "@/lib/downloadAdminCatalogPdf";

/**
 * Botón "Crear catálogo" (P20.21C).
 *
 * Genera el PDF con el inventario VIGENTE en el momento del clic y lo
 * descarga. Es una operación de LECTURA: no modifica ningún producto y no
 * requiere editar nada antes.
 *
 * Componente cliente pequeño y autocontenido para no tener que convertir la
 * página entera: se monta donde haga falta sin arrastrar estado ajeno.
 */
export default function CatalogPdfButton() {
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState("");

  const handleClick = async () => {
    // Guarda contra el doble clic: mientras haya una generación en curso el
    // botón está deshabilitado, pero esta comprobación cierra también la
    // carrera de dos clics muy seguidos.
    if (generando) return;

    setGenerando(true);
    setError("");
    try {
      await downloadAdminCatalogPdf();
    } catch {
      setError("No se pudo generar el catálogo. Inténtalo de nuevo.");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={generando}
        aria-busy={generando}
        className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {generando ? "Generando catálogo..." : "📄 Crear catálogo"}
      </button>
      {error && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
