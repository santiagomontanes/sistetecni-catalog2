"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { callAdminAction } from "@/lib/callAdminAction";
import { createSale, searchProducts } from "@/app/admin/ventas/actions";
import { formatCOP } from "@/lib/personalizadorUi";
import { COMPANY } from "@/config/company";
import { PAYMENT_METHODS, PAYMENT_STATUSES, type PaymentMethod, type PaymentStatus } from "@/types/sale";
import type { AdminProductSearchItemDTO } from "@/lib/salesAdmin/types";

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  nequi: "Nequi",
  daviplata: "Daviplata",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pagado: "Pagado",
  pendiente: "Pendiente",
  parcial: "Parcial",
};

interface LocalItem {
  localId: string;
  itemType: "catalog" | "manual";
  productId: string | null;
  title: string;
  image: string | null;
  description: string;
  unitPriceCop: number;
  quantity: number;
}

function newLocalId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());
}

export default function NuevaVentaPage() {
  const router = useRouter();
  const [idempotencyKey] = useState(() => newLocalId());

  const [customerName, setCustomerName] = useState("");
  const [customerDocument, setCustomerDocument] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  const [items, setItems] = useState<LocalItem[]>([]);

  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<AdminProductSearchItemDTO[]>([]);
  const [searching, setSearching] = useState(false);

  const [showManualForm, setShowManualForm] = useState(false);
  const [manualDescription, setManualDescription] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualQuantity, setManualQuantity] = useState("1");

  const [discountCop, setDiscountCop] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("pagado");
  const [warrantyMonths, setWarrantyMonths] = useState<number>(COMPANY.defaultWarrantyMonths);
  const [notes, setNotes] = useState("");

  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const subtotalCop = useMemo(
    () => items.reduce((sum, item) => sum + item.unitPriceCop * item.quantity, 0),
    [items]
  );
  const clampedDiscount = Math.max(0, Math.min(discountCop, subtotalCop));
  const totalCop = subtotalCop - clampedDiscount;

  const handleSearchProducts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productQuery.trim()) return;
    try {
      setSearching(true);
      const result = await callAdminAction(searchProducts, { query: productQuery.trim() });
      setProductResults(result.ok ? result.data : []);
    } finally {
      setSearching(false);
    }
  };

  const addCatalogItem = (product: AdminProductSearchItemDTO) => {
    setItems((prev) => [
      ...prev,
      {
        localId: newLocalId(),
        itemType: "catalog",
        productId: product.id,
        title: product.title,
        image: product.image,
        description: product.description,
        unitPriceCop: product.price,
        quantity: 1,
      },
    ]);
    setShowCatalogPicker(false);
    setProductQuery("");
    setProductResults([]);
  };

  const addManualItem = () => {
    const price = Number(manualPrice);
    const quantity = Number(manualQuantity);
    if (!manualDescription.trim() || !Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity < 1) {
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        localId: newLocalId(),
        itemType: "manual",
        productId: null,
        title: manualDescription.trim(),
        image: null,
        description: manualDescription.trim(),
        unitPriceCop: Math.round(price),
        quantity,
      },
    ]);
    setManualDescription("");
    setManualPrice("");
    setManualQuantity("1");
    setShowManualForm(false);
  };

  const updateItem = (localId: string, patch: Partial<LocalItem>) => {
    setItems((prev) => prev.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));
  };

  const removeItem = (localId: string) => {
    setItems((prev) => prev.filter((item) => item.localId !== localId));
  };

  const canSubmit =
    customerName.trim().length >= 2 &&
    customerDocument.trim().length >= 4 &&
    customerPhone.trim().length >= 7 &&
    items.length > 0 &&
    items.every((item) => item.unitPriceCop >= 0 && item.quantity >= 1);

  const handleConfirm = async () => {
    if (submitting) return;
    try {
      setSubmitting(true);
      setError("");
      const result = await callAdminAction(createSale, {
        customerName,
        customerDocument,
        customerPhone,
        customerEmail: customerEmail.trim() || null,
        items: items.map((item) =>
          item.itemType === "catalog"
            ? {
                itemType: "catalog" as const,
                productId: item.productId as string,
                description: item.description,
                unitPriceCop: item.unitPriceCop,
                quantity: item.quantity,
              }
            : {
                itemType: "manual" as const,
                description: item.description,
                unitPriceCop: item.unitPriceCop,
                quantity: item.quantity,
              }
        ),
        discountCop: clampedDiscount,
        paymentMethod,
        paymentStatus,
        warrantyMonths,
        notes: notes.trim() || null,
        idempotencyKey,
      });

      if (!result.ok) {
        setShowConfirm(false);
        setError(
          result.error === "VALIDATION_ERROR"
            ? result.issues.join(" ")
            : result.error === "FORBIDDEN"
              ? "No tienes permisos de administrador."
              : "No fue posible registrar la venta."
        );
        return;
      }

      router.push(`/admin/ventas/${result.data.id}`);
    } catch {
      setShowConfirm(false);
      setError("No fue posible registrar la venta.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-28">
      <div>
        <h1 className="text-2xl font-bold text-text">Nueva venta</h1>
        <p className="mt-1 text-sm text-muted">{COMPANY.name}</p>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      ) : null}

      {/* Datos del cliente */}
      <section className="space-y-3 rounded-2xl border border-border bg-white p-4">
        <h2 className="text-base font-semibold text-text">Datos del cliente</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text">Nombre completo *</span>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              maxLength={120}
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text">Cédula / documento *</span>
            <input
              value={customerDocument}
              onChange={(e) => setCustomerDocument(e.target.value)}
              maxLength={20}
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text">Celular *</span>
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              maxLength={20}
              inputMode="tel"
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text">Correo electrónico</span>
            <input
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              maxLength={160}
              type="email"
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
        </div>
      </section>

      {/* Productos */}
      <section className="space-y-3 rounded-2xl border border-border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-text">Productos</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowCatalogPicker((v) => !v)}
              className="rounded-xl border border-primary px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/5"
            >
              + Agregar computador
            </button>
            <button
              type="button"
              onClick={() => setShowManualForm((v) => !v)}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-text transition hover:border-primary hover:text-primary"
            >
              + Producto manual
            </button>
          </div>
        </div>

        {showCatalogPicker ? (
          <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
            <form onSubmit={handleSearchProducts} className="flex gap-2">
              <input
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Buscar por nombre, marca o modelo"
                className="min-w-0 flex-1 rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="submit"
                disabled={searching}
                className="shrink-0 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {searching ? "..." : "Buscar"}
              </button>
            </form>

            {productResults.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {productResults.map((product) => (
                  <button
                    type="button"
                    key={product.id}
                    onClick={() => addCatalogItem(product)}
                    className="flex items-center gap-3 rounded-xl border border-border bg-white p-3 text-left transition hover:border-primary"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {product.image ? (
                      <img src={product.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="h-14 w-14 shrink-0 rounded-lg bg-surface" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text">{product.title}</p>
                      <p className="truncate text-xs text-muted">{product.description || `${product.brand} ${product.model}`}</p>
                      <p className="text-sm font-bold text-primary">{formatCOP(product.price)}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {showManualForm ? (
          <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-text">Descripción</span>
              <input
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                maxLength={300}
                className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-text">Cantidad</span>
                <input
                  type="number"
                  min={1}
                  value={manualQuantity}
                  onChange={(e) => setManualQuantity(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-text">Valor unitario</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={addManualItem}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Agregar ítem
            </button>
          </div>
        ) : null}

        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
            Aún no has agregado productos.
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.localId} className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    ) : null}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text">{item.title}</p>
                      {item.itemType === "manual" ? (
                        <span className="inline-block rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase text-muted">
                          Manual
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.localId)}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Eliminar
                  </button>
                </div>

                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-muted">Descripción</span>
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(item.localId, { description: e.target.value })}
                    maxLength={300}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </label>

                <div className="grid grid-cols-3 gap-2">
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium text-muted">Cant.</span>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateItem(item.localId, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium text-muted">V. unitario</span>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={item.unitPriceCop}
                      onChange={(e) =>
                        updateItem(item.localId, { unitPriceCop: Math.max(0, Number(e.target.value) || 0) })
                      }
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </label>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-muted">Subtotal</span>
                    <p className="rounded-lg bg-surface px-3 py-2 text-sm font-semibold text-text">
                      {formatCOP(item.unitPriceCop * item.quantity)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pago, garantía, observaciones */}
      <section className="space-y-3 rounded-2xl border border-border bg-white p-4">
        <h2 className="text-base font-semibold text-text">Detalles de la venta</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text">Descuento</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={discountCop}
              onChange={(e) => setDiscountCop(Math.max(0, Number(e.target.value) || 0))}
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text">Garantía (meses)</span>
            <input
              type="number"
              min={0}
              value={warrantyMonths}
              onChange={(e) => setWarrantyMonths(Math.max(0, Number(e.target.value) || 0))}
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text">Método de pago</span>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text">Estado</span>
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
              className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            >
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PAYMENT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-text">Observaciones</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            rows={3}
            className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        </label>
      </section>

      {/* Totales + confirmar — siempre visibles */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-white/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted">Total</p>
            <p className="text-xl font-bold text-text">{formatCOP(totalCop)}</p>
          </div>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => setShowConfirm(true)}
            className="rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            Confirmar venta
          </button>
        </div>
      </div>

      {showConfirm ? (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <h2 className="text-lg font-bold text-text">Confirmar comprobante de venta</h2>
            <div className="mt-3 space-y-2 text-sm">
              <p>
                <span className="font-semibold text-text">Cliente:</span> {customerName} ({customerDocument})
              </p>
              <p>
                <span className="font-semibold text-text">Celular:</span> {customerPhone}
              </p>
              <div className="rounded-xl border border-border p-3">
                {items.map((item) => (
                  <div key={item.localId} className="flex justify-between py-1 text-sm">
                    <span className="text-muted">
                      {item.quantity} × {item.title}
                    </span>
                    <span className="font-medium text-text">{formatCOP(item.unitPriceCop * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1 rounded-xl bg-surface p-3">
                <div className="flex justify-between text-sm text-muted">
                  <span>Subtotal</span>
                  <span>{formatCOP(subtotalCop)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted">
                  <span>Descuento</span>
                  <span>{formatCOP(clampedDiscount)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-text">
                  <span>Total</span>
                  <span>{formatCOP(totalCop)}</span>
                </div>
              </div>
              <p className="text-muted">
                Garantía: {warrantyMonths} meses · {PAYMENT_METHOD_LABELS[paymentMethod]} ·{" "}
                {PAYMENT_STATUS_LABELS[paymentStatus]}
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
                className="flex-1 rounded-xl border border-border py-3 text-sm font-semibold text-text disabled:opacity-60"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={submitting}
                className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? "Guardando..." : "Confirmar y generar comprobante"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
