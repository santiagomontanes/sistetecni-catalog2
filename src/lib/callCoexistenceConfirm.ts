/**
 * Helper cliente para `POST /api/meta/coexistence/confirm`.
 *
 * Mismo mecanismo de auth que `downloadAdminSalePdf.ts`: este proyecto no usa
 * cookies de sesión, así que el `access_token` de la sesión Supabase actual
 * viaja en la cabecera `Authorization: Bearer …`. El servidor lo valida contra
 * Supabase (`requireAdmin`) — el navegador no decide nada.
 *
 * Se envía EXACTAMENTE `{ code, wabaId, phoneNumberId }`. El `code` no se
 * registra: se pasa y se olvida. La respuesta nunca trae el token ni el code.
 */
import { supabase } from "@/supabase/client";

/** Metadata NO sensible que el servidor devuelve cuando todo verifica y suscribe. */
export interface VerificadoConfirm {
  appIdCoincide: boolean;
  tokenValido: boolean;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string | null;
}

export type ResultadoConfirm =
  | { ok: true; suscrito: boolean; verificado: VerificadoConfirm; siguientePaso: string }
  | { ok: false; codigo: string; status: number };

export interface EntradaConfirm {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}

/** Códigos que el servidor puede devolver (para textos de UI). Solo referencia. */
export const CODIGOS_CONFIRM = [
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "COEXISTENCE_DISABLED",
  "BODY_INVALIDO",
  "CODE_INVALIDO",
  "INTERCAMBIO_FALLIDO",
  "TOKEN_INVALIDO",
  "APP_ID_NO_COINCIDE",
  "WABA_INVALIDA",
  "PHONE_NUMBER_NO_PERTENECE_A_WABA",
  "SUBSCRIPCION_FALLIDA",
  "META_TIMEOUT",
  "META_ERROR",
  "ERROR_INTERNO",
] as const;

export async function callCoexistenceConfirm(entrada: EntradaConfirm): Promise<ResultadoConfirm> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  let respuesta: Response;
  try {
    respuesta = await fetch("/api/meta/coexistence/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        code: entrada.code,
        wabaId: entrada.wabaId,
        phoneNumberId: entrada.phoneNumberId,
      }),
    });
  } catch {
    return { ok: false, codigo: "META_ERROR", status: 0 };
  }

  let cuerpo: unknown = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    return { ok: false, codigo: "ERROR_INTERNO", status: respuesta.status };
  }

  if (
    respuesta.ok &&
    typeof cuerpo === "object" &&
    cuerpo !== null &&
    (cuerpo as { ok?: unknown }).ok === true
  ) {
    const c = cuerpo as {
      suscrito?: unknown;
      verificado: VerificadoConfirm;
      siguientePaso?: unknown;
    };
    return {
      ok: true,
      suscrito: c.suscrito === true,
      verificado: c.verificado,
      siguientePaso: typeof c.siguientePaso === "string" ? c.siguientePaso : "CAMBIAR_NUMERO_AGENTE",
    };
  }

  const codigo =
    typeof cuerpo === "object" && cuerpo !== null && typeof (cuerpo as { codigo?: unknown }).codigo === "string"
      ? (cuerpo as { codigo: string }).codigo
      : "ERROR_INTERNO";
  return { ok: false, codigo, status: respuesta.status };
}
