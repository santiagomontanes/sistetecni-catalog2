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



test("erp agent: contrato HTTP acepta inventory.find_products (P20.17-bis, corrección)", () => {
  const parsed = ErpAgentRequestSchema.safeParse({
    waId: "573001234567",
    metaMessageId: "wamid.P2017BISFINDPRODUCTS",
    requestId: "22222222-2222-4222-8222-222222222222",
    kind: "command",
    action: "inventory.find_products",
    arguments: { query: "Lenovo T480" },
  });
  assert.equal(parsed.success, true);
});

test("erp agent: contrato HTTP acepta catalog.publish_draft P20.17C", () => {
  const parsed = ErpAgentRequestSchema.safeParse({
    waId: "573001234567",
    metaMessageId: "wamid.P2017CPUBLISH",
    requestId: "33333333-3333-4333-8333-333333333333",
    kind: "command",
    action: "catalog.publish_draft",
    arguments: {
      draftId: "draft_p20_17c_test",
      brand: "Acer",
      model: "P20",
      ramGb: 8,
      storageGb: 500,
      priceCop: 465000,
      quantity: 2,
    },
  });

  assert.equal(parsed.success, true);
});

test("erp agent: contrato HTTP acepta acciones P20.17B", () => {
  const base = {
    waId: "573001234567",
    metaMessageId: "wamid.P2017BHTTPTEST",
    requestId: "22222222-2222-4222-8222-222222222222",
    kind: "command" as const,
    arguments: {},
  };

  const actions = [
    "inventory.sequence_status",
    "inventory.resolve_unit",
    "inventory.receive_units",
    "inventory.assign_manufacturer_serial",
    "inventory.correct_manufacturer_serial",
    "inventory.update_unit_condition",
  ];

  for (const action of actions) {
    assert.equal(
      ErpAgentRequestSchema.safeParse({ ...base, action }).success,
      true,
      `debe aceptar ${action}`
    );
  }
});

import {
  catalogMediaCanonical,
  normalizeCatalogMediaMetadata,
  sha256Buffer,
  verifyCatalogMediaSignature,
} from "./catalogMedia";

test("erp agent: metadata de media P20.17C se normaliza y firma", () => {
  const meta = normalizeCatalogMediaMetadata({
    draftId: "draft_1234567890abcdef",
    productId: "11111111-1111-4111-8111-111111111111",
    sha256: "a".repeat(64),
    mimeType: "image/jpeg",
    bytes: 12345,
  });

  assert.ok(meta);

  const timestamp = "1788029000";
  const signature = signErpAgentRequest(
    catalogMediaCanonical(meta),
    timestamp,
    SECRET
  );

  assert.equal(
    verifyCatalogMediaSignature({
      meta,
      timestamp,
      signature,
      nowMs: Number(timestamp) * 1000,
      config: {
        sharedSecret: SECRET,
        maxClockSkewSeconds: 300,
      },
    }),
    true
  );
});

test("erp agent: media P20.17C rechaza MIME, hash y tamaño inválidos", () => {
  const base = {
    draftId: "draft_1234567890abcdef",
    productId: "11111111-1111-4111-8111-111111111111",
    sha256: "b".repeat(64),
    mimeType: "image/png",
    bytes: 500,
  };

  assert.ok(normalizeCatalogMediaMetadata(base));

  assert.equal(
    normalizeCatalogMediaMetadata({
      ...base,
      mimeType: "image/svg+xml",
    }),
    null
  );

  assert.equal(
    normalizeCatalogMediaMetadata({
      ...base,
      sha256: "no-es-hash",
    }),
    null
  );

  assert.equal(
    normalizeCatalogMediaMetadata({
      ...base,
      bytes: 9 * 1024 * 1024,
    }),
    null
  );
});

test("erp agent: sha256Buffer calcula hash hexadecimal de 64 caracteres", () => {
  const hash = sha256Buffer(Buffer.from("p20.17c"));
  assert.match(hash, /^[0-9a-f]{64}$/);
});

import { normalizeCatalogFinalizeInput } from "./catalogFinalize";

test("erp agent: contrato de finalización P20.17C acepta producto + URLs", () => {
  const parsed = normalizeCatalogFinalizeInput({
    draftId: "draft_1234567890abcdef",
    productId: "11111111-1111-4111-8111-111111111111",
    imageUrls: [
      "https://example.supabase.co/storage/v1/object/public/products/a.jpg",
      "https://example.supabase.co/storage/v1/object/public/products/b.jpg",
    ],
  });

  assert.ok(parsed);
  assert.equal(parsed.imageUrls.length, 2);
});

test("erp agent: finalización P20.17C rechaza IDs y URLs inseguras", () => {
  assert.equal(
    normalizeCatalogFinalizeInput({
      draftId: "mal",
      productId: "11111111-1111-4111-8111-111111111111",
      imageUrls: [],
    }),
    null
  );

  assert.equal(
    normalizeCatalogFinalizeInput({
      draftId: "draft_1234567890abcdef",
      productId: "11111111-1111-4111-8111-111111111111",
      imageUrls: ["http://inseguro.test/foto.jpg"],
    }),
    null
  );
});

// ═══════════════════════════════════════════════════════════════════════
// P20.19 — fotos de un producto/unidad YA existente
// ═══════════════════════════════════════════════════════════════════════
import {
  normalizeProductMediaMetadata,
  productMediaCanonical,
  verifyProductMediaSignature,
} from "./catalogMedia";
import {
  normalizeProductMediaFinalizeInput,
} from "./productMediaFinalize";

test("erp agent: contrato HTTP acepta las 9 acciones de media P20.19/P20.19-bis", () => {
  const base = { waId: "573001234567", metaMessageId: "wamid.P2019MEDIA", requestId: "44444444-4444-4444-8444-444444444444" };
  for (const action of [
    "catalog.media.add", "catalog.media.replace", "catalog.media.remove_all", "catalog.media.remove",
    "catalog.media.set_primary", "catalog.media.list",
    "inventory.unit_media.add", "inventory.unit_media.replace", "inventory.unit_media.list",
  ]) {
    const parsed = ErpAgentRequestSchema.safeParse({ ...base, kind: "command", action, arguments: { productId: "11111111-1111-4111-8111-111111111111" } });
    assert.equal(parsed.success, true, action);
  }
});

test("P20.19: normalizeProductMediaMetadata acepta producto y, opcionalmente, unidad", () => {
  const meta = normalizeProductMediaMetadata({
    productId: "11111111-1111-4111-8111-111111111111",
    sha256: "a".repeat(64),
    mimeType: "image/jpeg",
    bytes: 12345,
  });
  assert.ok(meta);
  assert.equal(meta?.unitCode, undefined);

  const metaUnidad = normalizeProductMediaMetadata({
    productId: "11111111-1111-4111-8111-111111111111",
    unitCode: "stu-000060",
    sha256: "b".repeat(64),
    mimeType: "image/png",
    bytes: 500,
  });
  assert.equal(metaUnidad?.unitCode, "STU-000060");
});

test("P20.19: normalizeProductMediaMetadata rechaza MIME/hash/tamaño/unitCode inválidos", () => {
  const base = { productId: "11111111-1111-4111-8111-111111111111", sha256: "c".repeat(64), mimeType: "image/jpeg", bytes: 100 };
  assert.equal(normalizeProductMediaMetadata({ ...base, mimeType: "image/gif" }), null);
  assert.equal(normalizeProductMediaMetadata({ ...base, sha256: "no-es-hash" }), null);
  assert.equal(normalizeProductMediaMetadata({ ...base, bytes: 0 }), null);
  assert.equal(normalizeProductMediaMetadata({ ...base, bytes: 9 * 1024 * 1024 }), null);
  assert.equal(normalizeProductMediaMetadata({ ...base, unitCode: "ST-ABCDEF" }), null);
  assert.equal(normalizeProductMediaMetadata({ productId: "no-es-uuid", sha256: base.sha256, mimeType: base.mimeType, bytes: base.bytes }), null);
});

test("P20.19: la firma de media de producto se verifica igual que la de draft (canónico distinto)", () => {
  const meta = normalizeProductMediaMetadata({
    productId: "11111111-1111-4111-8111-111111111111",
    sha256: "d".repeat(64),
    mimeType: "image/webp",
    bytes: 999,
  })!;
  const timestamp = "1788029000";
  const signature = signErpAgentRequest(productMediaCanonical(meta), timestamp, SECRET);
  assert.equal(
    verifyProductMediaSignature({ meta, timestamp, signature, nowMs: Number(timestamp) * 1000, config: { sharedSecret: SECRET, maxClockSkewSeconds: 300 } }),
    true
  );
  // Un metadata distinto (otro producto) con la MISMA firma no cuela.
  const metaAlterado = { ...meta, productId: "22222222-2222-4222-8222-222222222222" };
  assert.equal(
    verifyProductMediaSignature({ meta: metaAlterado, timestamp, signature, nowMs: Number(timestamp) * 1000, config: { sharedSecret: SECRET, maxClockSkewSeconds: 300 } }),
    false
  );
});

test("P20.19: normalizeProductMediaFinalizeInput exige exactamente 1 URL para set_primary/remove y ninguna para remove_all", () => {
  const productId = "11111111-1111-4111-8111-111111111111";
  assert.equal(normalizeProductMediaFinalizeInput({ operation: "set_primary", productId, imageUrls: [] }), null);
  assert.equal(normalizeProductMediaFinalizeInput({ operation: "set_primary", productId, imageUrls: ["https://x.test/a.jpg", "https://x.test/b.jpg"] }), null);
  const ok = normalizeProductMediaFinalizeInput({ operation: "set_primary", productId, imageUrls: ["https://x.test/a.jpg"] });
  assert.ok(ok);

  assert.equal(normalizeProductMediaFinalizeInput({ operation: "remove", productId, imageUrls: [] }), null);
  assert.equal(normalizeProductMediaFinalizeInput({ operation: "remove", productId, imageUrls: ["https://x.test/a.jpg", "https://x.test/b.jpg"] }), null);
  const removeOk = normalizeProductMediaFinalizeInput({ operation: "remove", productId, imageUrls: ["https://x.test/a.jpg"] });
  assert.ok(removeOk);

  const remove = normalizeProductMediaFinalizeInput({ operation: "remove_all", productId, imageUrls: ["https://x.test/a.jpg"] });
  assert.deepEqual(remove?.imageUrls, []);
});

test("P20.19: normalizeProductMediaFinalizeInput rechaza operación desconocida y URLs inseguras", () => {
  const productId = "11111111-1111-4111-8111-111111111111";
  assert.equal(normalizeProductMediaFinalizeInput({ operation: "delete_everything", productId, imageUrls: [] }), null);
  assert.equal(normalizeProductMediaFinalizeInput({ operation: "add", productId, imageUrls: ["http://inseguro.test/a.jpg"] }), null);
  assert.equal(normalizeProductMediaFinalizeInput({ operation: "add", productId: "no-es-uuid", imageUrls: ["https://x.test/a.jpg"] }), null);
});

test("P20.19: normalizeProductMediaFinalizeInput acepta unitCode opcional y lo normaliza", () => {
  const parsed = normalizeProductMediaFinalizeInput({
    operation: "add",
    productId: "11111111-1111-4111-8111-111111111111",
    unitCode: "stu 60",
    imageUrls: ["https://x.test/a.jpg"],
  });
  assert.equal(parsed, null); // "stu 60" con espacio no es un STU-000060 válido — formato exacto exigido
  const parsedOk = normalizeProductMediaFinalizeInput({
    operation: "add",
    productId: "11111111-1111-4111-8111-111111111111",
    unitCode: "stu-000060",
    imageUrls: ["https://x.test/a.jpg"],
  });
  assert.equal(parsedOk?.unitCode, "STU-000060");
});

// ═══════════════════════════════════════════════════════════════════════
// P20.20A — ventas, comprobantes y clientes (todas de LECTURA)
// ═══════════════════════════════════════════════════════════════════════

test("erp agent: contrato HTTP acepta las 6 acciones de P20.20A", () => {
  const base = { waId: "573001234567", metaMessageId: "wamid.P2020A", requestId: "55555555-5555-4555-8555-555555555555" };
  for (const action of ["sales.list", "sales.find", "sales.detail", "sales.receipt", "customers.detail", "customers.history"]) {
    const parsed = ErpAgentRequestSchema.safeParse({ ...base, kind: "command", action, arguments: {} });
    assert.equal(parsed.success, true, action);
  }
});

// P20.20A.1 — `customers.list` faltaba en ERP_AGENT_ACTIONS: erp_agent_
// dispatch ya sabía resolverla (20260917000000, sin aplicar) pero
// ErpAgentCommandSchema la rechazaba antes de llegar ahí. `arguments` sigue
// siendo z.record(z.unknown()) sin schema propio, igual que el resto.
test("erp agent: contrato HTTP acepta customers.list", () => {
  const base = { waId: "573001234567", metaMessageId: "wamid.P2020A1", requestId: "66666666-6666-4666-8666-666666666666" };
  const parsed = ErpAgentRequestSchema.safeParse({
    ...base,
    kind: "command",
    action: "customers.list",
    arguments: {},
  });
  assert.equal(parsed.success, true);
});
