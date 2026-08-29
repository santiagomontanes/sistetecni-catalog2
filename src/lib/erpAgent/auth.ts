if (typeof window !== "undefined") {
  throw new Error("src/lib/erpAgent/auth.ts es server-only.");
}

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type ErpAgentEnv = Record<string, string | undefined>;

export class ErpAgentAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErpAgentAuthError";
  }
}

export function erpAgentControlEnabled(env: ErpAgentEnv = process.env): boolean {
  return env.ERP_AGENT_CONTROL_ENABLED === "true";
}

export interface ErpAgentControlConfig {
  sharedSecret: string;
  maxClockSkewSeconds: number;
}

export function erpAgentControlConfig(env: ErpAgentEnv = process.env): ErpAgentControlConfig {
  const sharedSecret = env.ERP_AGENT_SHARED_SECRET ?? "";
  if (sharedSecret.length < 32) {
    throw new ErpAgentAuthError("ERP_AGENT_SHARED_SECRET debe tener al menos 32 caracteres.");
  }
  const parsed = Number(env.ERP_AGENT_MAX_CLOCK_SKEW_SECONDS ?? "300");
  if (!Number.isInteger(parsed) || parsed < 30 || parsed > 1800) {
    throw new ErpAgentAuthError("ERP_AGENT_MAX_CLOCK_SKEW_SECONDS debe estar entre 30 y 1800.");
  }
  return { sharedSecret, maxClockSkewSeconds: parsed };
}

export function normalizeWaId(value: string): string {
  const normalized = value.replace(/\D/g, "");
  if (normalized.length < 8 || normalized.length > 20) {
    throw new ErpAgentAuthError("wa_id inválido.");
  }
  return normalized;
}

export function hashWaId(value: string): string {
  return createHash("sha256").update(normalizeWaId(value), "utf8").digest("hex");
}

export function signErpAgentRequest(rawBody: string, timestamp: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex")}`;
}

function safeEqualText(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyErpAgentRequest(params: {
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  config: ErpAgentControlConfig;
  nowMs?: number;
}): boolean {
  const { rawBody, timestampHeader, signatureHeader, config, nowMs = Date.now() } = params;
  if (!timestampHeader || !signatureHeader || !/^\d{10}$/.test(timestampHeader)) return false;
  const timestampSeconds = Number(timestampHeader);
  if (!Number.isSafeInteger(timestampSeconds)) return false;
  const deltaSeconds = Math.abs(Math.floor(nowMs / 1000) - timestampSeconds);
  if (deltaSeconds > config.maxClockSkewSeconds) return false;
  const expected = signErpAgentRequest(rawBody, timestampHeader, config.sharedSecret);
  return safeEqualText(expected, signatureHeader);
}

export function confirmationCodeForRequest(requestId: string, secret: string): string {
  const hex = createHmac("sha256", secret).update(`erp-confirm:${requestId}`, "utf8").digest("hex");
  const numeric = Number(BigInt(`0x${hex.slice(0, 12)}`) % 1_000_000n);
  return String(numeric).padStart(6, "0");
}

export function hashConfirmationCode(requestId: string, code: string): string {
  return createHash("sha256").update(`${requestId}:${code}`, "utf8").digest("hex");
}
