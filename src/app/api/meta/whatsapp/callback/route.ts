/**
 * GET /api/meta/whatsapp/callback — redirect URI de Embedded Signup.
 *
 * Envoltorio FINO a propósito: toda la lógica vive en src/lib/meta/callback.ts,
 * que es hermético y testeable. Aquí solo se decide 404 vs. proceso, se
 * traduce el resultado a una redirección y se registra un evento ya saneado.
 *
 * ── LO QUE NUNCA SALE DE AQUÍ ────────────────────────────────────────────
 * `request.url` completo, la query string, el `code`, el token y el App Secret.
 * El log lleva únicamente: nombres de parámetros, código interno, veredicto del
 * número y duración.
 */
import { NextResponse } from "next/server";
import { aParametrosDeResultado, manejarCallback } from "@/lib/meta/callback";
import { configMeta, onboardingHabilitado, origenConfiable } from "@/lib/meta/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CABECERAS_BASE = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

const RUTA_RESULTADO = "/meta/whatsapp/onboarding/resultado";

export async function GET(request: Request): Promise<NextResponse> {
  // Kill switch. Apagado, la ruta no existe: ni siquiera revela que el código
  // está desplegado.
  if (!onboardingHabilitado()) {
    return new NextResponse("no encontrado", {
      status: 404,
      headers: { ...CABECERAS_BASE, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const inicio = Date.now();

  let config;
  let origen;
  try {
    config = configMeta();
    origen = origenConfiable();
  } catch (err) {
    // Sin configuración no se puede ni redirigir con garantías: el destino sale
    // de META_OAUTH_REDIRECT_URI, precisamente para no confiar en la petición.
    const name = err instanceof Error ? err.name : "UnknownError";
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[meta/callback] configuración inválida: ${name}: ${message}`);
    return new NextResponse("configuracion invalida", {
      status: 500,
      headers: { ...CABECERAS_BASE, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // `request.url` se usa SOLO para leer los parámetros. Nunca se registra.
  const url = new URL(request.url);

  let resultado;
  try {
    resultado = await manejarCallback(url, { config });
  } catch (err) {
    // manejarCallback no debería lanzar, pero si lo hace no se propaga nada
    // crudo: podría llevar la URL de la petición, y en ella viaja el `code`.
    const name = err instanceof Error ? err.name : "UnknownError";
    console.error(`[meta/callback] fallo inesperado: ${name}`);
    resultado = null;
  }

  const parametros = resultado
    ? aParametrosDeResultado(resultado)
    : new URLSearchParams({ estado: "error", codigo: "ERROR_INESPERADO", coincide: "DESCONOCIDO", state: "ausente" });

  if (resultado) {
    console.info(
      `[meta/callback] ${resultado.estado} codigo=${resultado.codigo} ` +
        `coincide=${resultado.coincide} state=${resultado.state} ` +
        `params=[${resultado.parametros.join("|")}] ms=${Date.now() - inicio}`
    );
  }

  const destino = new URL(RUTA_RESULTADO, origen);
  destino.search = parametros.toString();

  // 303: el navegador sigue con un GET limpio y la URL con el `code` desaparece
  // de la barra de direcciones (y del historial de la pestaña siguiente).
  return new NextResponse(null, {
    status: 303,
    headers: { ...CABECERAS_BASE, Location: destino.toString() },
  });
}
