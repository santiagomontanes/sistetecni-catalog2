if (typeof window !== "undefined") {
  throw new Error("src/lib/erpAgent/service.ts es server-only.");
}

import { getAdminClient } from "@/supabase/admin";
import type { ErpAgentCommand, ErpAgentRequest } from "./contracts";
import {
  confirmationCodeForRequest,
  erpAgentControlConfig,
  hashConfirmationCode,
  hashWaId,
} from "./auth";

export interface ErpAgentRpcResult {
  status: string;
  requestId?: string;
  riskLevel?: string;
  expiresAt?: string;
  result?: Record<string, unknown>;
  errorCode?: string;
  operator?: string | null;
  role?: string;
  duplicate?: boolean;
}

function asRpcResult(value: unknown): ErpAgentRpcResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ERP_AGENT_RPC_INVALID_RESULT");
  }
  return value as ErpAgentRpcResult;
}

function confirmationSummary(command: ErpAgentCommand): string {
  const a = command.arguments;
  const text = (key: string) => (typeof a[key] === "string" ? String(a[key]) : "");
  const money = (key: string) => {
    const value = Number(a[key]);
    return Number.isFinite(value) ? new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value) : "";
  };

  switch (command.action) {
    case "inventory.reserve":
      return `Reservar ${text("unitCode")} para ${text("customerName")}`.trim();
    case "inventory.release":
      return `Liberar reserva de ${text("unitCode")}`.trim();
    case "customer.create":
      return `Crear cliente ${text("fullName")}`.trim();
    case "expense.create":
      return `Registrar gasto ${money("amountCop")} · ${text("description")}`.trim();
    case "cash.open":
      return `Abrir caja con ${money("openingCashCop")}`.trim();
    case "cash.close":
      return `Cerrar caja con conteo ${money("countedCashCop")}`.trim();
    case "cash.movement":
      return `Registrar movimiento ${text("movementType")} por ${money("amountCop")}`.trim();
    case "sale.create_by_stu":
      return `Vender ${text("unitCode")} a ${text("customerName")}${a.unitPriceCop ? ` por ${money("unitPriceCop")}` : " al precio ERP"}`.trim();
    default:
      return command.action;
  }
}

async function submitCommand(command: ErpAgentCommand, sharedSecret: string) {
  const confirmationCode = confirmationCodeForRequest(command.requestId, sharedSecret);
  const confirmationHash = hashConfirmationCode(command.requestId, confirmationCode);
  const client = getAdminClient();
  const { data, error } = await client.rpc("erp_agent_submit_request", {
    p_wa_id_hash: hashWaId(command.waId),
    p_meta_message_id: command.metaMessageId,
    p_request_id: command.requestId,
    p_action: command.action,
    p_arguments: command.arguments,
    p_confirmation_hash: confirmationHash,
  });
  if (error) throw new Error(`ERP_AGENT_SUBMIT_FAILED:${error.code ?? "unknown"}`);
  const result = asRpcResult(data);

  if (result.status === "pending_confirmation") {
    return {
      ok: true as const,
      ...result,
      confirmationCode,
      confirmationSummary: confirmationSummary(command),
    };
  }
  return { ok: result.status === "executed", ...result };
}

async function confirmRequest(request: Extract<ErpAgentRequest, { kind: "confirm" }>) {
  const client = getAdminClient();
  const { data, error } = await client.rpc("erp_agent_confirm_request", {
    p_wa_id_hash: hashWaId(request.waId),
    p_request_id: request.requestId,
    p_confirmation_hash: hashConfirmationCode(request.requestId, request.confirmationCode),
  });
  if (error) throw new Error(`ERP_AGENT_CONFIRM_FAILED:${error.code ?? "unknown"}`);
  const result = asRpcResult(data);
  return { ok: result.status === "executed", ...result };
}

async function cancelRequest(request: Extract<ErpAgentRequest, { kind: "cancel" }>) {
  const client = getAdminClient();
  const { data, error } = await client.rpc("erp_agent_cancel_request", {
    p_wa_id_hash: hashWaId(request.waId),
    p_request_id: request.requestId,
  });
  if (error) throw new Error(`ERP_AGENT_CANCEL_FAILED:${error.code ?? "unknown"}`);
  const result = asRpcResult(data);
  return { ok: result.status === "cancelled", ...result };
}

export async function executeErpAgentRequest(request: ErpAgentRequest) {
  const config = erpAgentControlConfig();
  if (request.kind === "command") return submitCommand(request, config.sharedSecret);
  if (request.kind === "confirm") return confirmRequest(request);
  return cancelRequest(request);
}
