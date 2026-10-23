"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { supabase } from "@/supabase/client";
import type { AttendanceAction } from "@/lib/attendance/validation";

type Shift = { id: string; employee_id: string; started_at: string; lunch_started_at: string | null; lunch_ended_at: string | null; ended_at: string | null; evidence_id: string; rate_snapshot: { amount_cop: string | number; modality: string; paid_lunch: boolean } | null; version: number; settlement_id: string | null };
type Settlement = { id: string; status: string; period_from: string; period_to: string; seconds_worked: number; base_cop: string | number; adjustment_cop: string | number; approved_cop: string | number | null };
type Payment = { id: string; settlement_id: string; amount_cop: string | number; reference: string; kind: string; expense_status: string };
type Dashboard = {
  settings: { enabled: boolean; retention_days: number }; openShift: Shift | null; shifts: Shift[];
  rates: { id: string; effective_from: string; amount_cop: string | number; modality: string; paid_lunch: boolean }[];
  settlements: Settlement[]; payments: Payment[]; balances: { settlement_id: string; paid_cop: number | string; payment_count: number }[];
  employees: { id: string; display_name: string | null; erp_role: string }[];
  events: { id: string; event_type: string; occurred_at: string; reason: string | null; actor_id: string }[];
  profile: { id: string; erp_role: string; display_name: string | null };
};
const field = "w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900";
const button = "rounded-lg bg-indigo-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
const secondary = "rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50";
const localInput = (v: string | null) => v ? new Date(Date.parse(v) - 5 * 3600000).toISOString().slice(0, 16) : "";
const instant = (v: string) => v ? new Date(v + ":00-05:00").toISOString() : null;
const when = (v: string | null) => v ? new Date(v).toLocaleString("es-CO", { timeZone: "America/Bogota" }) : "—";
const money = (v: string | number | bigint) => "$ " + BigInt(v).toLocaleString("es-CO") + " COP";
const eventNames: Record<string, string> = { start: "Entrada", end: "Salida", "lunch.start": "Inicio de almuerzo", "lunch.end": "Fin de almuerzo", correct: "Corrección", rate: "Tarifa", "settlement.create": "Liquidación calculada", "settlement.approve": "Aprobación", "settlement.adjust": "Bono / ajuste", "settlement.void": "Borrador anulado", payment: "Pago / anticipo", "payment.reverse": "Reverso", settings: "Configuración" };

async function api(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Tu sesión expiró. Ingresa nuevamente.");
  const response = await fetch(path, { ...init, cache: "no-store", headers: { ...init?.headers, Authorization: `Bearer ${data.session.access_token}` } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "No se pudo completar la operación.");
  return body;
}

export default function AttendancePage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [employee, setEmployee] = useState(""); const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [online, setOnline] = useState(true); const [camera, setCamera] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null); const [preview, setPreview] = useState("");
  const [photoView, setPhotoView] = useState(""); const [correction, setCorrection] = useState<Shift | null>(null);
  const [selectedSettlement, setSelectedSettlement] = useState("");
  const video = useRef<HTMLVideoElement>(null); const stream = useRef<MediaStream | null>(null);
  const photoKey = useRef(crypto.randomUUID()); const commandRef = useRef<{ signature: string; key: string } | null>(null);
  const loadSequence = useRef(0);
  const manager = data?.profile.erp_role === "admin" || data?.profile.erp_role === "supervisor";
  const payManager = manager || data?.profile.erp_role === "caja";
  const currentEmployee = employee || data?.profile.id || "";

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try { const result = await api(`/api/admin/attendance?page=${page}&employee=${encodeURIComponent(employee)}`); if (sequence === loadSequence.current) setData(result); }
    catch (caught) { if (sequence === loadSequence.current) setError(caught instanceof Error ? caught.message : "Error al cargar asistencia."); }
  }, [employee, page]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const connected = () => { setOnline(true); void load(); }; const disconnected = () => setOnline(false);
    setOnline(navigator.onLine); window.addEventListener("online", connected); window.addEventListener("offline", disconnected);
    return () => { window.removeEventListener("online", connected); window.removeEventListener("offline", disconnected); };
  }, [load]);
  useEffect(() => { if (!photo) { setPreview(""); return; } const url = URL.createObjectURL(photo); setPreview(url); return () => URL.revokeObjectURL(url); }, [photo]);
  useEffect(() => () => { stream.current?.getTracks().forEach(track => track.stop()); }, []);
  useEffect(() => { if (camera && video.current && stream.current) video.current.srcObject = stream.current; }, [camera]);
  useEffect(() => { if (!photoView) return; const timeout = window.setTimeout(() => setPhotoView(""), 55000); return () => window.clearTimeout(timeout); }, [photoView]);

  const command = async (action: AttendanceAction, values: Record<string, unknown>) => {
    const signature = JSON.stringify({ action, values });
    if (commandRef.current?.signature !== signature) commandRef.current = { signature, key: crypto.randomUUID() };
    const result = await api("/api/admin/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, data: values, requestKey: commandRef.current.key }) });
    commandRef.current = null; return result;
  };
  const perform = async (action: AttendanceAction, values: Record<string, unknown>) => {
    if (busy || !online) return;
    setBusy(action); setError(""); setMessage("");
    try { await command(action, values); setMessage("Guardado en el servidor."); setCorrection(null); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No se guardó. Puedes reintentar."); }
    finally { setBusy(""); }
  };
  const openCamera = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) { setError("La cámara requiere HTTPS y permisos. Usa la captura alternativa del celular o abre esta página mediante HTTPS."); return; }
    try { stream.current?.getTracks().forEach(track => track.stop()); stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 } }, audio: false }); setCamera(true); }
    catch { setError("No se pudo abrir la cámara. Permite el acceso en tu navegador o usa la captura alternativa."); }
  };
  const compress = async (source: CanvasImageSource, width: number, height: number) => {
    if (!width || !height) throw new Error("La cámara aún no está lista.");
    const scale = Math.min(1, 960 / Math.max(width, height)); const canvas = document.createElement("canvas"); canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d"); if (!context) throw new Error("No se pudo procesar la fotografía."); context.drawImage(source, 0, 0, canvas.width, canvas.height);
    let blob: Blob | null = null;
    for (const quality of [0.8, 0.65, 0.5]) { blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality)); if (blob && blob.size <= 524288) break; }
    if (!blob || blob.size > 524288) throw new Error("La imagen es demasiado grande. Intenta otra captura.");
    setPhoto(blob); photoKey.current = crypto.randomUUID(); setCamera(false); stream.current?.getTracks().forEach(track => track.stop());
  };
  const capture = async () => { try { if (video.current) await compress(video.current, video.current.videoWidth, video.current.videoHeight); } catch (caught) { setError((caught as Error).message); } };
  const uploadCapture = async (file: File | undefined) => {
    if (!file) return;
    try { if (!file.type.startsWith("image/") || file.size > 15000000) throw new Error("Selecciona una foto de máximo 15 MB."); const bitmap = await createImageBitmap(file); try { await compress(bitmap, bitmap.width, bitmap.height); } finally { bitmap.close(); } }
    catch (caught) { setError((caught as Error).message); }
  };
  const start = async () => {
    if (!photo || busy) return; setBusy("start"); setError("");
    try {
      const form = new FormData(); form.set("photo", photo, "selfie.jpg"); form.set("requestKey", photoKey.current);
      const saved = await api("/api/admin/attendance/photo", { method: "POST", body: form });
      await command("start", { evidenceId: saved.id }); setPhoto(null); setMessage("Entrada registrada con hora del servidor."); await load();
    } catch (caught) { setError((caught as Error).message); } finally { setBusy(""); }
  };
  const showEvidence = async (id: string) => { try { const result = await api(`/api/admin/attendance/photo?id=${id}`); setPhotoView(result.url); } catch (caught) { setError((caught as Error).message); } };

  const disabled = Boolean(busy) || !online;
  const shift = data?.openShift;
  const selected = data?.settlements.find(item => item.id === selectedSettlement);
  return <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Asistencia y pagos operativos</h1><p className="text-sm text-slate-600">Hora de Bogotá · Evidencia fotográfica, sin reconocimiento facial · No es nómina legal completa.</p></div><button className={secondary} onClick={() => { setError(""); void load(); }} disabled={disabled}>Actualizar</button></div>
    <p role="status" className="text-sm">{!online ? "Sin conexión: reconecta antes de registrar." : busy ? "Guardando…" : message || "Conectado"}</p>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
    {!data && <p>Cargando datos autorizados del servidor…</p>}
    {data && <>
      {!data.settings.enabled && <p className="rounded-lg bg-amber-50 p-4">El módulo está desactivado. Los registros anteriores se conservan.</p>}
      {data.profile.erp_role === "admin" && <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-semibold">Configuración y retención privada</summary><form className="mt-3 grid gap-3 sm:grid-cols-3" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void perform("settings", { enabled: form.get("enabled") === "on", retentionDays: Number(form.get("days")), reason: String(form.get("reason")) }); }}>
        <label><input name="enabled" type="checkbox" defaultChecked={data.settings.enabled} /> Activar asistencia</label><label>Días de conservación<input className={field} type="number" name="days" min="1" max="365" defaultValue={data.settings.retention_days} required /></label><label>Motivo<input className={field} name="reason" minLength={3} required /></label><button className={button} disabled={disabled}>Guardar configuración</button>
      </form><p className="mt-2 text-sm text-slate-600">El nuevo plazo se aplica a futuras fotos. El proceso de eliminación debe estar programado; desactivar asistencia no detiene la retención.</p></details>}

      {data.settings.enabled && <section className="space-y-3 rounded-xl border bg-white p-4"><h2 className="text-lg font-semibold">Mi turno</h2>
        {shift ? <><p>Entrada: {when(shift.started_at)} · Almuerzo: {when(shift.lunch_started_at)} a {when(shift.lunch_ended_at)}</p><div className="flex flex-wrap gap-3">
          {!shift.lunch_started_at && <button className={button} disabled={disabled} onClick={() => void perform("lunch.start", { shiftId: shift.id, version: shift.version })}>Iniciar almuerzo</button>}
          {shift.lunch_started_at && !shift.lunch_ended_at && <button className={button} disabled={disabled} onClick={() => void perform("lunch.end", { shiftId: shift.id, version: shift.version })}>Finalizar almuerzo</button>}
          {(!shift.lunch_started_at || shift.lunch_ended_at) && <button className={button} disabled={disabled} onClick={() => { if (confirm("¿Registrar tu salida ahora? Se cerrará el turno con la hora del servidor.")) void perform("end", { shiftId: shift.id, version: shift.version }); }}>Registrar salida</button>}
        </div>{Date.now() - Date.parse(shift.started_at) > 18 * 3600000 && <p className="text-amber-700">Turno abierto hace más de 18 horas. Si olvidaste marcar, solicita una corrección al responsable.</p>}</> : <><p>No tienes un turno abierto. Captura una selfie para registrar la entrada.</p><div className="flex flex-wrap gap-3"><button className={button} disabled={disabled} onClick={() => void openCamera()}>Iniciar turno: abrir cámara</button><label className={secondary}>Captura alternativa<input aria-label="Captura alternativa" className="mt-1 block max-w-xs text-sm" type="file" accept="image/*" capture="user" disabled={disabled} onChange={event => void uploadCapture(event.target.files?.[0])} /></label></div>
          {camera && <div><video ref={video} autoPlay muted playsInline className="max-h-80 w-full rounded-lg bg-slate-900" /><button className={button + " mt-2"} onClick={() => void capture()}>Tomar selfie</button><button className={secondary + " ml-2"} onClick={() => { stream.current?.getTracks().forEach(track => track.stop()); setCamera(false); }}>Cerrar cámara</button></div>}
          {preview && <div className="flex flex-wrap items-center gap-3">{/* eslint-disable-next-line @next/next/no-img-element */}<Image unoptimized width={960} height={720} alt="Selfie pendiente de guardar" src={preview} className="h-40 rounded-lg" /><button className={button} disabled={disabled} onClick={() => void start()}>Confirmar selfie y registrar entrada</button><button className={secondary} disabled={disabled} onClick={() => setPhoto(null)}>Descartar</button></div>}
          <p className="text-sm text-slate-600">La foto se comprime, se guarda en almacenamiento privado y vence a los {data.settings.retention_days} días. Se usa como evidencia; no verifica tu identidad automáticamente.</p>
        </>}
      </section>}

      <div className="flex flex-wrap items-center gap-3"><label>Empleado<select aria-label="Empleado" className={field} value={currentEmployee} onChange={event => { setEmployee(event.target.value); setPage(0); setSelectedSettlement(""); }}>{data.employees.map(person => <option key={person.id} value={person.id}>{person.display_name || person.id.slice(0, 8)} · {person.erp_role}</option>)}</select></label><span className="text-sm text-slate-600">Página {page + 1} · 25 turnos, liquidaciones y eventos por página</span></div>

      {manager && data.settings.enabled && <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-semibold">Tarifas vigentes y liquidación</summary>
        <form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void perform("rate", { employeeId: currentEmployee, effectiveFrom: instant(String(form.get("effective"))), modality: String(form.get("modality")), amountCop: String(form.get("amount")), paidLunch: form.get("lunch") === "on", reason: String(form.get("reason")) }); }}>
          <label>Vigencia desde (Bogotá)<input name="effective" className={field} type="datetime-local" required /></label><label>Modalidad<select name="modality" className={field}><option value="hourly">Por hora efectiva</option><option value="per_shift">Por turno cerrado</option></select></label><label>Tarifa COP<input name="amount" className={field} inputMode="numeric" pattern="[0-9]+" required /></label><label><input type="checkbox" name="lunch" /> Almuerzo remunerado</label><label>Motivo<input name="reason" className={field} minLength={3} required /></label><button className={button} disabled={disabled}>Crear nueva tarifa</button>
        </form><p className="my-3 text-sm text-slate-600">Cada entrada conserva la tarifa vigente. Crear otra tarifa no cambia turnos ni liquidaciones anteriores. Un turno sin tarifa requiere corrección autorizada.</p>
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void perform("settlement.create", { employeeId: currentEmployee, from: String(form.get("from")), to: String(form.get("to")) }); }}><label>Entradas desde<input type="date" name="from" className={field} required /></label><label>Hasta<input type="date" name="to" className={field} required /></label><button className={button} disabled={disabled}>Calcular borrador</button></form>
      </details>}

      <section className="rounded-xl border bg-white p-4"><h2 className="mb-3 text-lg font-semibold">Turnos</h2>{!data.shifts.length ? <p>No hay turnos registrados.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Entrada / salida</th><th className="p-2">Almuerzo</th><th className="p-2">Tarifa preservada</th><th className="p-2">Acciones</th></tr></thead><tbody>{data.shifts.map(item => <tr key={item.id} className="border-t"><td className="p-2">{when(item.started_at)}<br />{item.ended_at ? when(item.ended_at) : "Turno abierto"}</td><td className="p-2">{when(item.lunch_started_at)}<br />{when(item.lunch_ended_at)}</td><td className="p-2">{item.rate_snapshot ? `${money(item.rate_snapshot.amount_cop)} / ${item.rate_snapshot.modality === "hourly" ? "hora" : "turno"}` : "Sin tarifa"}<br />{item.settlement_id && "En liquidación"}</td><td className="space-y-1 p-2">{(manager || item.employee_id === data.profile.id) && <button className={secondary} onClick={() => void showEvidence(item.evidence_id)}>Ver evidencia</button>}{manager && !item.settlement_id && data.settings.enabled && <button className={secondary} disabled={disabled} onClick={() => setCorrection(item)}>Corregir</button>}</td></tr>)}</tbody></table></div>}</section>
      {photoView && <section className="rounded-xl border bg-white p-4"><button className={secondary} onClick={() => setPhotoView("")}>Cerrar evidencia</button>{/* eslint-disable-next-line @next/next/no-img-element */}<Image unoptimized width={960} height={720} alt="Evidencia privada de entrada" src={photoView} referrerPolicy="no-referrer" className="mt-3 max-h-96 rounded-lg" /><p className="text-sm">Enlace autorizado válido durante 60 segundos.</p></section>}
      {correction && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4"><h2 className="font-semibold">Corrección auditada · horario Bogotá</h2><form key={correction.id} className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const values: Record<string, unknown> = { shiftId: correction.id, version: correction.version, startedAt: instant(String(form.get("start"))), lunchStartedAt: instant(String(form.get("lunchStart"))), lunchEndedAt: instant(String(form.get("lunchEnd"))), endedAt: instant(String(form.get("end"))), reason: String(form.get("reason")) }; if (form.get("rateId")) values.rateId = form.get("rateId"); if (confirm("¿Guardar esta corrección? Quedarán registrados el antes, después, responsable y motivo.")) void perform("correct", values); }}>
        <label>Entrada<input name="start" type="datetime-local" className={field} defaultValue={localInput(correction.started_at)} required /></label><label>Salida (vacío = turno abierto)<input name="end" type="datetime-local" className={field} defaultValue={localInput(correction.ended_at)} /></label><label>Inicio de almuerzo<input name="lunchStart" type="datetime-local" className={field} defaultValue={localInput(correction.lunch_started_at)} /></label><label>Fin de almuerzo<input name="lunchEnd" type="datetime-local" className={field} defaultValue={localInput(correction.lunch_ended_at)} /></label>
        {!correction.rate_snapshot && <label>Asignar tarifa faltante<select name="rateId" className={field}><option value="">Conservar sin tarifa</option>{data.rates.map(rate => <option key={rate.id} value={rate.id}>{when(rate.effective_from)} · {money(rate.amount_cop)}</option>)}</select></label>}<label>Motivo obligatorio<input name="reason" className={field} minLength={3} required /></label><div className="flex gap-2"><button className={button} disabled={disabled}>Guardar corrección</button><button type="button" className={secondary} onClick={() => setCorrection(null)}>Cancelar</button></div>
      </form></section>}

      <section className="space-y-3 rounded-xl border bg-white p-4"><h2 className="text-lg font-semibold">Liquidaciones operativas</h2><p className="text-sm text-slate-600">Cálculo de horas/turnos registrados, bonos y ajustes autorizados. No incluye prestaciones, recargos ni obligaciones legales automáticas. Redondeo al peso por turno.</p>
        {data.balances.reduce((sum, balance) => sum + balance.payment_count, 0) > data.payments.length && <p className="text-amber-800">Se muestran los 1000 movimientos más recientes de esta página. Los totales y saldos incluyen todos los movimientos.</p>}
        {!data.settlements.length && <p>No hay liquidaciones.</p>}
        {data.settlements.map(item => { const paid = BigInt(data.balances.find(balance => balance.settlement_id === item.id)?.paid_cop ?? 0); const calculated = BigInt(item.base_cop) + BigInt(item.adjustment_cop); return <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><p>{item.period_from} a {item.period_to} · {item.status === "draft" ? "Borrador" : item.status === "approved" ? "Aprobada" : "Anulada"}</p><p className="text-sm">Horas: {(item.seconds_worked / 3600).toFixed(2)} · Base: {money(item.base_cop)} · Ajustes: {money(item.adjustment_cop)} · Calculado: {money(calculated)}</p><p className="text-sm">Aprobado: {item.approved_cop === null ? "Pendiente" : money(item.approved_cop)} · Pagado: {money(paid)} · Saldo {item.approved_cop === null ? "provisional" : "aprobado"}: {money((item.approved_cop === null ? calculated : BigInt(item.approved_cop)) - paid)}</p></div>{payManager && item.status !== "voided" && data.settings.enabled && <button className={secondary} onClick={() => setSelectedSettlement(item.id)}>Gestionar</button>}</div>; })}
        {selected && <div className="space-y-4 border-t pt-4"><h3 className="font-semibold">Gestionar {selected.period_from} a {selected.period_to}</h3>
          {manager && selected.status === "draft" && <><form className="grid gap-2 sm:grid-cols-4" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void perform("settlement.adjust", { settlementId: selected.id, amountCop: String(form.get("amount")), reason: String(form.get("reason")) }); }}><label className="sm:col-span-1">Bono / ajuste COP (+ o −)<input name="amount" className={field} pattern="-?[0-9]+" required /></label><label className="sm:col-span-2">Motivo<input name="reason" className={field} minLength={3} required /></label><button className={button} disabled={disabled}>Aplicar ajuste</button></form>
            <form key={selected.id + ":" + selected.adjustment_cop} className="grid gap-2 sm:grid-cols-4" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const amount = String(form.get("amount")); if (confirm(`¿Aprobar ${money(amount)}? El valor y los turnos quedarán bloqueados para cambios.`)) void perform("settlement.approve", { settlementId: selected.id, amountCop: amount, reason: String(form.get("reason")) }); }}><label>Valor aprobado COP<input name="amount" className={field} pattern="[0-9]+" defaultValue={(BigInt(selected.base_cop) + BigInt(selected.adjustment_cop)).toString()} required /></label><label className="sm:col-span-2">Motivo de aprobación<input name="reason" className={field} minLength={3} required /></label><button className={button} disabled={disabled}>Aprobar</button></form>
            <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); if (confirm("¿Anular este borrador sin pagos activos y liberar sus turnos? El historial se conserva.")) void perform("settlement.void", { settlementId: selected.id, reason: String(form.get("reason")) }); }}><input className={field + " max-w-sm"} aria-label="Motivo de anulación" name="reason" placeholder="Motivo de anulación del borrador" minLength={3} required /><button className={secondary} disabled={disabled}>Anular borrador</button></form></>}
          {payManager && <form className="grid gap-3 sm:grid-cols-4" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const amount = String(form.get("amount")); if (confirm(`¿Registrar un desembolso real de ${money(amount)}? Se creará una sola salida en gastos y caja del ERP.`)) void perform("payment", { settlementId: selected.id, amountCop: amount, kind: String(form.get("kind")), method: String(form.get("method")), reference: String(form.get("reference")) }); }}><label>Tipo<select name="kind" className={field}>{selected.status === "approved" && <option value="payment">Pago</option>}<option value="advance">Anticipo autorizado</option></select></label><label>Importe COP<input name="amount" className={field} pattern="[0-9]+" required /></label><label>Medio<select name="method" className={field}>{["efectivo", "transferencia", "nequi", "daviplata", "tarjeta", "otro"].map(method => <option key={method}>{method}</option>)}</select></label><label>Referencia única<input name="reference" className={field} minLength={3} maxLength={120} required /></label><button className={button} disabled={disabled}>Registrar pago / anticipo</button></form>}
          {data.payments.filter(payment => payment.settlement_id === selected.id).map(payment => <div key={payment.id} className="rounded-lg bg-slate-50 p-3"><p>{payment.reference} · {money(payment.amount_cop)} · {payment.kind === "advance" ? "Anticipo" : "Pago"} · {payment.expense_status === "active" ? "Activo" : "Reversado"}</p>{payment.expense_status === "active" && payManager && <form className="mt-2 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); if (confirm("¿Reversar este desembolso? Se anulará el gasto y se registrará el reverso en caja, conservando el original.")) void perform("payment.reverse", { settlementId: selected.id, paymentId: payment.id, reason: String(form.get("reason")) }); }}><input aria-label="Motivo del reverso" name="reason" className={field + " max-w-sm"} placeholder="Motivo del reverso" minLength={3} required /><button className={secondary} disabled={disabled}>Reversar pago</button></form>}</div>)}
        </div>}
      </section>
      <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-semibold">Historial de cambios</summary><ul className="mt-3 space-y-2 text-sm">{data.events.map(event => <li key={event.id}>{when(event.occurred_at)} · {eventNames[event.event_type] || event.event_type} · Responsable: {data.employees.find(person => person.id === event.actor_id)?.display_name || event.actor_id.slice(0, 8)}{event.reason && ` · ${event.reason}`}</li>)}</ul>{!data.events.length && <p>Sin eventos.</p>}</details>
      <div className="flex justify-between"><button className={secondary} disabled={disabled || page === 0} onClick={() => setPage(value => value - 1)}>Anterior</button><button className={secondary} disabled={disabled || (data.shifts.length < 25 && data.settlements.length < 25 && data.events.length < 25)} onClick={() => setPage(value => value + 1)}>Siguiente</button></div>
    </>}
  </main>;
}
