"use server";
import { requireErpPermission } from "@/lib/erpAuth/auth";
import { parseShippingCommand } from "@/lib/shipping/contracts";
import { executeShipping, shippingEnabled, shippingErrorMessage, shippingPermission } from "@/lib/shipping/service";

export async function shippingAction(payload: { accessToken: unknown; command: unknown }): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  if (!shippingEnabled()) return { ok: false, error: "Envíos está desactivado. Configura ERP_SHIPPING_ENABLED=true para preparar su activación." };
  try {
    const command = parseShippingCommand(payload.command);
    const { client } = await requireErpPermission(payload.accessToken, shippingPermission(command.action));
    return { ok: true, data: await executeShipping(client, command) };
  } catch (error) { return { ok: false, error: shippingErrorMessage(error) }; }
}
