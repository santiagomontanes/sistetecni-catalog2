"use client";
import {useEffect,useRef,useState,type MutableRefObject} from "react";
import {callAdminAction} from "@/lib/callAdminAction";
import {stationAction} from "@/app/admin/estacion/actions";
type Link={id:string;token:string};
export default function StationLink({unitId,onSelect,onRefresh,onScan,sender}:{unitId:string|null;onSelect:(id:string)=>void;onRefresh:()=>void;onScan?:(value:string)=>void;sender?:MutableRefObject<((value:string)=>void)|null>}){
 const [link,setLink]=useState<Link|null>(null),[station,setStation]=useState("Estación"),[code,setCode]=useState(""),[pairCode,setPairCode]=useState(""),[status,setStatus]=useState("Sin vincular"),[busy,setBusy]=useState(false);
 const current=useRef(unitId),select=useRef(onSelect),refresh=useRef(onRefresh),last=useRef<string|null>(null),seen=useRef<number|null>(null),role=useRef<string|null>(null),scanCb=useRef(onScan);
 scanCb.current=onScan;
 current.current=unitId;select.current=onSelect;refresh.current=onRefresh;
 async function action(input:unknown){setBusy(true);try{const r=await callAdminAction(stationAction,{input});if(!r.ok){setStatus(r.error);return false;}if(r.data.token){setLink({id:r.data.id,token:r.data.token});setPairCode(r.data.code??"");last.current=null;seen.current=null;}setStatus("Conectado · guardado");return true;}catch{setStatus("Error de conexión. Reintenta.");return false;}finally{setBusy(false);}}
 useEffect(()=>{if(!link)return;let stopped=false;let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{try{const r=await callAdminAction(stationAction,{input:{action:"read",...link}});if(stopped)return;if(!r.ok){setStatus(r.error);return;}setStatus(r.data.paired?"Conectado · sincronizado":"Esperando celular · código válido 5 minutos");
   role.current=r.data.role??null;const seq=r.data.scanSeq??0;
   if(seen.current===null)seen.current=seq;
   else if(seq>seen.current){seen.current=seq;if(r.data.role==="desktop"&&r.data.scan)scanCb.current?.(r.data.scan);}
   const stamp=`${r.data.unitId}:${r.data.unitVersion}`;
   if(r.data.unitId&&last.current!==stamp){if(current.current!==r.data.unitId)select.current(r.data.unitId);else if(last.current!==null)refresh.current();last.current=stamp;}
  }catch{if(!stopped)setStatus("Sin conexión · recuperando estado del servidor…");}finally{if(!stopped)timer=setTimeout(poll,2000);}};
  void poll();return()=>{stopped=true;clearTimeout(timer);};
 },[link]);
 useEffect(()=>{if(!sender)return;
  sender.current=link?(value:string)=>{if(role.current!=="mobile")return;void callAdminAction(stationAction,{input:{action:"scan",...link,value}}).then(r=>{if(r.ok&&r.data.scanSeq!==undefined)seen.current=Math.max(seen.current??0,r.data.scanSeq);else if(!r.ok)setStatus(r.error);}).catch(()=>setStatus("No se envió la lectura al computador. Reintenta."));}:null;
  return()=>{sender.current=null;};},[link,sender]);
 useEffect(()=>{if(!link||!unitId)return;let live=true;void callAdminAction(stationAction,{input:{action:"select",...link,unitId}}).then(r=>{if(live&&!r.ok)setStatus(r.error);}).catch(()=>{if(live)setStatus("No se sincronizó la selección. Reintenta abriendo la ficha.");});return()=>{live=false;};},[link,unitId]);
 return <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer font-medium">Celular y estación · {status}</summary><p className="my-2 text-sm text-muted">Inicia sesión con tu cuenta en ambos dispositivos. El vínculo dura 8 horas y pertenece a estas pestañas; al recargarlas debes vincularlas de nuevo.</p>
 {!link?<div className="flex flex-wrap gap-2"><input aria-label="Nombre de estación" value={station} onChange={e=>setStation(e.target.value)} className="rounded border p-2"/><button disabled={busy} onClick={()=>void action({action:"create",station})} className="rounded bg-primary p-2 text-white">Generar código en computador</button><input aria-label="Código temporal" inputMode="numeric" autoComplete="one-time-code" maxLength={16} value={code} onChange={e=>setCode(e.target.value.trim())} placeholder="Código de 5 dígitos" className="rounded border p-2"/><button disabled={busy} onClick={()=>void action({action:"join",code})} className="rounded border p-2">Vincular este celular</button></div>:<div className="flex flex-wrap items-center gap-3">{pairCode&&<strong className="select-all font-mono text-2xl tracking-[0.3em]">{pairCode}</strong>}<button disabled={busy} className="rounded border p-2" onClick={async()=>{if(await action({action:"revoke",...link})){setLink(null);setPairCode("");setStatus("Vínculo revocado");}}}>Revocar vínculo</button></div>}
 <p role="status" className="mt-2 text-xs">{status}</p></details>;
}
