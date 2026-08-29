import { NextResponse } from "next/server";
import { whatsappWebhookConfig, whatsappWebhookEnabled } from "@/lib/whatsappCloud/env";
import { verifyMetaSignature, verifyWebhookToken } from "@/lib/whatsappCloud/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0, must-revalidate" } as const;

export async function GET(request: Request): Promise<NextResponse> {
  if (!whatsappWebhookEnabled()) return new NextResponse("no encontrado", { status: 404, headers: NO_STORE });

  let config;
  try {
    config = whatsappWebhookConfig();
  } catch (error) {
    console.error(`[whatsapp/webhook] config error=${error instanceof Error ? error.name : "UnknownError"}`);
    return new NextResponse("configuracion invalida", { status: 500, headers: NO_STORE });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !challenge || !verifyWebhookToken(token, config.verifyToken)) {
    return new NextResponse("forbidden", { status: 403, headers: NO_STORE });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!whatsappWebhookEnabled()) return new NextResponse("no encontrado", { status: 404, headers: NO_STORE });

  const startedAt = Date.now();
  let config;
  try {
    config = whatsappWebhookConfig();
  } catch (error) {
    console.error(`[whatsapp/webhook] config error=${error instanceof Error ? error.name : "UnknownError"}`);
    return new NextResponse("configuracion invalida", { status: 500, headers: NO_STORE });
  }

  const rawBody = new Uint8Array(await request.arrayBuffer());
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyMetaSignature(rawBody, signature, config.appSecret)) {
    console.warn(`[whatsapp/webhook] signature_invalid ms=${Date.now() - startedAt}`);
    return new NextResponse("unauthorized", { status: 401, headers: NO_STORE });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(rawBody).toString("utf8"));
  } catch {
    return new NextResponse("invalid json", { status: 400, headers: NO_STORE });
  }

  // 3A.1 solo valida el borde. No se registran cuerpos ni datos de clientes y
  // no se procesa todavía ningún evento real hasta que 3A.2 añada el ledger
  // idempotente. En STAGING este endpoint se prueba con payloads sintéticos.
  const objectName =
    typeof payload === "object" && payload !== null && "object" in payload && typeof (payload as { object?: unknown }).object === "string"
      ? (payload as { object: string }).object
      : "unknown";
  const entryCount =
    typeof payload === "object" && payload !== null && "entry" in payload && Array.isArray((payload as { entry?: unknown }).entry)
      ? (payload as { entry: unknown[] }).entry.length
      : 0;

  console.info(`[whatsapp/webhook] accepted object=${objectName} entries=${entryCount} ms=${Date.now() - startedAt}`);
  return new NextResponse("EVENT_RECEIVED", { status: 200, headers: NO_STORE });
}
