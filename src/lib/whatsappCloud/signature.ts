import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqualText(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyWebhookToken(received: string | null, expected: string): boolean {
  return typeof received === "string" && safeEqualText(received, expected);
}

/**
 * Meta firma el cuerpo RAW. Nunca verificar sobre JSON.parse/stringify porque
 * cambiar espacios/orden alteraría el HMAC.
 */
export function verifyMetaSignature(rawBody: Uint8Array, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const providedHex = signatureHeader.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(providedHex)) return false;

  const expectedHex = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const expected = Buffer.from(expectedHex, "hex");
  const provided = Buffer.from(providedHex, "hex");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
