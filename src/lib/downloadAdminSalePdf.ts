/**
 * Descarga el PDF de una venta desde el navegador. A diferencia de
 * callAdminAction.ts (que invoca una Server Action), el endpoint del PDF
 * es un Route Handler — el access_token viaja como header Authorization
 * en vez de como parte del payload, mismo mecanismo de auth
 * (requireAdmin) del otro lado.
 */
import { supabase } from "@/supabase/client";

export class DownloadSalePdfError extends Error {
  constructor(public readonly status: number) {
    super(`No se pudo descargar el PDF (status ${status}).`);
    this.name = "DownloadSalePdfError";
  }
}

export async function downloadAdminSalePdf(saleId: string, saleNumber: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  const response = await fetch(`/api/admin/sales/${saleId}/pdf`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });

  if (!response.ok) {
    throw new DownloadSalePdfError(response.status);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${saleNumber}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
