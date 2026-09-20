export const COEXISTENCE_PROXY_HEADER = "x-sistetecni-coexistence-proxy";
export const COEXISTENCE_BASE_PATH = "/meta/coexistence";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export function esRutaCoexistence(pathname: string): boolean {
  return pathname === COEXISTENCE_BASE_PATH || pathname.startsWith(`${COEXISTENCE_BASE_PATH}/`);
}

export function validarUpstreamCoexistence(raw: string | undefined): URL {
  if (!raw || raw !== raw.trim() || raw.includes("*")) {
    throw new Error("WHATSAPP_COEXISTENCE_UPSTREAM inválido");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("WHATSAPP_COEXISTENCE_UPSTREAM inválido");
  }
  const host = url.hostname.toLowerCase();
  const esIPv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
  const esIPv6 = host.includes(":") || host.startsWith("[");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !host.includes(".") ||
    esIPv4 ||
    esIPv6 ||
    ["localhost", "127.0.0.1"].includes(host)
  ) {
    throw new Error("WHATSAPP_COEXISTENCE_UPSTREAM inválido");
  }
  return url;
}

export function validarProxySecretCoexistence(raw: string | undefined): string {
  if (!raw || raw.length < 43 || raw.length > 256 || /\s/.test(raw)) {
    throw new Error("WHATSAPP_COEXISTENCE_PROXY_SECRET inválido");
  }
  return raw;
}

export function destinoCoexistence(upstream: URL, requestUrl: URL): URL {
  if (!esRutaCoexistence(requestUrl.pathname)) throw new Error("ruta fuera de coexistence");
  const destino = new URL(upstream.origin);
  destino.pathname = requestUrl.pathname;
  destino.search = requestUrl.search;
  return destino;
}

export function cabecerasCoexistence(headers: Headers, proxySecret: string): Headers {
  const limpias = new Headers();
  for (const [nombre, valor] of headers.entries()) {
    const clave = nombre.toLowerCase();
    if (
      HOP_BY_HOP.has(clave) ||
      clave === "authorization" ||
      clave === COEXISTENCE_PROXY_HEADER ||
      clave.startsWith("cf-access-")
    ) {
      continue;
    }
    limpias.append(nombre, valor);
  }
  // Un valor aportado por el navegador jamás sobrevive: se establece después
  // de filtrar, exclusivamente con la variable server-side de Vercel.
  limpias.set(COEXISTENCE_PROXY_HEADER, proxySecret);
  return limpias;
}

export const NO_STORE_HEADERS = Object.freeze({
  "Cache-Control": "no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
});
