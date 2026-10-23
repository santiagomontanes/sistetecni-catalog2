import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminClient } from "@/supabase/admin";
import { shippingEnabled } from "@/lib/shipping/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Cron prepara outbox únicamente: nunca envía WhatsApp, factura ni marca entregas. */
export async function POST(request: Request) {
  const expected = process.env.ERP_SHIPPING_CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!shippingEnabled() || !expected || expected.length < 32) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 404 });
  if (Buffer.byteLength(expected) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { data, error } = await getAdminClient().rpc("erp_shipping_prepare_jobs");
  if(error)return NextResponse.json({error:"PREPARE_FAILED"},{status:500});
  const notices=await getAdminClient().rpc("erp_shipping_publish_notifications");
  return NextResponse.json(notices.error?{error:"PUBLISH_FAILED"}:{prepared:data,notificationsCreated:notices.data,messagesSent:0},{status:notices.error?500:200,headers:{"Cache-Control":"no-store"}});
}
