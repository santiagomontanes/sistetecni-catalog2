/**
 * Descarga el catálogo PDF desde el navegador del administrador (P20.21C).
 *
 * Mismo mecanismo que `downloadAdminSalePdf`: el endpoint es un Route
 * Handler, así que el access_token viaja en el header Authorization (no en
 * un payload de Server Action), y la autorización del otro lado la impone
 * `requireAdmin`.
 */
import { supabase } from "@/supabase/client";

export class DownloadCatalogPdfError extends Error {
  constructor(public readonly status: number) {
    super(`No se pudo generar el catálogo (status ${status}).`);
    this.name = "DownloadCatalogPdfError";
  }
}

/** Nombre estable y fechado: `Catalogo-SISTETECNI-YYYY-MM-DD.pdf`. */
export function nombreArchivoCatalogo(fecha: Date = new Date()): string {
  return `Catalogo-SISTETECNI-${fecha.toISOString().slice(0, 10)}.pdf`;
}

export async function downloadAdminCatalogPdf(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  const response = await fetch("/api/admin/catalog/pdf", {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });

  if (!response.ok) throw new DownloadCatalogPdfError(response.status);

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nombreArchivoCatalogo();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
