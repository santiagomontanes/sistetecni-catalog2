/** Limita bytes leídos incluso si Transfer-Encoding es chunked o no hay Content-Length. */
export async function boundedFormData(request: Request, maximum = 5_300_000): Promise<FormData> {
  if (Number(request.headers.get("content-length") ?? 0) > maximum || !request.body) throw new Error("upload_too_large");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new Error("upload_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new Response(bytes, {headers: {"Content-Type": request.headers.get("content-type") ?? ""}}).formData();
}
