"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { callAdminAction } from "@/lib/callAdminAction";
import {
  addCashMovement,
  closeCash,
  findPurchaseForCash,
  getCashDashboard,
  openCash,
  reverseCashMovement,
} from "@/app/admin/caja/actions";
import { formatCOP } from "@/lib/personalizadorUi";
import type { CashMovementDTO, CashSessionDTO, PaymentMethod } from "@/lib/adminPhase2/types";

const METHODS: PaymentMethod[] = ["efectivo", "transferencia", "nequi", "daviplata", "tarjeta", "otro"];
const CASH_TIMEOUT_MS = 20_000;

type BusyAction = "load" | "open" | "close" | "movement" | "reverse" | null;

function withCashTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("CASH_REQUEST_TIMEOUT")), CASH_TIMEOUT_MS);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export default function CajaPage() {
  const [open, setOpen] = useState<CashSessionDTO | null>(null);
  const [movements, setMovements] = useState<CashMovementDTO[]>([]);
  const [busy, setBusy] = useState<BusyAction>("load");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setBusy("load");
    setError("");
    try {
      const result = await withCashTimeout(callAdminAction(getCashDashboard, {}));
      if (!result.ok) {
        setError("No fue posible cargar caja. La sesión o el permiso de Caja fue rechazado por el servidor.");
        return;
      }
      setOpen(result.data.open);
      setMovements(result.data.movements);
      setNeedsRefresh(false);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message === "CASH_REQUEST_TIMEOUT"
          ? "Caja tardó más de 20 segundos en responder. Revisa la terminal; las operaciones de dinero quedan bloqueadas hasta que pulses Actualizar y obtengamos el estado real."
          : "Caja no respondió correctamente. Revisa la terminal del servidor de desarrollo."
      );
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sessionCash = useMemo(
    () =>
      open
        ? open.openingCashCop +
          movements
            .filter((movement) => movement.sessionId === open.id && movement.paymentMethod === "efectivo")
            .reduce((sum, movement) => sum + movement.amountCop, 0)
        : 0,
    [open, movements]
  );

  const totals = useMemo(
    () =>
      Object.fromEntries(
        METHODS.map((method) => [
          method,
          movements.reduce(
            (sum, movement) => sum + (movement.paymentMethod === method ? movement.amountCop : 0),
            0
          ),
        ])
      ),
    [movements]
  );

  const openSession = async () => {
    const amount = Number(prompt("Efectivo inicial en caja (COP):", "0"));
    if (!Number.isInteger(amount) || amount < 0) return;
    const notes = prompt("Nota de apertura (opcional):") ?? "";

    setBusy("open");
    setError("");
    setMessage("");
    try {
      const result = await withCashTimeout(callAdminAction(openCash, { openingCashCop: amount, notes }));
      if (!result.ok) {
        setError(
          result.error === "VALIDATION_ERROR"
            ? result.issues.join(" ")
            : "No se pudo abrir caja. Si ya existe una sesión abierta, pulsa Actualizar."
        );
        return;
      }
      setMessage("Caja abierta correctamente.");
      await load();
    } catch (caught) {
      if (caught instanceof Error && caught.message === "CASH_REQUEST_TIMEOUT") {
        setNeedsRefresh(true);
        setError("La apertura superó 20 segundos. No repitas la operación: pulsa Actualizar para confirmar si la caja alcanzó a abrirse.");
      } else {
        setError("La apertura de caja no respondió correctamente.");
      }
    } finally {
      setBusy(null);
    }
  };

  const closeSession = async () => {
    if (!open) return;
    const amount = Number(prompt(`Efectivo contado. Esperado: ${formatCOP(sessionCash)}`, String(sessionCash)));
    if (!Number.isInteger(amount) || amount < 0) return;
    const notes = prompt("Nota de cierre (opcional):") ?? "";

    setBusy("close");
    setError("");
    setMessage("");
    try {
      const result = await withCashTimeout(
        callAdminAction(closeCash, { sessionId: open.id, countedCashCop: amount, notes })
      );
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? result.issues.join(" ") : "No se pudo cerrar caja.");
        return;
      }
      setMessage("Caja cerrada correctamente.");
      await load();
    } catch (caught) {
      if (caught instanceof Error && caught.message === "CASH_REQUEST_TIMEOUT") {
        setNeedsRefresh(true);
        setError("El cierre superó 20 segundos. No vuelvas a cerrarla: pulsa Actualizar para confirmar el estado real de la sesión.");
      } else {
        setError("El cierre de caja no respondió correctamente.");
      }
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    const type = prompt("Tipo: manual_in | manual_out | purchase_payment", "manual_out")?.trim();
    if (!type || !["manual_in", "manual_out", "purchase_payment"].includes(type)) return;

    const method = prompt(`Método: ${METHODS.join(" | ")}`, "efectivo")?.trim();
    if (!method || !METHODS.includes(method as PaymentMethod)) return;

    let purchaseId: string | undefined;
    let purchaseLabel = "";
    if (type === "purchase_payment") {
      const number = prompt("Número de compra (ej. COMP-000001):")?.trim().toUpperCase();
      if (!number) return;
      try {
        const found = await withCashTimeout(callAdminAction(findPurchaseForCash, { purchaseNumber: number }));
        if (!found.ok) {
          setError(found.error === "VALIDATION_ERROR" ? found.issues.join(" ") : "No encontré esa compra.");
          return;
        }
        purchaseId = found.data.id;
        purchaseLabel = `${found.data.purchaseNumber} · ${found.data.supplier} · ${formatCOP(found.data.totalCop)}`;
      } catch {
        setError("La consulta de la compra no respondió en 20 segundos.");
        return;
      }
      if (!confirm(`Registrar pago para ${purchaseLabel}?`)) return;
    }

    const amount = Number(prompt("Valor COP:") ?? "");
    const description = prompt("Descripción:", type === "purchase_payment" ? `Pago ${purchaseLabel}` : "")?.trim();
    if (!Number.isInteger(amount) || amount <= 0 || !description) return;

    setBusy("movement");
    setError("");
    try {
      const result = await withCashTimeout(
        callAdminAction(addCashMovement, {
          movementType: type,
          paymentMethod: method,
          amountCop: amount,
          description,
          purchaseId,
        })
      );
      if (!result.ok) {
        setError(result.error === "VALIDATION_ERROR" ? result.issues.join(" ") : "No se pudo registrar movimiento.");
        return;
      }
      setMessage("Movimiento registrado.");
      await load();
    } catch {
      setNeedsRefresh(true);
      setError("El movimiento no respondió en 20 segundos. Pulsa Actualizar antes de repetirlo.");
    } finally {
      setBusy(null);
    }
  };

  const reverse = async (movement: CashMovementDTO) => {
    const reason = prompt(`Motivo para reversar ${movement.movementNumber}:`)?.trim();
    if (!reason) return;

    setBusy("reverse");
    setError("");
    try {
      const result = await withCashTimeout(
        callAdminAction(reverseCashMovement, { movementId: movement.id, reason })
      );
      if (!result.ok) {
        setError("Este movimiento no admite reverso manual o ya fue reversado.");
        return;
      }
      setMessage("Reverso registrado.");
      await load();
    } catch {
      setNeedsRefresh(true);
      setError("El reverso no respondió en 20 segundos. Pulsa Actualizar antes de repetirlo.");
    } finally {
      setBusy(null);
    }
  };

  const mutationDisabled = busy !== null || needsRefresh;
  const refreshDisabled = busy !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">ERP · Fase 2A</p>
          <h1 className="text-2xl font-bold text-text">Caja y flujo de dinero</h1>
          <p className="mt-1 text-sm text-muted">
            El efectivo se cuadra por sesión. Los demás métodos permanecen en el flujo financiero sin afectar el conteo físico.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {open ? (
            <button onClick={() => void closeSession()} disabled={mutationDisabled} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy === "close" ? "Cerrando..." : "Cerrar caja"}
            </button>
          ) : (
            <button onClick={() => void openSession()} disabled={mutationDisabled} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy === "open" ? "Abriendo..." : "Abrir caja"}
            </button>
          )}
          <button onClick={() => void add()} disabled={mutationDisabled} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
            + Movimiento
          </button>
          <button onClick={() => void load()} disabled={refreshDisabled} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
            {busy === "load" ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </div>

      {message ? <p className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {needsRefresh ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Estado pendiente de confirmar. Por seguridad, primero pulsa Actualizar; no se permite repetir una operación de dinero mientras la respuesta anterior sea incierta.</p> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="Sesión" value={open?.sessionNumber ?? "Cerrada"} />
        <Card label="Efectivo esperado" value={open ? formatCOP(sessionCash) : "—"} />
        <Card label="Apertura" value={open ? formatCOP(open.openingCashCop) : "—"} />
      </div>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {METHODS.map((method) => <Card key={method} label={method} value={formatCOP(Number(totals[method] ?? 0))} />)}
      </div>

      {busy === "load" ? <p className="text-sm text-muted">Actualizando caja...</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs text-muted">
            <tr><th className="p-3">Movimiento</th><th>Método</th><th>Descripción</th><th className="text-right">Valor</th><th /></tr>
          </thead>
          <tbody>
            {movements.map((movement) => (
              <tr key={movement.id} className="border-t border-border">
                <td className="p-3 font-mono text-xs">{movement.movementNumber}</td>
                <td>{movement.paymentMethod}</td>
                <td>{movement.description}</td>
                <td className={`text-right font-semibold ${movement.amountCop < 0 ? "text-red-600" : "text-green-700"}`}>{formatCOP(movement.amountCop)}</td>
                <td className="px-3 text-right">
                  {!['sale', 'expense', 'reversal'].includes(movement.movementType) && !movement.reversalOfId ? (
                    <button onClick={() => void reverse(movement)} disabled={mutationDisabled} className="text-xs font-semibold text-red-600 disabled:opacity-50">Reversar</button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-border bg-white p-4"><p className="text-xs font-semibold uppercase text-muted">{label}</p><p className="mt-2 text-xl font-bold text-text">{value}</p></div>;
}
