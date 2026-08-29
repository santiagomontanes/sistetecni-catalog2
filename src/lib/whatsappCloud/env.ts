if (typeof window !== "undefined") {
  throw new Error("src/lib/whatsappCloud/env.ts es server-only y no puede importarse en el navegador.");
}

export type WhatsAppEnv = Record<string, string | undefined>;

export class WhatsAppConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppConfigError";
  }
}

function requireEnv(name: string, env: WhatsAppEnv): string {
  const value = env[name];
  if (!value) throw new WhatsAppConfigError(`Falta la variable de entorno \"${name}\".`);
  return value;
}

export function whatsappWebhookEnabled(env: WhatsAppEnv = process.env): boolean {
  return env.WHATSAPP_WEBHOOK_ENABLED === "true";
}

export interface WhatsAppWebhookConfig {
  verifyToken: string;
  appSecret: string;
}

export function whatsappWebhookConfig(env: WhatsAppEnv = process.env): WhatsAppWebhookConfig {
  return {
    verifyToken: requireEnv("WHATSAPP_VERIFY_TOKEN", env),
    appSecret: requireEnv("META_APP_SECRET", env),
  };
}

export interface WhatsAppSendConfig {
  accessToken: string;
  phoneNumberId: string;
  wabaId: string;
  graphVersion: string;
}

/**
 * Se mantiene separado del config del webhook: recibir/verificar eventos no debe
 * exigir todavía el token de envío. 3A.4 será el primer consumidor de esto.
 */
export function whatsappSendConfig(env: WhatsAppEnv = process.env): WhatsAppSendConfig {
  const graphVersion = env.META_GRAPH_API_VERSION ?? "v25.0";
  if (!/^v\d+\.\d+$/.test(graphVersion)) {
    throw new WhatsAppConfigError('META_GRAPH_API_VERSION debe tener la forma "vNN.N".');
  }
  return {
    accessToken: requireEnv("WHATSAPP_ACCESS_TOKEN", env),
    phoneNumberId: requireEnv("WHATSAPP_PHONE_NUMBER_ID", env),
    wabaId: requireEnv("WHATSAPP_WABA_ID", env),
    graphVersion,
  };
}
