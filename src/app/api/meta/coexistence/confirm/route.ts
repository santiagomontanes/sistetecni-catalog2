/**
 * POST /api/meta/coexistence/confirm
 *
 * Verifica los activos que devolvió Embedded Signup y —solo si todo cuadra—
 * suscribe la app SISTETECNI a la WABA. UNA sola operación explícita: el
 * administrador la dispara con un botón, no ocurre automáticamente.
 *
 * Envoltorio FINO. Toda la lógica vive en `src/lib/meta/confirm.ts`, que es
 * hermético y testeable. Aquí solo: 404 vs. proceso, `configMeta()`, tope de
 * body, y traducción del resultado a JSON. El `code` y el business token NUNCA
 * pasan por este archivo.
 */
import { NextResponse } from "next/server";
import { configMeta, coexistenceHabilitado } from "@/lib/meta/env";
import { manejarConfirm, MAX_BYTES_BODY } from "@/lib/meta/confirm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CABECERAS_BASE = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : undefined;
}

function json(status: number, cuerpo: unknown): NextResponse {
  return NextResponse.json(cuerpo, { status, headers: CABECERAS_BASE });
}

export async function POST(request: Request): Promise<NextResponse> {
  const inicio = Date.now();

  if (!coexistenceHabilitado()) {
    return new NextResponse("no encontrado", {
      status: 404,
      headers: { ...CABECERAS_BASE, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Configuración server-only. Sus mensajes de error solo llevan NOMBRES de
  // variables; aun así al navegador solo va "ERROR_INTERNO".
  let config;
  try {
    config = configMeta();
  } catch (err) {
    console.error(
      `[meta/coexistence/confirm] configuración inválida: ${err instanceof Error ? err.name : "UnknownError"}`
    );
    return json(500, { ok: false, codigo: "ERROR_INTERNO" });
  }

  // Body: tope de tamaño ANTES de parsear.
  const crudo = await request.text();
  if (crudo.length > MAX_BYTES_BODY) {
    return json(400, { ok: false, codigo: "BODY_INVALIDO" });
  }
  let body: unknown = null;
  try {
    body = crudo.length > 0 ? JSON.parse(crudo) : null;
  } catch {
    return json(400, { ok: false, codigo: "BODY_INVALIDO" });
  }

  let resultado;
  try {
    resultado = await manejarConfirm({
      habilitado: true,
      authToken: extractBearerToken(request),
      body,
      config,
    });
  } catch (err) {
    console.error(
      `[meta/coexistence/confirm] fallo inesperado: ${err instanceof Error ? err.name : "UnknownError"}`
    );
    return json(500, { ok: false, codigo: "ERROR_INTERNO" });
  }

  // Log saneado: solo el código interno y la duración. Ni `code`, ni token, ni
  // teléfono, ni WABA, ni respuesta de Graph.
  const codigo = resultado.cuerpo.ok ? "OK" : resultado.cuerpo.codigo;
  console.info(
    `[meta/coexistence/confirm] ${resultado.ok ? "ok" : "error"} codigo=${codigo} ms=${Date.now() - inicio}`
  );

  return json(resultado.status, resultado.cuerpo);
}
