"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { callAdminAction } from "@/lib/callAdminAction";
import { listPurchases } from "@/app/admin/compras/actions";
import { formatCOP } from "@/lib/personalizadorUi";
import type { AdminPurchaseListItemDTO } from "@/lib/purchaseAdmin/types";

export default function ComprasPage(){
  const [items,setItems]=useState<AdminPurchaseListItemDTO[]>([]);const [query,setQuery]=useState("");const [loading,setLoading]=useState(true);const [error,setError]=useState("");
  const load=useCallback(async(q="")=>{try{setLoading(true);setError("");const r=await callAdminAction(listPurchases,{query:q,limit:150});if(!r.ok){setError("No fue posible cargar las compras.");return;}setItems(r.data.items);}catch{setError("No fue posible cargar las compras.");}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  return <div className="space-y-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-primary">ERP · Abastecimiento</p><h1 className="text-2xl font-bold text-text">Compras</h1><p className="mt-1 text-sm text-muted">Cada COMP agrupa el lote recibido y congela el costo real de adquisición de cada STU.</p></div><Link href="/admin/compras/nueva" className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white">+ Recibir compra</Link></div>
    {error?<p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>:null}
    <form onSubmit={e=>{e.preventDefault();void load(query);}} className="flex gap-2"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="COMP-, proveedor o factura" className="flex-1 rounded-xl border border-border px-4 py-3 text-sm"/><button className="rounded-xl border border-primary px-5 py-3 text-sm font-semibold text-primary">Buscar</button></form>
    {loading?<p className="text-sm text-muted">Cargando compras...</p>:null}{!loading&&items.length===0?<p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">Aún no hay compras registradas.</p>:null}
    <div className="grid gap-3 lg:grid-cols-2">{items.map(x=><Link key={x.id} href={`/admin/compras/${x.id}`} className="rounded-2xl border border-border bg-white p-5 transition hover:border-primary"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-bold text-primary">{x.purchaseNumber}</p><h2 className="mt-1 font-semibold text-text">{x.supplierName}</h2><p className="text-xs text-muted">{x.purchaseDate}{x.supplierInvoiceReference?` · Ref. ${x.supplierInvoiceReference}`:""}</p></div><span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">Recibida</span></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-surface p-2"><p className="text-[11px] text-muted">Equipos</p><p className="font-bold text-text">{x.itemCount}</p></div><div className="rounded-lg bg-surface p-2"><p className="text-[11px] text-muted">Gastos lote</p><p className="font-bold text-text">{formatCOP(x.sharedCostsCop)}</p></div><div className="rounded-lg bg-surface p-2"><p className="text-[11px] text-muted">Total</p><p className="font-bold text-primary">{formatCOP(x.totalCostCop)}</p></div></div></Link>)}</div>
  </div>;
}
