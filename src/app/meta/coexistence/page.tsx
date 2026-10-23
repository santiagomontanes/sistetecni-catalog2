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
 * agente. Ver docs/erp/12-coexistence-onboarding-temporal.md.
 *
 * ── DIAGNÓSTICO (server-side, sin secretos) ──────────────────────────────
 * Aquí se compara `NEXT_PUBLIC_META_APP_ID` (el que usa el navegador para
 * FB.init) con `META_APP_ID` (el que usa el servidor para el exchange). Si NO
 * coinciden, el popup corre como una app y el servidor intenta canjear el code
 * como otra → el flujo nunca puede completarse. Solo se pasa al cliente un
 * booleano y strings enmascaradas; NUNCA el App Secret ni valores enteros.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { coexistenceHabilitado } from "@/lib/meta/env";
import { enmascararConfigId } from "@/lib/meta/coexistence";
import CoexistenceClient, { type DiagnosticoServidor } from "./CoexistenceClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conectar WhatsApp Business (Coexistence)",
  robots: { index: false, follow: false },
};

function calcularDiagnostico(): DiagnosticoServidor {
  const publico = process.env.NEXT_PUBLIC_META_APP_ID?.trim() || null;
  const servidor = process.env.META_APP_ID?.trim() || null;
  const configId = process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID?.trim() || null;

  return {
    appIdPublicoPresente: publico !== null,
    appIdServidorPresente: servidor !== null,
    // Solo se puede afirmar la coincidencia si AMBOS están presentes.
    appIdPublicoCoincideConServer: publico !== null && servidor !== null ? publico === servidor : null,
    // El App ID no es secreto, pero no hay razón para publicarlo entero.
    appIdEnmascarado: publico ? enmascararConfigId(publico) : "(ausente)",
    configIdPresente: configId !== null,
    configIdEnmascarado: enmascararConfigId(configId),
    graphApiVersion: process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION?.trim() || "v23.0",
    oauthRedirectPresente: (process.env.META_OAUTH_REDIRECT_URI?.trim() ?? "") !== "",
    appSecretPresente: (process.env.META_APP_SECRET?.trim() ?? "") !== "",
  };
}

export default function CoexistencePage() {
  if (!coexistenceHabilitado()) notFound();
  return <CoexistenceClient diagnosticoServidor={calcularDiagnostico()} />;
}
