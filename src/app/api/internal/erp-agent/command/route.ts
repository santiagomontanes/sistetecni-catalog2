import { NextResponse } from "next/server";
import {
  erpAgentControlConfig,
  erpAgentControlEnabled,
  verifyErpAgentRequest,
} from "@/lib/erpAgent/auth";
import { ErpAgentRequestSchema } from "@/lib/erpAgent/contracts";
import { executeErpAgentRequest } from "@/lib/erpAgent/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0, must-revalidate" } as const;

export async function POST(request: Request): Promise<NextResponse> {
  if (!erpAgentControlEnabled()) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers: NO_STORE });
  }

  const startedAt = Date.now();
  const rawBody = await request.text();

  let config;
  try {
    config = erpAgentControlConfig();
  } catch (error) {
    console.error(`[erp-agent] config error=${error instanceof Error ? error.name : "UnknownError"}`);
    return NextResponse.json({ error: "CONFIG_INVALID" }, { status: 500, headers: NO_STORE });
  }

  const timestamp = request.headers.get("x-erp-agent-timestamp");
  const signature = request.headers.get("x-erp-agent-signature");
  if (!verifyErpAgentRequest({ rawBody, timestampHeader: timestamp, signatureHeader: signature, config })) {
    console.warn(`[erp-agent] signature_invalid ms=${Date.now() - startedAt}`);
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: NO_STORE });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: NO_STORE });
  }

  const parsed = ErpAgentRequestSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) },
      { status: 400, headers: NO_STORE }
    );
  }

  try {
    const result = await executeErpAgentRequest(parsed.data);
    const action = parsed.data.kind === "command" ? parsed.data.action : parsed.data.kind;
    console.info(`[erp-agent] kind=${parsed.data.kind} action=${action} status=${result.status ?? "unknown"} request=${parsed.data.requestId.slice(0, 8)} ms=${Date.now() - startedAt}`);
    return NextResponse.json(result, { status: result.ok ? 200 : 409, headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const forbidden = message.includes("42501") || message.includes("permission") || message.includes("operator_not_authorized");
    console.error(`[erp-agent] failed kind=${parsed.data.kind} request=${parsed.data.requestId.slice(0, 8)} code=${message.split(":")[0]} ms=${Date.now() - startedAt}`);
    return NextResponse.json({ error: forbidden ? "FORBIDDEN" : "ERP_AGENT_ERROR" }, { status: forbidden ? 403 : 500, headers: NO_STORE });
  }
}
