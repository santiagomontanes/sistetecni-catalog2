import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { whatsappSendConfig, whatsappWebhookConfig, whatsappWebhookEnabled } from "./env";
import { verifyMetaSignature, verifyWebhookToken } from "./signature";

test("kill switch del webhook solo acepta la cadena exacta true", () => {
  assert.equal(whatsappWebhookEnabled({ WHATSAPP_WEBHOOK_ENABLED: "true" }), true);
  assert.equal(whatsappWebhookEnabled({ WHATSAPP_WEBHOOK_ENABLED: "TRUE" }), false);
  assert.equal(whatsappWebhookEnabled({ WHATSAPP_WEBHOOK_ENABLED: "1" }), false);
  assert.equal(whatsappWebhookEnabled({}), false);
});

test("config webhook exige verify token y App Secret sin exponer valores", () => {
  const config = whatsappWebhookConfig({ WHATSAPP_VERIFY_TOKEN: "verify-secret", META_APP_SECRET: "app-secret" });
  assert.equal(config.verifyToken, "verify-secret");
  assert.equal(config.appSecret, "app-secret");
  assert.throws(() => whatsappWebhookConfig({ META_APP_SECRET: "app-secret" }), /WHATSAPP_VERIFY_TOKEN/);
});

test("config de envío queda separada del webhook", () => {
  const config = whatsappSendConfig({
    WHATSAPP_ACCESS_TOKEN: "token",
    WHATSAPP_PHONE_NUMBER_ID: "123",
    WHATSAPP_WABA_ID: "456",
    META_GRAPH_API_VERSION: "v25.0",
  });
  assert.deepEqual(config, { accessToken: "token", phoneNumberId: "123", wabaId: "456", graphVersion: "v25.0" });
});

test("verify token usa comparación exacta", () => {
  assert.equal(verifyWebhookToken("abc", "abc"), true);
  assert.equal(verifyWebhookToken("ABC", "abc"), false);
  assert.equal(verifyWebhookToken(null, "abc"), false);
});

test("firma x-hub-signature-256 válida acepta exactamente el cuerpo RAW", () => {
  const body = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
  const secret = "app-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(verifyMetaSignature(body, signature, secret), true);
  assert.equal(verifyMetaSignature(Buffer.from('{"entry":[],"object":"whatsapp_business_account"}'), signature, secret), false);
});

test("firma ausente, malformada o con secreto incorrecto se rechaza", () => {
  const body = Buffer.from("{}");
  const good = `sha256=${createHmac("sha256", "right").update(body).digest("hex")}`;
  assert.equal(verifyMetaSignature(body, null, "right"), false);
  assert.equal(verifyMetaSignature(body, "sha1=abc", "right"), false);
  assert.equal(verifyMetaSignature(body, "sha256=xyz", "right"), false);
  assert.equal(verifyMetaSignature(body, good, "wrong"), false);
});
