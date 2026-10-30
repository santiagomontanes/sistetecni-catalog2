"use client";
import{useCallback,useEffect,useState}from"react";import{callAdminAction}from"@/lib/callAdminAction";import{createUser,listUsers,resetUserPassword,setUserRole}from"@/app/admin/usuarios/actions";import type{UserProfileDTO}from"@/lib/adminPhase2/types";import{ERP_ROLE_LABELS,type ErpRole}from"@/lib/erpAuth/types";
const ROLES=Object.keys(ERP_ROLE_LABELS) as ErpRole[];
export default function UsuariosPage(){const[items,setItems]=useState<UserProfileDTO[]>([]);const[loading,setLoading]=useState(true);const[allowed,setAllowed]=useState(false);const[error,setError]=useState("");const[message,setMessage]=useState("");const load=useCallback(async()=>{setLoading(true);const r=await callAdminAction(listUsers,{});if(r.ok){setItems(r.data.items);setAllowed(true);}else setError("No fue posible cargar usuarios.");setLoading(false);},[]);useEffect(()=>{void load();},[load]);const save=async(u:UserProfileDTO,patch:Partial<UserProfileDTO>)=>{const next={...u,...patch};const r=await callAdminAction(setUserRole,{profileId:u.id,role:next.role,displayName:next.displayName??undefined,active:next.active});if(!r.ok)return setError(r.error==="VALIDATION_ERROR"?r.issues.join(" "):"No se pudo actualizar el rol.");setMessage("Permisos actualizados.");await load();};return <div className="space-y-6"><div><p className="text-xs font-semibold uppercase tracking-widest text-primary">ERP · Fase 2D</p><h1 className="text-2xl font-bold text-text">Usuarios y permisos</h1><p className="mt-1 max-w-3xl text-sm text-muted">Crea las cuentas de quienes pueden iniciar sesión en sistetecni.com/admin y asígnales un rol. Cada rol define a qué módulos entra. Entrega la contraseña inicial en persona; la persona puede pedirte cambiarla cuando quiera.</p></div>{message?<p className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p>:null}{error?<p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>:null}{loading?<p className="text-sm text-muted">Cargando...</p>:null}{allowed?<NewUser onCreated={async()=>{setMessage("Usuario creado. Ya puede iniciar sesión en /admin con su correo y contraseña.");await load();}} onError={setError} />:null}<div className="space-y-3">{items.map(u=><article key={u.id} className="rounded-2xl border border-border bg-white p-5"><div className="grid gap-3 lg:grid-cols-[1fr_180px_130px]"><div><p className="font-semibold text-text">{u.displayName??u.email??"Usuario"}</p><p className="text-xs text-muted">{u.email??"Sin email en profile"} · <span className="font-mono">{u.id.slice(0,8)}…</span></p></div><select value={u.role} onChange={e=>void save(u,{role:e.target.value as ErpRole})} className="rounded-xl border border-border bg-white px-3 py-2 text-sm">{ROLES.map(r=><option key={r} value={r}>{ERP_ROLE_LABELS[r]}</option>)}</select><button onClick={()=>void save(u,{active:!u.active})} className={`rounded-xl px-3 py-2 text-sm font-semibold ${u.active?"border border-border text-text":"bg-primary text-white"}`}>{u.active?"Desactivar":"Activar"}</button></div><ResetPassword id={u.id} onDone={()=>setMessage("Contraseña actualizada.")} onError={setError} /><p className="mt-3 text-xs text-muted">Rol actual: <strong>{ERP_ROLE_LABELS[u.role]}</strong>{u.isAdmin?" · administrador histórico":""}</p></article>)}</div></div>}

const ROLE_HELP: Record<ErpRole, string> = {
  admin: "Todo, incluida la gestión de usuarios, Caja e ingreso de remate.",
  supervisor: "Ventas, compras, caja, gastos, reportes y rentabilidad. No gestiona usuarios.",
  vendedor: "Clientes, cotizaciones, ventas y licencias. No ve Caja.",
  tecnico: "Taller, inventario y garantías.",
  caja: "Caja, gastos y consulta de ventas y compras.",
  bodega: "Inventario y compras.",
  viewer: "Sin acceso a módulos operativos.",
};
function NewUser({ onCreated, onError }: { onCreated: () => Promise<void>; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<ErpRole>("vendedor");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const fd = new FormData(form);
    if (role === "admin" && !window.confirm("Este usuario tendrá acceso total, incluida la gestión de usuarios y de Caja. ¿Crear como Administrador?")) return;
    setBusy(true); onError("");
    const r = await callAdminAction(createUser, { email: String(fd.get("email") ?? ""), password: String(fd.get("password") ?? ""), displayName: String(fd.get("displayName") ?? ""), role });
    setBusy(false);
    if (!r.ok) return onError(r.error === "VALIDATION_ERROR" ? r.issues.join(" ") : "No se pudo crear el usuario.");
    form.reset(); setOpen(false); await onCreated();
  }
  const input = "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm";
  return <section className="rounded-2xl border border-border bg-white p-5">
    <button type="button" onClick={() => setOpen(v => !v)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">{open ? "Cerrar" : "Crear usuario"}</button>
    {open && <form onSubmit={e => void submit(e)} className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Nombre completo<input name="displayName" required minLength={2} maxLength={120} autoComplete="off" className={input} /></label>
      <label className="text-sm">Correo (para iniciar sesión)<input name="email" type="email" required autoComplete="off" className={input} /></label>
      <label className="text-sm">Contraseña inicial (mínimo 10 caracteres)<input name="password" type="text" required minLength={10} maxLength={72} autoComplete="new-password" className={input} /></label>
      <label className="text-sm">Rol<select aria-label="Rol del nuevo usuario" value={role} onChange={e => setRole(e.target.value as ErpRole)} className={input}>{ROLES.map(r => <option key={r} value={r}>{ERP_ROLE_LABELS[r]}</option>)}</select></label>
      <p className="text-xs text-muted sm:col-span-2">{ROLE_HELP[role]}</p>
      <div className="sm:col-span-2"><button disabled={busy} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Creando…" : "Crear usuario"}</button></div>
    </form>}
  </section>;
}
function ResetPassword({ id, onDone, onError }: { id: string; onDone: () => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const password = String(new FormData(form).get("password") ?? "");
    setBusy(true); onError("");
    const r = await callAdminAction(resetUserPassword, { profileId: id, password });
    setBusy(false);
    if (!r.ok) return onError(r.error === "VALIDATION_ERROR" ? r.issues.join(" ") : "No se pudo cambiar la contraseña.");
    form.reset(); setOpen(false); onDone();
  }
  return <div className="mt-3">
    <button type="button" onClick={() => setOpen(v => !v)} className="text-xs font-semibold text-primary underline">{open ? "Cancelar" : "Cambiar contraseña"}</button>
    {open && <form onSubmit={e => void submit(e)} className="mt-2 flex flex-wrap gap-2"><input name="password" aria-label="Nueva contraseña" type="text" required minLength={10} maxLength={72} autoComplete="new-password" placeholder="Nueva contraseña (mín. 10)" className="rounded-xl border border-border px-3 py-2 text-sm" /><button disabled={busy} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold disabled:opacity-60">{busy ? "Guardando…" : "Guardar contraseña"}</button></form>}
  </div>;
}
