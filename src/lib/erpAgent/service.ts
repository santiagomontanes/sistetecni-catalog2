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

/** Nombres humanos de `product_units.status` — para resúmenes de confirmación legibles. */
const ETIQUETA_ESTADO_UNIDAD: Record<string, string> = {
  received: "recibido", inspection: "revisión", available: "disponible",
  reserved: "reservado", sold: "vendido", warranty: "garantía",
  repair: "reparación", returned: "devuelto", retired: "retirado",
};

/**
 * P20.18: resumen humano de la operación, para el mensaje de CONFIRMAR. Antes
 * de esta fase, acciones sin `case` explícito (`inventory.receive_units`,
 * `inventory.transition_units`) caían al `default` y mostraban literalmente
 * el nombre técnico de la acción ("inventory.receive_units") — la propia
 * fase lo señaló como el "ejemplo malo" a corregir (§26 del encargo).
 * Async porque `receive_units` necesita el TÍTULO real del producto (solo
 * tiene su `productId`) — una consulta de lectura mínima y ya autorizada
 * por el mismo `client` admin que el resto de este archivo usa.
 */
async function confirmationSummary(
  command: ErpAgentCommand,
  client: ReturnType<typeof getAdminClient>
): Promise<string> {
  const a = command.arguments;
  const text = (key: string) => (typeof a[key] === "string" ? String(a[key]) : "");
  const money = (key: string) => {
    const value = Number(a[key]);
    return Number.isFinite(value) ? new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value) : "";
  };
  const productTitle = async (): Promise<string> => {
    const productId = text("productId");
    if (!productId) return "";
    const { data } = await client.from("products").select("title").eq("id", productId).maybeSingle();
    return typeof data?.title === "string" ? data.title : "";
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

    case "inventory.receive_units": {
      const quantity = Number(a.quantity);
      const unidades = Number.isInteger(quantity) && quantity > 0
        ? `${quantity} ${quantity === 1 ? "unidad" : "unidades"}`
        : "unidades";
      const productId = text("productId");
      let nombre = "";
      if (productId) {
        const { data } = await client.from("products").select("title").eq("id", productId).maybeSingle();
        nombre = typeof data?.title === "string" ? data.title : "";
      }
      const notas = text("notes");
      return [`Recibir ${unidades}${nombre ? ` de ${nombre}` : ""}`, notas ? `Nota: ${notas}` : null]
        .filter(Boolean)
        .join(" · ");
    }

    case "inventory.transition_units": {
      const unitCodes = Array.isArray(a.unitCodes)
        ? a.unitCodes.filter((x): x is string => typeof x === "string")
        : [];
      const destino = ETIQUETA_ESTADO_UNIDAD[text("toStatus")] ?? text("toStatus");
      const resumenUnidades =
        unitCodes.length === 0 ? "unidades"
        : unitCodes.length <= 3 ? unitCodes.join(", ")
        : `${unitCodes[0]} al ${unitCodes[unitCodes.length - 1]} (${unitCodes.length} unidades)`;
      const razon = text("reason");
      return [`Pasar ${resumenUnidades} a ${destino}`, razon ? `Motivo: ${razon}` : null]
        .filter(Boolean)
        .join(" · ");
    }

    case "catalog.media.add": {
      const n = Number.isInteger(a.mediaCount) ? Number(a.mediaCount) : 0;
      const nombre = await productTitle();
      return `Agregar ${n} foto${n === 1 ? "" : "s"} a la galería de${nombre ? ` ${nombre}` : "l producto"}`;
    }
    case "catalog.media.replace": {
      const n = Number.isInteger(a.mediaCount) ? Number(a.mediaCount) : 0;
      const nombre = await productTitle();
      return `Reemplazar TODAS las fotos actuales de${nombre ? ` ${nombre}` : "l producto"} por ${n} foto${n === 1 ? "" : "s"} nueva${n === 1 ? "" : "s"}`;
    }
    case "catalog.media.remove_all": {
      const nombre = await productTitle();
      return `Eliminar TODAS las fotos de${nombre ? ` ${nombre}` : "l producto"}`;
    }
    case "catalog.media.remove": {
      const nombre = await productTitle();
      return `Quitar una foto de${nombre ? ` ${nombre}` : "l producto"}`;
    }
    case "catalog.media.set_primary": {
      const nombre = await productTitle();
      return `Poner una foto como principal de${nombre ? ` ${nombre}` : "l producto"}`;
    }
    case "inventory.unit_media.add": {
      const n = Number.isInteger(a.mediaCount) ? Number(a.mediaCount) : 0;
      return `Agregar ${n} foto${n === 1 ? "" : "s"} a la unidad ${text("unitCode")}`;
    }
    case "inventory.unit_media.replace": {
      const n = Number.isInteger(a.mediaCount) ? Number(a.mediaCount) : 0;
      return `Reemplazar las fotos de la unidad ${text("unitCode")} por ${n} foto${n === 1 ? "" : "s"} nueva${n === 1 ? "" : "s"}`;
    }

    case "catalog.publish_draft": {
      const quantity = Number(a.quantity);
      const unidades = Number.isInteger(quantity) && quantity > 0
        ? `${quantity} ${quantity === 1 ? "unidad" : "unidades"}`
        : "unidades";

      const producto = [text("brand"), text("model")]
        .filter(Boolean)
        .join(" ")
        .trim();

      return producto
        ? `Publicar ${producto} · ${unidades}`
        : `Publicar borrador de producto existente · ${unidades}`;
    }

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
      confirmationSummary: await confirmationSummary(command, client),
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
