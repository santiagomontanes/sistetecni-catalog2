import { test } from "node:test";
import assert from "node:assert/strict";
import {
  confirmationCodeForRequest,
  hashConfirmationCode,
  hashWaId,
  signErpAgentRequest,
  verifyErpAgentRequest,
} from "./auth";
import { ErpAgentRequestSchema } from "./contracts";

const SECRET = "0123456789abcdef0123456789abcdef";

test("erp agent: acepta una firma HMAC válida dentro de la ventana", () => {
  const rawBody = JSON.stringify({ hello: "world" });
  const timestamp = "1788029000";
  const signature = signErpAgentRequest(rawBody, timestamp, SECRET);
  assert.equal(
    verifyErpAgentRequest({
      rawBody,
      timestampHeader: timestamp,
      signatureHeader: signature,
      config: { sharedSecret: SECRET, maxClockSkewSeconds: 300 },
      nowMs: Number(timestamp) * 1000 + 120_000,
    }),
    true
  );
});

test("erp agent: rechaza cuerpo alterado, firma alterada y timestamp viejo", () => {
  const rawBody = JSON.stringify({ hello: "world" });
  const timestamp = "1788029000";
  const signature = signErpAgentRequest(rawBody, timestamp, SECRET);
  const config = { sharedSecret: SECRET, maxClockSkewSeconds: 300 };

  assert.equal(verifyErpAgentRequest({ rawBody: `${rawBody}x`, timestampHeader: timestamp, signatureHeader: signature, config, nowMs: Number(timestamp) * 1000 }), false);
  assert.equal(verifyErpAgentRequest({ rawBody, timestampHeader: timestamp, signatureHeader: `${signature.slice(0, -1)}0`, config, nowMs: Number(timestamp) * 1000 }), false);
  assert.equal(verifyErpAgentRequest({ rawBody, timestampHeader: timestamp, signatureHeader: signature, config, nowMs: (Number(timestamp) + 301) * 1000 }), false);
});

test("erp agent: el wa_id se normaliza y solo se persiste como SHA-256", () => {
  assert.equal(hashWaId("+57 300 123 4567"), hashWaId("573001234567"));
  assert.match(hashWaId("573001234567"), /^[0-9a-f]{64}$/);
});

test("erp agent: código de confirmación es determinista, 6 dígitos y su hash no lo revela", () => {
  const requestId = "11111111-1111-4111-8111-111111111111";
  const one = confirmationCodeForRequest(requestId, SECRET);
  const two = confirmationCodeForRequest(requestId, SECRET);
  assert.equal(one, two);
  assert.match(one, /^\d{6}$/);
  const hash = hashConfirmationCode(requestId, one);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.includes(one), false);
});

test("erp agent: contrato rechaza acciones inventadas y confirmaciones no numéricas", () => {
  const base = { waId: "573001234567", metaMessageId: "wamid.ABCDEFGHIJ", requestId: "11111111-1111-4111-8111-111111111111" };
  assert.equal(ErpAgentRequestSchema.safeParse({ ...base, kind: "command", action: "sql.execute", arguments: {} }).success, false);
  assert.equal(ErpAgentRequestSchema.safeParse({ ...base, kind: "confirm", confirmationCode: "ABC123" }).success, false);
  assert.equal(ErpAgentRequestSchema.safeParse({ ...base, kind: "command", action: "inventory.summary", arguments: {} }).success, true);
});
