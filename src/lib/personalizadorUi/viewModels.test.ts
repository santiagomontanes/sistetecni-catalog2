import { test } from "node:test";
import assert from "node:assert/strict";
import {
  budgetBadge,
  stockBadge,
  classificationLabel,
  buildPriceBreakdown,
  resolveImageUrl,
} from "./viewModels";

// Punto 8: nunca esconder que supera presupuesto
test("budgetBadge: WITHIN_BUDGET -> tono positivo", () => {
  assert.deepEqual(budgetBadge("WITHIN_BUDGET"), { label: "Dentro de tu presupuesto", tone: "positive" });
});
test("budgetBadge: WITHIN_TOLERANCE -> mensaje explícito 'un poco por encima', tono warning (nunca oculto)", () => {
  const badge = budgetBadge("WITHIN_TOLERANCE");
  assert.equal(badge.tone, "warning");
  assert.match(badge.label, /por encima/);
});
test("budgetBadge: OVER_BUDGET -> tono negativo, mensaje explícito", () => {
  const badge = budgetBadge("OVER_BUDGET");
  assert.equal(badge.tone, "negative");
  assert.match(badge.label, /fuera/i);
});

// Punto 9: stock=0 nunca puede decir "Disponible"
test("stockBadge: AVAILABLE -> 'Disponible'", () => {
  assert.deepEqual(stockBadge("AVAILABLE"), { label: "Disponible", tone: "positive" });
});
test("stockBadge: OUT_OF_STOCK -> NUNCA contiene la palabra 'Disponible'", () => {
  const badge = stockBadge("OUT_OF_STOCK");
  assert.equal(badge.tone, "negative");
  assert.ok(!badge.label.includes("Disponible"));
  assert.match(badge.label, /agotado/i);
});

// resultados con upgrades / clasificación
test("classificationLabel: cubre las 4 clasificaciones posibles con texto distinto entre sí", () => {
  const labels = [
    classificationLabel("DIRECT_MATCH"),
    classificationLabel("RAM_UPGRADE_MATCH"),
    classificationLabel("STORAGE_UPGRADE_MATCH"),
    classificationLabel("RAM_AND_STORAGE_UPGRADE_MATCH"),
  ];
  assert.equal(new Set(labels).size, 4); // las 4 son distintas entre sí
});

// desglose de precio (punto 7 / D13)
test("buildPriceBreakdown: DIRECT_MATCH (sin upgrades) -> solo la fila 'Equipo base'", () => {
  const breakdown = buildPriceBreakdown({ basePrice: 750000, selectedUpgrades: [], finalPrice: 750000 });
  assert.ok(breakdown);
  assert.equal(breakdown?.rows.length, 1);
  assert.equal(breakdown?.rows[0].label, "Equipo base");
  assert.equal(breakdown?.total, 750000);
});

test("buildPriceBreakdown: con upgrades -> una fila por upgrade, en el mismo orden recibido, total = lo que dice B4 (sin recalcular)", () => {
  const breakdown = buildPriceBreakdown({
    basePrice: 640000,
    selectedUpgrades: [
      { label: "RAM 16 GB", extraCost: 70000 },
      { label: "SSD 500 GB", extraCost: 90000 },
    ],
    finalPrice: 800000,
  });
  assert.ok(breakdown);
  assert.equal(breakdown?.rows.length, 3);
  assert.equal(breakdown?.rows[1].label, "RAM 16 GB");
  assert.equal(breakdown?.rows[1].amount, 70000);
  assert.equal(breakdown?.rows[2].amount, 90000);
  assert.equal(breakdown?.total, 800000); // exactamente lo recibido, nunca recalculado en cliente
});

// special quote (punto 13): sin precio
test("buildPriceBreakdown: basePrice/finalPrice null (cotización especial) -> null, nunca inventa un desglose", () => {
  assert.equal(buildPriceBreakdown({ basePrice: null, selectedUpgrades: [], finalPrice: null }), null);
});

// fallback de imagen (punto 14)
test("resolveImageUrl: array vacío -> placeholder", () => {
  assert.equal(resolveImageUrl([]), "/placeholder.jpg");
});
test("resolveImageUrl: array con solo strings vacíos -> placeholder (no rompe con URL vacía)", () => {
  assert.equal(resolveImageUrl(["", "  "]), "/placeholder.jpg");
});
test("resolveImageUrl: primera URL no vacía -> se usa esa", () => {
  assert.equal(resolveImageUrl(["", "https://example.com/foto.jpg"]), "https://example.com/foto.jpg");
});
