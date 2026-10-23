export class ShippingBodyTooLarge extends Error {}

/** Limita bytes mientras lee, incluso sin Content-Length o con transferencia chunked. */
export async function readShippingBody(request: Request, maxBytes = 32_768): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new ShippingBodyTooLarge();
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, value = "";
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new ShippingBodyTooLarge(); }
      value += decoder.decode(part.value, { stream: true });
    }
    return value + decoder.decode();
  } finally { reader.releaseLock(); }
}
