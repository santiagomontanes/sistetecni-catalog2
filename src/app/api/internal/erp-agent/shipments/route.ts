import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmationCodeForRequest, erpAgentControlConfig, erpAgentControlEnabled, hashConfirmationCode, hashWaId, verifyErpAgentRequest } from "@/lib/erpAgent/auth";
import { parseShippingCommand } from "@/lib/shipping/contracts";
import { shippingEnabled } from "@/lib/shipping/service";
import { getAdminClient } from "@/supabase/admin";
import { readShippingBody, ShippingBodyTooLarge } from "@/lib/shipping/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const common = { waId: z.string().min(8).max(30), requestId: z.string().uuid() };
const schema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("command"), metaMessageId: z.string().min(1).max(200), action: z.enum(["create", "list", "detail", "sales","references","guide", "dispatch", "deliver", "pending_collections"]), arguments: z.record(z.unknown()).default({}) }).strict(),
  z.object({ ...common, kind: z.literal("confirm"), confirmationCode: z.string().regex(/^\d{6}$/) }).strict(),
  z.object({...common,kind:z.literal("cancel")}).strict(),
]);

export async function POST(request: Request) {
  if (!shippingEnabled() || !erpAgentControlEnabled()) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers });
  try {
    const rawBody = await readShippingBody(request);
    const config = erpAgentControlConfig();
    if (!verifyErpAgentRequest({ rawBody, timestampHeader: request.headers.get("x-erp-agent-timestamp"), signatureHeader: request.headers.get("x-erp-agent-signature"), config })) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
    }
    const body = schema.parse(JSON.parse(rawBody));
    const client = getAdminClient();
    let data: Record<string, unknown>;
    if (body.kind === "confirm"||body.kind==="cancel") {
      const original=await client.from("whatsapp_erp_requests").select("action").eq("request_id",body.requestId).maybeSingle();
      if(original.error||!original.data?.action.startsWith("shipping."))throw new Error("AGENT_ERROR");
      if(body.kind==="cancel"){
        const response=await client.rpc("erp_agent_cancel_request",{p_wa_id_hash:hashWaId(body.waId),p_request_id:body.requestId});
        if(response.error)throw new Error(response.error.code==="42501"?"FORBIDDEN":"AGENT_ERROR");
        data=response.data as Record<string,unknown>;
      }else{
      const response = await client.rpc("erp_agent_confirm_request", { p_wa_id_hash: hashWaId(body.waId), p_request_id: body.requestId, p_confirmation_hash: hashConfirmationCode(body.requestId, body.confirmationCode) });
      if (response.error) throw new Error(response.error.code === "42501" ? "FORBIDDEN" : "AGENT_ERROR");
      data = response.data as Record<string, unknown>;
      }
    } else {
      const command = parseShippingCommand({ action: body.action, arguments: body.arguments, requestId: body.requestId });
      const code = confirmationCodeForRequest(body.requestId, config.sharedSecret);
      const response = await client.rpc("erp_shipping_agent_submit", { p_wa_id_hash: hashWaId(body.waId), p_meta_message_id: body.metaMessageId, p_request_id: body.requestId, p_action: `shipping.${body.action}`, p_arguments: command.arguments, p_confirmation_hash: hashConfirmationCode(body.requestId, code) });
      if (response.error) throw new Error(response.error.code === "42501" ? "FORBIDDEN" : "AGENT_ERROR");
      data = response.data as Record<string, unknown>;
      if (data.status === "pending_confirmation") {
        data.confirmationCode = confirmationCodeForRequest(String(data.requestId), config.sharedSecret);
        data.confirmationSummary = `Confirma la operación de envío: ${body.action}. Revisa destinatario, guía e importes antes de confirmar.`;
      }
    }
    return NextResponse.json({ ok: ["executed", "pending_confirmation","cancelled"].includes(String(data.status)), ...data }, { headers });
  } catch (error) {
    if (error instanceof ShippingBodyTooLarge) return NextResponse.json({ error: "TOO_LARGE" }, { status: 413, headers });
    const forbidden = error instanceof Error && error.message === "FORBIDDEN";
    return NextResponse.json({ error: forbidden ? "FORBIDDEN" : "INVALID_OR_FAILED_REQUEST" }, { status: forbidden ? 403 : 400, headers });
  }
}
