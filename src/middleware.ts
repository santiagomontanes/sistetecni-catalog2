import { NextRequest, NextResponse } from "next/server";
import {
  cabecerasCoexistence,
  destinoCoexistence,
  esRutaCoexistence,
  NO_STORE_HEADERS,
  validarProxySecretCoexistence,
  validarUpstreamCoexistence,
} from "./lib/meta/coexistenceProxy";

export function middleware(request: NextRequest) {
  if (!esRutaCoexistence(request.nextUrl.pathname)) return NextResponse.next();

  try {
    const upstream = validarUpstreamCoexistence(process.env.WHATSAPP_COEXISTENCE_UPSTREAM);
    const secret = validarProxySecretCoexistence(
      process.env.WHATSAPP_COEXISTENCE_PROXY_SECRET
    );
    const destino = destinoCoexistence(upstream, request.nextUrl);
    const headers = cabecerasCoexistence(request.headers, secret);
    const response = NextResponse.rewrite(destino, { request: { headers } });
    for (const [nombre, valor] of Object.entries(NO_STORE_HEADERS)) {
      response.headers.set(nombre, valor);
    }
    return response;
  } catch {
    // No se distingue configuración, host o secreto: un despliegue incompleto
    // falla cerrado y no cae en la implementación antigua de esta ruta.
    return NextResponse.json(
      { error: "acceso_no_permitido" },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}

export const config = {
  matcher: ["/meta/coexistence", "/meta/coexistence/:path*"],
};
