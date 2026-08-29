"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { callAdminAction } from "@/lib/callAdminAction";
import { listAfterSalesCases } from "@/app/admin/garantias/actions";
import type { AdminAfterSalesCaseListItemDTO, AfterSalesCaseStatus } from "@/lib/afterSalesAdmin/types";

const STATUS_LABELS:Record<AfterSalesCaseStatus,string>={open:"Abierto",diagnosing:"Diagnóstico",repair:"Reparación",waiting_customer:"Esperando cliente",closed:"Cerrado",cancelled:"Cancelado"};
const TYPE_LABELS={warranty:"Garantía",return:"Devolución"} as const;
const COVERAGE_LABELS={in_warranty:"En garantía",out_of_warranty:"Fuera de garantía",not_applicable:"No aplica"} as const;
const STATUS_STYLE:Record<AfterSalesCaseStatus,string>={open:"bg-blue-50 text-blue-700",diagnosing:"bg-amber-50 text-amber-700",repair:"bg-red-50 text-red-700",waiting_customer:"bg-violet-50 text-violet-700",closed:"bg-green-50 text-green-700",cancelled:"bg-slate-100 text-slate-600"};
function date(iso:string){return new Intl.DateTimeFormat("es-CO",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(iso));}

export default function GarantiasPage(){
  const [items,setItems]=useState<AdminAfterSalesCaseListItemDTO[]>([]); const [status,setStatus]=useState<"all"|AfterSalesCaseStatus>("all"); const [queryInput,setQueryInput]=useState(""); const [query,setQuery]=useState(""); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  const load=useCallback(async()=>{try{setLoading(true);setError("");const r=await callAdminAction(listAfterSalesCases,{status:status==="all"?undefined:status,query,limit:150});if(!r.ok){setError("No fue posible cargar los casos posventa.");return;}setItems(r.data.items);}catch{setError("No fue posible cargar los casos posventa.");}finally{setLoading(false);}},[status,query]);
  useEffect(()=>{void load();},[load]);
  const active=useMemo(()=>items.filter(x=>!["closed","cancelled"].includes(x.status)).length,[items]);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-primary">ERP · Posventa</p><h1 className="text-2xl font-bold text-text">Garantías y devoluciones</h1><p className="mt-1 text-sm text-muted">Expedientes vinculados a venta, STU y serial. {active} caso(s) activo(s) en esta vista.</p></div><Link href="/admin/ventas" className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-text">Buscar venta</Link></div>
    <form onSubmit={(e)=>{e.preventDefault();setQuery(queryInput.trim());}} className="flex flex-wrap gap-2"><input value={queryInput} onChange={e=>setQueryInput(e.target.value)} placeholder="GAR-, DEV-, cliente, documento, celular, STU o serial" className="min-w-[260px] flex-1 rounded-xl border border-border px-4 py-3 text-sm"/><button className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white">Buscar</button>{query?<button type="button" onClick={()=>{setQueryInput("");setQuery("");}} className="rounded-xl border border-border px-4 py-3 text-sm font-semibold text-text">Limpiar</button>:null}</form>
    <div className="flex flex-wrap gap-2"><button onClick={()=>setStatus("all")} className={`rounded-full px-3 py-2 text-xs font-semibold ${status==="all"?"bg-primary text-white":"bg-surface text-muted"}`}>Todos</button>{(["open","diagnosing","repair","waiting_customer","closed","cancelled"] as AfterSalesCaseStatus[]).map(s=><button key={s} onClick={()=>setStatus(s)} className={`rounded-full px-3 py-2 text-xs font-semibold ${status===s?"bg-primary text-white":"bg-surface text-muted"}`}>{STATUS_LABELS[s]}</button>)}</div>
    {error?<p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>:null}{loading?<p className="text-sm text-muted">Cargando casos...</p>:null}
    {!loading&&items.length===0?<div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">No hay casos con estos filtros. Para abrir uno, entra a la venta y elige el computador físico.</div>:null}
    <div className="grid gap-3 lg:grid-cols-2">{items.map(item=><Link key={item.id} href={`/admin/garantias/${item.id}`} className="rounded-2xl border border-border bg-white p-5 transition hover:border-primary">
      <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-bold text-primary">{item.caseNumber}</p><h2 className="mt-1 font-semibold text-text">{item.productName}</h2><p className="text-xs text-muted">{item.unitCode} · Serial {item.serialNumber??"sin registrar"}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[item.status]}`}>{STATUS_LABELS[item.status]}</span></div>
      <div className="mt-4 grid gap-1 text-sm"><p><span className="text-muted">Tipo:</span> {TYPE_LABELS[item.caseType]}</p><p><span className="text-muted">Cliente:</span> {item.customerName} · {item.customerPhone}</p><p><span className="text-muted">Cobertura:</span> {COVERAGE_LABELS[item.coverageStatus]}</p><p className="line-clamp-2"><span className="text-muted">Motivo:</span> {item.reportedIssue}</p></div><p className="mt-3 text-xs text-muted">Abierto {date(item.openedAt)}</p>
    </Link>)}</div>
  </div>;
}
