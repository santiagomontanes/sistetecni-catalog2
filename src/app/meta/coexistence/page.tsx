/**
 * Página TEMPORAL y de uso interno para conectar por Coexistence un número que
 * YA usa la WhatsApp Business App a Meta Cloud API mediante Embedded Signup
 * (Facebook JavaScript SDK).
 *
 * ── ESTADO ──────────────────────────────────────────────────────────────
 * Esta ruta NO forma parte del producto. Vive detrás de:
 *   1. Un kill switch server-only: META_COEXISTENCE_ENABLED === "true".
 *      Apagado → notFound(), la ruta ni siquiera revela que existe.
 *   2. ProtectedAdmin (en el componente cliente): exige sesión ERP válida.
 *
 * No toca Supabase, ni el webhook, ni el PHONE_NUMBER_ID/WABA actuales, ni el
 * agente. Solo lanza el asistente de Meta y muestra los identificadores no
 * secretos que Meta devuelva. El intercambio del `code` por token NO se hace
 * aquí (ver docs/erp/12-coexistence-onboarding-temporal.md).
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { coexistenceHabilitado } from "@/lib/meta/env";
import CoexistenceClient from "./CoexistenceClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conectar WhatsApp Business (Coexistence)",
  robots: { index: false, follow: false },
};

export default function CoexistencePage() {
  if (!coexistenceHabilitado()) notFound();
  return <CoexistenceClient />;
}
