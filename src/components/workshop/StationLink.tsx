"use client";
import {useEffect,useRef,useState} from "react";
import {callAdminAction} from "@/lib/callAdminAction";
import {stationAction} from "@/app/admin/estacion/actions";
type Link={id:string;token:string};
export default function StationLink({unitId,onSelect,onRefresh}:{unitId:string|null;onSelect:(id:string)=>void;onRefresh:()=>void}){
 const [link,setLink]=useState<Link|null>(null),[station,setStation]=useState("Estación"),[code,setCode]=useState(""),[pairCode,setPairCode]=useState(""),[status,setStatus]=useState("Sin vincular"),[busy,setBusy]=useState(false);
 const current=useRef(unitId),select=useRef(onSelect),refresh=useRef(onRefresh),last=useRef<string|null>(null);
 current.current=unitId;select.current=onSelect;refresh.current=onRefresh;
 async function action(input:unknown){setBusy(true);try{const r=await callAdminAction(stationAction,{input});if(!r.ok){setStatus(r.error);return false;}if(r.data.token){setLink({id:r.data.id,token:r.data.token});setPairCode(r.data.code??"");last.current=null;}setStatus("Conectado · guardado");return true;}catch{setStatus("Error de conexión. Reintenta.");return false;}finally{setBusy(false);}}
 useEffect(()=>{if(!link)return;let stopped=false;let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{try{const r=await callAdminAction(stationAction,{input:{action:"read",...link}});if(stopped)return;if(!r.ok){setStatus(r.error);return;}setStatus(r.data.paired?"Conectado · sincronizado":"Esperando celular · código válido 5 minutos");
   const stamp=`${r.data.unitId}:${r.data.unitVersion}`;
   if(r.data.unitId&&last.current!==stamp){if(current.current!==r.data.unitId)select.current(r.data.unitId);else if(last.current!==null)refresh.current();last.current=stamp;}
  }catch{if(!stopped)setStatus("Sin conexión · recuperando estado del servidor…");}finally{if(!stopped)timer=setTimeout(poll,2000);}};
  void poll();return()=>{stopped=true;clearTimeout(timer);};
 },[link]);
 useEffect(()=>{if(!link||!unitId)return;let live=true;void callAdminAction(stationAction,{input:{action:"select",...link,unitId}}).then(r=>{if(live&&!r.ok)setStatus(r.error);}).catch(()=>{if(live)setStatus("No se sincronizó la selección. Reintenta abriendo la ficha.");});return()=>{live=false;};},[link,unitId]);
 return <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer font-medium">Celular y estación · {status}</summary><p className="my-2 text-sm text-muted">Inicia sesión con tu cuenta en ambos dispositivos. El vínculo dura 8 horas y pertenece a estas pestañas; al recargarlas debes vincularlas de nuevo.</p>
 {!link?<div className="flex flex-wrap gap-2"><input aria-label="Nombre de estación" value={station} onChange={e=>setStation(e.target.value)} className="rounded border p-2"/><button disabled={busy} onClick={()=>void action({action:"create",station})} className="rounded bg-primary p-2 text-white">Generar código en computador</button><input aria-label="Código temporal" inputMode="numeric" autoComplete="one-time-code" maxLength={16} value={code} onChange={e=>setCode(e.target.value.trim())} placeholder="Código de 5 dígitos" className="rounded border p-2"/><button disabled={busy} onClick={()=>void action({action:"join",code})} className="rounded border p-2">Vincular este celular</button></div>:<div className="flex flex-wrap items-center gap-3">{pairCode&&<strong className="select-all font-mono text-2xl tracking-[0.3em]">{pairCode}</strong>}<button disabled={busy} className="rounded border p-2" onClick={async()=>{if(await action({action:"revoke",...link})){setLink(null);setPairCode("");setStatus("Vínculo revocado");}}}>Revocar vínculo</button></div>}
 <p role="status" className="mt-2 text-xs">{status}</p></details>;
}
