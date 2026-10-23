import { NextResponse } from "next/server";
import { requireErpPermission } from "@/lib/erpAuth/auth";
import { parseShippingCommand } from "@/lib/shipping/contracts";
import { executeShipping, shippingEnabled, shippingErrorMessage, shippingPermission } from "@/lib/shipping/service";
import { readShippingBody, ShippingBodyTooLarge } from "@/lib/shipping/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!shippingEnabled()) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers });
  try {
    const raw = await readShippingBody(request);
    const command = parseShippingCommand(JSON.parse(raw));
    const { client } = await requireErpPermission(request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""), shippingPermission(command.action));
    return NextResponse.json({ ok: true, data: await executeShipping(client, command) }, { headers });
  } catch (error) {
    if (error instanceof ShippingBodyTooLarge) return NextResponse.json({ error: "TOO_LARGE" }, { status: 413, headers });
    const forbidden = error instanceof Error && ["AdminAuthError", "FORBIDDEN"].includes(error.name === "AdminAuthError" ? error.name : error.message);
    return NextResponse.json({ ok: false, error: shippingErrorMessage(error) }, { status: forbidden ? 403 : 409, headers });
  }
}
