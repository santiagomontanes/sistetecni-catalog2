import { z } from "zod";

export const ERP_AGENT_ACTIONS = [
  "inventory.summary",
  "inventory.find",
  // P20.17-bis (corrección) — busca PRODUCTOS (public.products) directo, sin
  // depender de que ya existan product_units (a diferencia de "inventory.find",
  // que es unit-scoped). Ver 20260914210000_erp_fase3d_find_products.sql.
  "inventory.find_products",
  "sales.today",
  "cash.status",
  "expenses.today",
  "purchases.recent",
  "warranties.open",
  "customers.find",

  // P20.17B — inventario físico.
  "inventory.sequence_status",
  "inventory.resolve_unit",

  "inventory.reserve",
  "inventory.release",
  "customer.create",
  "expense.create",
  "cash.open",
  "cash.close",
  "cash.movement",
  "sale.create_by_stu",

  // P20.17B — recepción y administración de unidades físicas.
  "inventory.receive_units",
  "inventory.assign_manufacturer_serial",
  "inventory.correct_manufacturer_serial",
  "inventory.update_unit_condition",

  // P20.17C — publicación confirmada de AdminProductDraft.
  "catalog.publish_draft",

  // P20.18 — lenguaje natural completo sobre inventario físico: detalle
  // real de 1..100 STU, transición atómica de 1..100 STU, y listado de
  // productos como lectura directa del administrador (no solo interna).
  "inventory.resolve_units",
  "inventory.transition_units",
  "inventory.list_products",

  // P20.19-bis — fotos por WhatsApp para un producto/unidad YA existente.
  // El dispatcher SQL SOLO valida existencia y confirma (mismo permiso/
  // CONFIRMAR/idempotencia que cualquier otra escritura) — NUNCA recibe
  // `imageUrls`/binario: la subida real y la mutación de la galería ocurren
  // DESPUÉS de CONFIRMAR, vía /product-media + /catalog-media-finalize (ver
  // 20260915010000_erp_fase3f_catalog_media.sql). `catalog.media.list` /
  // `inventory.unit_media.list` son lecturas (ejecutan directo, sin
  // CONFIRMAR) — base para que el agente resuelva "la tercera"/"pon la
  // primera de principal" contra URLs reales.
  "catalog.media.add",
  "catalog.media.replace",
  "catalog.media.remove_all",
  "catalog.media.remove",
  "catalog.media.set_primary",
  "catalog.media.list",
  "inventory.unit_media.add",
  "inventory.unit_media.replace",
  "inventory.unit_media.list",

  // P20.20A — administración natural de ventas, comprobantes y clientes.
  // TODAS de lectura (permission 'sales.read'/'customers.manage', risk
  // 'read' — 20260916000000_erp_fase3g_sales_customers_read.sql): ejecutan
  // directo, sin CONFIRMAR. `sales.receipt` solo resuelve saleId/saleNumber
  // aquí — el PDF (buildSalePdfBytes, ya existente) y su envío por WhatsApp
  // ocurren en /api/internal/erp-agent/sales-receipt, nunca en SQL.
  "sales.list",
  "sales.find",
  "sales.detail",
  "sales.receipt",
  "customers.detail",
  "customers.history",
  // P20.20A.1 — listado real de clientes (permission 'customers.manage',
  // risk 'read' — 20260917000000_erp_fase3h_customer_autoregistration_
  // backfill.sql). Faltaba en este enum: sin ella, erp_agent_dispatch ya
  // sabía resolverla pero ErpAgentCommandSchema la rechazaba antes de
  // llegar ahí.
  "customers.list",
] as const;

export type ErpAgentAction = (typeof ERP_AGENT_ACTIONS)[number];

const Base = z.object({
  waId: z.string().min(8).max(32),
  metaMessageId: z.string().min(8).max(300),
});

export const ErpAgentCommandSchema = Base.extend({
  kind: z.literal("command"),
  requestId: z.string().uuid(),
  action: z.enum(ERP_AGENT_ACTIONS),
  arguments: z.record(z.unknown()).default({}),
});

export const ErpAgentConfirmSchema = Base.extend({
  kind: z.literal("confirm"),
  requestId: z.string().uuid(),
  confirmationCode: z.string().regex(/^\d{6}$/),
});

export const ErpAgentCancelSchema = Base.extend({
  kind: z.literal("cancel"),
  requestId: z.string().uuid(),
});

export const ErpAgentRequestSchema = z.discriminatedUnion("kind", [
  ErpAgentCommandSchema,
  ErpAgentConfirmSchema,
  ErpAgentCancelSchema,
]);

export type ErpAgentRequest = z.infer<typeof ErpAgentRequestSchema>;
export type ErpAgentCommand = z.infer<typeof ErpAgentCommandSchema>;
