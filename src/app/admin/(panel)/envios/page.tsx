"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { callAdminAction } from "@/lib/callAdminAction";
import { shippingAction } from "@/app/admin/envios/actions";
import type { Shipment, ShippingAction } from "@/lib/shipping/contracts";
import { COLLECTION_STATUS_LABELS, SHIPMENT_STATUS_LABELS, type MatchSearch } from "@/lib/shipping/domain";
import { getErpProfile } from "@/supabase/auth";
import { roleHasPermission, type ErpRole } from "@/lib/erpAuth/types";
import ShippingTransport,{TransportFields} from "@/components/workshop/ShippingTransport";
import ShippingNotifications from "@/components/workshop/ShippingNotifications";
import ShippingStats from "@/components/workshop/ShippingStats";
import {expectedShipmentNet,guideTransportFromFields} from "@/lib/shipping/transport";

const inputClass = "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-text";
const buttonClass = "rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const secondaryClass = "rounded-xl border border-border px-4 py-2 text-sm font-semibold text-text disabled:opacity-50";
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block space-y-1 text-sm text-text"><span>{label}</span>{children}</label>; }
function Cop({ value }: { value: string | null | undefined }) { return <>{value == null ? "—" : `$ ${BigInt(value).toLocaleString("es-CO")} COP`}</>; }
function moment(value: string | null) { return value ? new Date(value).toLocaleString("es-CO", { timeZone: "America/Bogota" }) : "—"; }
function formValues(event: FormEvent<HTMLFormElement>): Record<string, string> { event.preventDefault(); return Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>; }
interface Sale { id: string; sale_number: string; customer_name: string; customer_document: string; customer_phone: string; payment_status: string; total_cop: string }
interface Deposit { id: string; amount_cop: string; unallocated_cop?:string;deposited_on: string; account: string; reference: string; status: string; reversal_reason: string | null }
interface Job { id: string; kind: string; due_at: string; status: string; attempts: number; shipment_id: string | null }
interface Allocation { shipmentId: string; amountCop: string; version: number;finalSettlement?:boolean }

export default function ShippingPage() {
  const [tab, setTab] = useState<"shipments" | "collections" | "stats" | "settings">("shipments");
  const [role, setRole] = useState<ErpRole | null>(null);
  const [items, setItems] = useState<Shipment[]>([]);
  const [selected, setSelected] = useState<Shipment | null>(null);
  const [pending, setPending] = useState<Shipment[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [saleId, setSaleId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [settings, setSettings] = useState<{ enabled: boolean; reminder_hour: number; recipient_ids: string[] } | null>(null);
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [matches, setMatches] = useState<MatchSearch | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deductionValue,setDeductionValue]=useState("0");
  const retries = useRef(new Map<string, string>());
  const canManage = role ? roleHasPermission(role, "sales.manage") : false;
  const canCash = role ? roleHasPermission(role, "cash.read") : false;
  const canReconcile = role ? roleHasPermission(role, "cash.manage") : false;
  const canEditCosts=role?roleHasPermission(role,"profitability.manage"):false;

  const read = useCallback(async (action: ShippingAction, args: Record<string, unknown> = {}) => {
    const response = await callAdminAction(shippingAction, { command: { action, arguments: args } });
    if (!response.ok) throw new Error(response.error);
    return response.data;
  }, []);
  const refreshList = useCallback(async () => {
    const [list, configuration] = await Promise.all([read("list", { offset, limit: 30, ...(status ? { status } : {}), ...(query.trim() ? { search: query.trim() } : {}) }), read("settings")]);
    setItems(list.items as Shipment[]); setHasMore(Boolean(list.hasMore)); setSettings(configuration as typeof settings);
  }, [read, status, offset, query]);
  const refreshCollections = useCallback(async () => {
    const [list, payments, totals] = await Promise.all([read("pending_collections", { limit: 100 }), read("deposits"), read("metrics")]);
    setPending(list.items as Shipment[]); setDeposits(payments.items as Deposit[]); setMetrics(totals);
  }, [read]);
  useEffect(() => { void getErpProfile().then((profile) => setRole(profile?.role ?? null)); }, []);
  useEffect(() => { void refreshList().catch((e: Error) => setError(e.message)); }, [refreshList]);
  useEffect(() => {
    if (tab === "collections" && canCash) void refreshCollections().catch((e: Error) => setError(e.message));
    if (tab === "settings") void read("jobs").then((r) => setJobs(r.items as Job[])).catch((e: Error) => setError(e.message));
  }, [tab, canCash, read, refreshCollections]);
  const openDetail = async (id: string) => {
    setDeductionValue("0");
    try { setSelected(await read("detail", { id }) as unknown as Shipment); } catch (e) { setError((e as Error).message); }
  };
  const mutate = async (action: ShippingAction, args: Record<string, unknown>) => {
    if (busy) return false;
    setBusy(true); setError(""); setMessage("");
    const fingerprint = JSON.stringify([action, args]);
    const key = retries.current.get(fingerprint) ?? crypto.randomUUID();
    retries.current.set(fingerprint, key);
    try {
      const response = await callAdminAction(shippingAction, { command: { action, arguments: args, requestId: key } });
      if (!response.ok) { setError(response.error); if (selected) await openDetail(selected.id); return false; }
      retries.current.delete(fingerprint);
      setMessage("Guardado en el servidor.");
      if (tab === "collections") { setMatches(null); setAllocations([]); }
      try {
        await refreshList();
        if (selected) await openDetail(selected.id);
        if (tab === "collections") await refreshCollections();
      } catch { setError("El guardado fue confirmado. No repitas el pago: actualiza la pantalla para recuperar el detalle."); }
      return true;
    } catch { setError("Error de conexión. Puedes reintentar: se conserva la clave para evitar duplicados."); return false; }
    finally { setBusy(false); }
  };
  const startCreate = async () => {
    try { const data = await read("sales"); setSales(data.items as Sale[]); setShowCreate(true); } catch (e) { setError((e as Error).message); }
  };
  const pickedSale = sales.find((s) => s.id === saleId);
  const unitsText = (shipmentId: string) => { const sh = pending.find((p) => p.id === shipmentId); const codes = sh?.units.map((u) => u.unit_code) ?? []; return `${sh?.guide ?? "guía"}: ${codes.length ? codes.join(", ") : "sin unidades"}`; };
  const allocationTotal = allocations.reduce((sum, a) => sum + BigInt(/^\d+$/.test(a.amountCop) ? a.amountCop : "0"), BigInt(0)).toString();

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold text-text">Envíos y recaudos</h1><p className="mt-1 text-sm text-muted">Entrega, guía y recaudo tienen estados independientes. Todos los importes se registran en pesos COP enteros.</p></div>
    <nav className="flex flex-wrap gap-2" aria-label="Secciones de envíos">
      <button className={tab === "shipments" ? buttonClass : secondaryClass} onClick={() => setTab("shipments")}>Envíos</button>
      {canCash && <button className={tab === "collections" ? buttonClass : secondaryClass} onClick={() => setTab("collections")}>Recaudos</button>}
      {canCash && <button className={tab === "stats" ? buttonClass : secondaryClass} onClick={() => setTab("stats")}>Estadísticas</button>}
      <button className={tab === "settings" ? buttonClass : secondaryClass} onClick={() => setTab("settings")}>Avisos y configuración</button>
    </nav>
    {settings && !settings.enabled && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Módulo desactivado: los datos conservados se pueden consultar. Un administrador puede activarlo desde configuración.</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {(message || busy) && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{busy ? "Guardando…" : message}</p>}

    {tab === "stats" && canCash && <ShippingStats read={read} />}

    {tab === "shipments" && <>
      <div className="flex flex-wrap gap-3"><select aria-label="Estado del envío" className={`${inputClass} max-w-xs`} value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}><option value="">Todos los estados</option>{Object.entries(SHIPMENT_STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><button className={secondaryClass} onClick={() => void refreshList().catch((e: Error) => setError(e.message))}>Actualizar</button>{canManage && <button className={buttonClass} disabled={!settings?.enabled || busy} onClick={() => void startCreate()}>Nuevo envío</button>}</div>
      <div className="flex flex-wrap gap-2"><input aria-label="Buscar envío" className={`${inputClass} max-w-md`} placeholder="Buscar envío: STU-27, guía, cliente o cédula" value={query} onChange={(e) => { setQuery(e.target.value); setOffset(0); }} maxLength={100}/>{query && <button className={secondaryClass} onClick={() => setQuery("")}>Limpiar</button>}</div>
      {showCreate && <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
        <div><h2 className="font-semibold">Nuevo envío</h2><p className="text-sm text-muted">Escribe el STU del computador y los datos que te mandó el cliente. Se crea el envío (contraentrega) y luego le registras la guía. El equipo debe estar disponible con su producto y precio de la Fase 3.</p></div>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
          const v = formValues(e); void mutate("quick_create", { stu: v.stu, name: v.name, document: v.document, phone: v.phone, city: v.city, department: v.department, officePickup: v.officePickup === "on", address: v.address, carrier: v.carrier, ...(v.priceCop ? { priceCop: v.priceCop } : {}), ...(v.notes ? { notes: v.notes } : {}) }).then((ok) => { if (ok) setShowCreate(false); });
        }}>
          <Field label="STU del computador"><input className={`${inputClass} font-mono`} required name="stu" placeholder="STU-000027" maxLength={60}/></Field>
          <Field label="Valor de venta COP (déjalo vacío para usar el precio de la Fase 3)"><input className={inputClass} name="priceCop" inputMode="numeric" pattern="[0-9]+" placeholder="450000"/></Field>
          <Field label="Nombre del cliente"><input className={inputClass} required name="name" maxLength={160}/></Field>
          <Field label="Cédula"><input className={inputClass} required name="document" maxLength={40}/></Field>
          <Field label="Celular"><input className={inputClass} required name="phone" maxLength={30}/></Field>
          <Field label="Ciudad"><input className={inputClass} required name="city" maxLength={100}/></Field>
          <Field label="Departamento"><input className={inputClass} required name="department" maxLength={100}/></Field>
          <Field label="Dirección o sede de recogida"><input className={inputClass} required name="address" maxLength={300}/></Field>
          <label className="text-sm"><input name="officePickup" type="checkbox"/> Recogida en oficina</label>
          <Field label="Transportadora"><input className={inputClass} required name="carrier" defaultValue="Interrapidísimo" maxLength={100}/></Field>
          <Field label="Observaciones"><textarea className={inputClass} name="notes" maxLength={4000}/></Field>
          <div className="flex gap-2 sm:col-span-2"><button className={buttonClass} disabled={busy}>Crear envío</button><button type="button" className={secondaryClass} onClick={() => setShowCreate(false)}>Cerrar</button></div>
        </form>
        <details><summary className="cursor-pointer text-sm font-semibold">Usar una venta que ya creé en Ventas</summary><div className="mt-3 space-y-3">
        <form className="flex gap-2" onSubmit={(e) => { const a = formValues(e); void read("sales", a.search ? { search: a.search } : {}).then((r) => setSales(r.items as Sale[])).catch((x: Error) => setError(x.message)); }}><input className={inputClass} name="search" placeholder="Buscar comprobante o cliente" maxLength={100}/><button className={secondaryClass}>Buscar</button></form>
        <Field label="Venta"><select aria-label="Venta" className={inputClass} value={saleId} onChange={(e) => setSaleId(e.target.value)}><option value="">Seleccionar venta</option>{sales.map((s) => <option value={s.id} key={s.id}>{s.sale_number} · {s.customer_name} · {s.total_cop} COP</option>)}</select></Field>
        {pickedSale && <form key={pickedSale.id} className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
          const v = formValues(e); void mutate("create", { saleId: pickedSale.id, name: v.name, document: v.document, phone: v.phone, city: v.city, department: v.department, officePickup: v.officePickup === "on", address: v.address, carrier: v.carrier, paymentMode: pickedSale.payment_status === "pagado" ? "prepaid" : "cod", collectCop: pickedSale.payment_status === "pagado" ? "0" : pickedSale.total_cop, notes: v.notes }).then((ok) => { if (ok) { setShowCreate(false); setSaleId(""); } });
        }}>
          <Field label="Nombre"><input className={inputClass} required name="name" defaultValue={pickedSale.customer_name} maxLength={160}/></Field>
          <Field label="Cédula"><input className={inputClass} required name="document" defaultValue={pickedSale.customer_document} maxLength={40}/></Field>
          <Field label="Celular"><input className={inputClass} required name="phone" defaultValue={pickedSale.customer_phone} maxLength={30}/></Field>
          <Field label="Ciudad"><input className={inputClass} required name="city" maxLength={100}/></Field>
          <Field label="Departamento"><input className={inputClass} required name="department" maxLength={100}/></Field>
          <Field label="Dirección o sede de recogida"><input className={inputClass} required name="address" maxLength={300}/></Field>
          <label className="text-sm"><input name="officePickup" type="checkbox"/> Recogida en oficina</label>
          <Field label="Transportadora"><input className={inputClass} required name="carrier" defaultValue="Interrapidísimo" maxLength={100}/></Field>
          <Field label="Observaciones"><textarea className={inputClass} name="notes" maxLength={4000}/></Field>
          <p className="text-sm">{pickedSale.payment_status === "pagado" ? "Prepagado · por cobrar: $0" : "Contraentrega · por cobrar: "}{pickedSale.payment_status !== "pagado" && <Cop value={pickedSale.total_cop}/>}</p>
          <div className="flex gap-2"><button className={buttonClass} disabled={busy}>Crear envío de esta venta</button></div>
        </form>}
        </div></details>
      </section>}
      {selected && <section className="space-y-4 rounded-2xl border border-primary/30 bg-white p-5">
        <div className="flex justify-between gap-3"><div><h2 className="font-semibold">{selected.sale_number} · {selected.recipient_name}</h2><p className="text-sm">{SHIPMENT_STATUS_LABELS[selected.status]} · Recaudo: {COLLECTION_STATUS_LABELS[selected.collection_status]}</p></div><button className={secondaryClass} onClick={() => setSelected(null)}>Cerrar ficha</button></div>
        <p className="text-sm">{selected.recipient_document} · {selected.recipient_phone}<br/>{selected.city}, {selected.department} · {selected.office_pickup ? "Oficina: " : ""}{selected.address}<br/>{selected.carrier} · Guía: <span className="font-mono">{selected.guide ?? "Pendiente"}</span></p>
        <p className="text-sm">Unidades: {selected.units.map((u) => u.unit_code).join(", ")}<br/>Venta: <Cop value={selected.sale_value_cop}/> · Por cobrar al cliente: <Cop value={selected.collect_cop}/><br/>Flete: <Cop value={selected.freight_cop}/> · Descuentos de la transportadora: <Cop value={selected.deductions_cop}/><br/>Neto esperado: <Cop value={selected.expected_net_cop}/> · Recibido: <Cop value={selected.received_cop}/> · Saldo: <Cop value={selected.balance_cop}/></p>
        <Link className="text-sm text-primary underline" href={`/admin/ventas/${selected.sale_id}`}>Ver comprobante interno existente</Link>
        <ShippingTransport key={selected.id} shipment={selected} canEdit={canEditCosts} canReadCash={canCash} busy={busy} mutate={mutate}/>
        {canManage && settings?.enabled && <>
          {selected.status === "pending_guide" && selected.payment_mode === "cod" && <form className="grid gap-3 rounded-xl border border-primary/30 bg-surface/40 p-4 sm:grid-cols-2" onSubmit={(e) => {
            const v = formValues(e); const withheld = BigInt(selected.collect_cop) - BigInt(v.netCop || "0");
            if (withheld < BigInt(0)) { setError("El valor que te llega no puede superar el valor de venta."); return; }
            void mutate("guide", { id: selected.id, version: selected.version, guide: v.guide, freightCop: withheld.toString(), deductionsCop: "0", transport: [{ code: "freight", kind: "freight", description: "Comisión y envío descontados por la transportadora", amountCop: withheld.toString(), costBearer: "sistetecni", settlement: "withheld", provisional: false, customerChargeCop: "0", customerChargeMode: "none" }] });
          }}>
            <p className="text-sm sm:col-span-2"><strong>Registrar la guía</strong> · Valor por el que va: <strong><Cop value={selected.collect_cop}/></strong> (lo que paga el cliente).</p>
            <Field label="Guía (conserva ceros iniciales)"><input className={inputClass} name="guide" required maxLength={100}/></Field>
            <Field label="Valor que te llegará a la cuenta por la consignación de la transportadora (COP)"><input className={inputClass} name="netCop" inputMode="numeric" pattern="[0-9]+" required placeholder="390000"/></Field>
            <p className="text-xs text-muted sm:col-span-2">La diferencia con el valor de venta se toma como lo que la transportadora descuenta (comisión + envío) y cuenta como costo de transporte tuyo. Si necesitas separar conceptos o cambiar quién paga, usa el formulario detallado de abajo.</p>
            <button className={buttonClass} disabled={busy}>Guardar guía y valor a consignar</button>
          </form>}
          {selected.status === "pending_guide" && <details><summary className="cursor-pointer text-sm font-semibold">Registro detallado de guía y transporte (avanzado)</summary><div className="mt-3">
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { const v = formValues(e); void mutate("guide", { id: selected.id, version: selected.version, guide: v.guide, freightCop: v.freightCop, deductionsCop: v.deductionsCop, deductionReason: v.deductionReason,transport:guideTransportFromFields(v) }); }}>
            <Field label="Guía (conserva ceros iniciales)"><input className={inputClass} name="guide" required maxLength={100}/></Field>
            <Field label="Flete exacto COP"><input className={inputClass} name="freightCop" inputMode="numeric" pattern="[0-9]+" required/></Field>
            <Field label="Otros conceptos de transportadora COP"><input className={inputClass} name="deductionsCop" inputMode="numeric" pattern="[0-9]+" defaultValue="0" required onChange={e=>setDeductionValue(e.target.value)}/></Field>
            <Field label="Concepto de los descuentos"><input className={inputClass} name="deductionReason" maxLength={1000}/></Field>
            <TransportFields prefix="freight" label="Flete" shipmentId={selected.id} allowReferences={canCash}/>
            {/^\d+$/.test(deductionValue)&&BigInt(deductionValue)>0&&<TransportFields prefix="deduction" label="Otros conceptos" shipmentId={selected.id} allowReferences={canCash}/>}
            <button className={buttonClass} disabled={busy}>Registrar guía y flete</button>
          </form></div></details>}
          {selected.status === "ready" && <button className={buttonClass} disabled={busy} onClick={() => { if (window.confirm(`Registrar despacho de la guía ${selected.guide}?`)) void mutate("dispatch", { id: selected.id, version: selected.version }); }}>Registrar despacho</button>}
          {["dispatched", "incident"].includes(selected.status) && <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { const v = formValues(e); if (window.confirm(`Confirmar entrega de ${selected.guide} y neto esperado ${v.expectedNetCop} COP? Esto no registra dinero recibido.`)) void mutate("deliver", { id: selected.id, version: selected.version, deliveredAt: new Date(`${v.deliveredAt}-05:00`).toISOString(), expectedNetCop: v.expectedNetCop, evidence: v.evidence }); }}>
            <Field label="Fecha y hora de entrega (Bogotá)"><input className={inputClass} type="datetime-local" step="1" name="deliveredAt" required/></Field>
            <Field label="Neto esperado COP"><input className={inputClass} name="expectedNetCop" inputMode="numeric" pattern="[0-9]+" required defaultValue={expectedShipmentNet(selected)}/></Field>
            <Field label="Responsable/evidencia de entrega"><input className={inputClass} name="evidence" required maxLength={1000} placeholder="Referencia privada o constancia verificable"/></Field>
            <button className={buttonClass} disabled={busy}>Registrar entrega</button>
          </form>}
          {!["returned", "cancelled"].includes(selected.status) && <form className="flex flex-wrap gap-2" onSubmit={(e) => { const v = formValues(e); const action = v.operation as ShippingAction; const warning = action === "return" ? "El envío pasa a «Devolución en proceso». Las unidades siguen vendidas hasta que confirmes que llegaron al local con esta guía. No se devuelve dinero." : action === "return_confirm" ? `Confirmas que los equipos (${selected.units.map((u) => u.unit_code).join(", ")}) llegaron de vuelta al local con la guía ${v.guide}. Quedarán disponibles para la venta.` : action === "cancel" ? "Se cancela sólo el envío. La venta y sus unidades vendidas se conservan." : "Se registra una novedad sin confirmar entrega."; if (window.confirm(warning)) void mutate(action, action === "return_confirm" ? { id: selected.id, version: selected.version, reason: v.reason, guide: v.guide } : { id: selected.id, version: selected.version, reason: v.reason,recognizeTransport:v.recognizeTransport==="on" }); }}>
            <select aria-label="Operación sobre el envío" name="operation" className={`${inputClass} max-w-xs`}>
              {["dispatched", "incident"].includes(selected.status) && <option value="incident">Registrar novedad</option>}
              {["pending_guide", "ready"].includes(selected.status) && <option value="cancel">Cancelar envío</option>}
              {["dispatched", "incident", "delivered"].includes(selected.status) && <option value="return">Marcar devolución (el equipo va de regreso)</option>}
              {selected.status === "return_pending" && <option value="return_confirm">Confirmar que el equipo ya llegó al local</option>}
            </select>{selected.status === "return_pending" && <input name="guide" aria-label="Guía con la que llegó el equipo" className={`${inputClass} max-w-xs`} placeholder="Guía con la que llegó" required maxLength={100}/>}<input name="reason" className={`${inputClass} max-w-md`} placeholder="Motivo / nota obligatoria" minLength={3} maxLength={1000} required/>{selected.status !== "return_pending" && <label className="text-sm"><input type="checkbox" name="recognizeTransport"/> Confirmo que los costos clasificados de transporte ya se causaron, aunque la entrega haya fallado.</label>}<button className={secondaryClass} disabled={busy}>Aplicar con confirmación</button>
          </form>}
        </>}
        <details><summary className="cursor-pointer text-sm font-semibold">Historial y fechas</summary><p className="my-2 text-xs">Registro: {moment(selected.created_at)} · Despacho: {moment(selected.dispatched_at)} · Entrega: {moment(selected.delivered_at)}</p>{selected.history?.map((h, i) => <p className="text-xs" key={`${h.at}-${i}`}>{moment(h.at)} · {h.operation}{h.detail.reason ? ` · ${String(h.detail.reason)}` : ""}</p>)}</details>
      </section>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((s) => <button className="space-y-2 rounded-2xl border border-border bg-white p-4 text-left" key={s.id} onClick={() => void openDetail(s.id)}><p className="font-semibold">{s.sale_number} · {s.recipient_name}</p><p className="text-sm">{s.city} · {s.carrier}<br/>Guía: <span className="font-mono">{s.guide ?? "Pendiente"}</span></p><p className="text-xs text-muted">{SHIPMENT_STATUS_LABELS[s.status]} · {COLLECTION_STATUS_LABELS[s.collection_status]}<br/>Saldo: <Cop value={s.balance_cop}/></p></button>)}</div>
      {!items.length && <p className="text-sm text-muted">No hay envíos para este filtro.</p>}
      <div className="flex items-center gap-3"><button className={secondaryClass} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 30))}>Anterior</button><span className="text-sm">Página {offset / 30 + 1}</span><button className={secondaryClass} disabled={!hasMore} onClick={() => setOffset(offset + 30)}>Siguiente</button></div>
    </>}

    {tab === "collections" && canCash && <>
      {metrics && <div className="grid gap-3 rounded-2xl bg-surface p-4 sm:grid-cols-3"><p className="text-sm">Neto pendiente<br/><strong><Cop value={String(metrics.netPendingCop ?? "0")}/></strong></p><p className="text-sm">Dinero recibido<br/><strong><Cop value={String(metrics.receivedCop ?? "0")}/></strong></p><p className="text-sm">Pendientes de guía: {String(metrics.pendingGuide)}<br/>Por verificar: {String(metrics.verifyDue)}</p></div>}
      <form className="grid gap-3 rounded-2xl border border-border bg-white p-4 sm:grid-cols-3" onSubmit={(e) => { const v = formValues(e); const args = Object.fromEntries(Object.entries(v).filter(([, value]) => value !== "")); setError(""); void read("search", args).then((r) => setMatches(r as unknown as MatchSearch)).catch((x: Error) => setError(x.message)); }}>
        <Field label="Importe de la consignación COP"><input className={inputClass} name="amountCop" inputMode="numeric" pattern="[0-9]+" required/></Field>
        <Field label="Transportadora (opcional)"><input className={inputClass} name="carrier"/></Field>
        <Field label="Guía contiene (opcional)"><input className={inputClass} name="reference"/></Field>
        <Field label="Entrega desde"><input className={inputClass} type="date" name="from"/></Field>
        <Field label="Entrega hasta"><input className={inputClass} type="date" name="to"/></Field>
        <button className={buttonClass} disabled={busy}>Buscar combinaciones exactas</button>
      </form>
      {matches && <section className="space-y-3"><p className="text-sm">{matches.matches.length} coincidencia(s) exacta(s). Ninguna se aplica automáticamente.{matches.limited && " La búsqueda fue limitada; acota fechas, guía o transportadora para revisar más candidatos."}</p>{matches.matches.map((m, i) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white p-3" key={i}><p className="text-sm">Guías: {m.shipments.map((s) => s.guide).join(", ")} · <Cop value={m.sumCop}/><span className="block text-muted">Equivale probablemente a: {m.shipments.map((s) => unitsText(s.id)).join(" · ")}</span></p>{canReconcile && <button className={secondaryClass} onClick={() => setAllocations(m.shipments.map((s) => ({ shipmentId: s.id, version: s.version, amountCop: s.balance_cop })))}>Seleccionar para revisar</button>}</div>)}</section>}
      <h2 className="font-semibold">Saldos pendientes y abonos parciales</h2>
      <p className="text-sm text-muted">Se muestran hasta 100 saldos. El buscador permite acotar el conjunto. Para un abono, selecciona la guía y escribe el importe realmente consignado.</p>
      <div className="space-y-2">{pending.map((s) => { const allocation = allocations.find((a) => a.shipmentId === s.id); return <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white p-3">
        {canReconcile && <input aria-label={`Seleccionar guía ${s.guide}`} type="checkbox" checked={Boolean(allocation)} onChange={(e) => setAllocations(e.target.checked ? [...allocations, { shipmentId: s.id, version: s.version, amountCop: s.balance_cop }] : allocations.filter((a) => a.shipmentId !== s.id))}/>}
        <p className="flex-1 text-sm">{s.guide} · {s.carrier} · Saldo <Cop value={s.balance_cop}/><span className="block text-muted">{unitsText(s.id)}</span></p>
        {allocation && <><Field label="Abono COP"><input className={`${inputClass} max-w-44`} inputMode="numeric" pattern="[0-9]+" value={allocation.amountCop} onChange={(e) => setAllocations(allocations.map((a) => a.shipmentId === s.id ? { ...a, amountCop: e.target.value } : a))}/></Field><label className="text-xs"><input type="checkbox" checked={Boolean(allocation.finalSettlement)} onChange={e=>setAllocations(allocations.map(a=>a.shipmentId===s.id?{...a,finalSettlement:e.target.checked}:a))}/> Esta es la liquidación final de la guía; registrar la diferencia sin causa como pendiente de revisión.</label></>}
      </div>; })}</div>
      {!pending.length && <p className="text-sm text-muted">No hay recaudos pendientes de envíos entregados.</p>}
      {canReconcile && allocations.length > 0 && <form className="grid gap-3 rounded-2xl border border-primary/30 bg-white p-5 sm:grid-cols-2" onSubmit={(e) => { const v = formValues(e); if (window.confirm(`Confirmar consignación de ${allocationTotal} COP para ${allocations.length} guía(s), cuenta ${v.account}, referencia ${v.reference}? Se registra una sola entrada en caja.`)) void mutate("reconcile", { amountCop: allocationTotal, depositedOn: v.depositedOn, account: v.account, reference: v.reference, evidence: v.evidence, allocations, confirmed: true }); }}>
        <p className="text-sm sm:col-span-2">Selección por confirmar: {allocations.length} envío(s) · Importe a registrar <strong><Cop value={allocationTotal}/></strong><span className="block text-muted">Al confirmar se dan por cobrados: {allocations.map((a) => unitsText(a.shipmentId)).join(" · ")}</span></p>
        <Field label="Fecha de consignación"><input className={inputClass} required type="date" name="depositedOn"/></Field>
        <Field label="Cuenta receptora"><input className={inputClass} required name="account" maxLength={160}/></Field>
        <Field label="Referencia única de la consignación"><input className={inputClass} required name="reference" maxLength={160}/></Field>
        <Field label="Evidencia/referencia privada"><input className={inputClass} name="evidence" maxLength={1000}/></Field>
        <button className={buttonClass} disabled={busy || !settings?.enabled}>Confirmar y registrar consignación</button>
      </form>}
      <h2 className="font-semibold">Últimas consignaciones</h2>
      {deposits.filter(d=>d.status==="active"&&BigInt(d.unallocated_cop??"0")>0).map(d=><section key={`credit:${d.id}`} className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3"><p className="text-sm">Referencia {d.reference}: recibido sin aplicar <Cop value={d.unallocated_cop}/>. No constituye un gasto ni modifica la venta.</p>{canReconcile&&<form className="flex flex-wrap gap-2" onSubmit={e=>{const v=formValues(e);const target=pending.find(s=>s.id===v.shipment);if(target&&window.confirm("Aplicar crédito ya recibido a este saldo, sin nueva entrada de caja?"))void mutate("apply_deposit_credit",{depositId:d.id,id:target.id,version:target.version,amountCop:v.amountCop,confirmed:true});}}><select className={inputClass} name="shipment" required aria-label="Guía para aplicar crédito"><option value="">Seleccionar saldo pendiente</option>{pending.map(s=><option key={s.id} value={s.id}>{s.guide} · {s.sale_number} · {s.balance_cop} COP</option>)}</select><input className={inputClass} name="amountCop" inputMode="numeric" pattern="[0-9]+" required aria-label="Crédito a aplicar COP"/><button className={secondaryClass} disabled={busy}>Aplicar crédito existente sin mover caja</button></form>}</section>)}
      {deposits.map((d) => <article className="space-y-2 rounded-xl border border-border bg-white p-4" key={d.id}><p className="text-sm">{d.deposited_on} · {d.account} · Referencia {d.reference} · <Cop value={d.amount_cop}/> · {d.status === "active" ? "Registrada" : "Revertida"}</p>{d.reversal_reason && <p className="text-sm">Motivo: {d.reversal_reason}</p>}{canReconcile && d.status === "active" && <form className="flex gap-2" onSubmit={(e) => { const v = formValues(e); if (window.confirm(`Revertir ${d.amount_cop} COP de la referencia ${d.reference}? Se registrará el reverso en caja y se reabrirán sus saldos.`)) void mutate("reverse_deposit", { id: d.id, reason: v.reason, confirmed: true }); }}><input className={inputClass} placeholder="Motivo del reverso" name="reason" required minLength={3} maxLength={1000}/><button className={secondaryClass} disabled={busy || !settings?.enabled}>Revertir</button></form>}</article>)}
    </>}

    {tab === "settings" && <>
      <ShippingNotifications admin={role==="admin"}/>
      <p className="text-sm text-muted">Los avisos usan America/Bogota. El control se programa 3 días después de la guía, excluyendo sábados y domingos; los festivos sí cuentan. Un aviso no confirma entrega. La bandeja es persistente; el envío por WhatsApp requiere conectar el consumidor externo.</p>
      {role === "admin" && settings && <form className="grid gap-3 rounded-2xl border border-border bg-white p-5 sm:grid-cols-2" onSubmit={(e) => { const v = formValues(e); void mutate("configure", { enabled: v.enabled === "on", reminderHour: Number(v.reminderHour), recipientIds: v.recipientIds.split(/[\s,]+/).filter(Boolean) }); }}>
        <label className="text-sm"><input type="checkbox" name="enabled" defaultChecked={settings.enabled}/> Activar módulo de envíos</label>
        <Field label="Hora del resumen nocturno (0–23, Bogotá)"><input className={inputClass} name="reminderHour" type="number" min={0} max={23} defaultValue={settings.reminder_hour} required/></Field>
        <Field label="Destinatarios autorizados (IDs de perfiles, separados por coma)"><textarea className={inputClass} name="recipientIds" defaultValue={settings.recipient_ids.join(", ")}/></Field>
        <button className={buttonClass} disabled={busy}>Guardar configuración</button>
      </form>}
      <h2 className="font-semibold">Bandeja de avisos</h2>
      {jobs.map((j) => <p className="rounded-xl border border-border p-3 text-sm" key={j.id}>{j.kind === "verify_delivery" ? "Verificar entrega" : "Resumen de guías pendientes"} · {moment(j.due_at)} · {j.status} · Intentos: {j.attempts}</p>)}
      {!jobs.length && <p className="text-sm text-muted">No hay avisos programados.</p>}
    </>}
  </div>;
}
