"use server";
import {requireErpPermission} from "@/lib/erpAuth/auth";
import {reportSchema} from "@/lib/adminPhase2/validation";
import type {OperationalReport} from "@/lib/operations/report";
export async function getOperationalReport(payload:{accessToken:unknown;from:unknown;to:unknown;stalledDays:number}){
 try{
  const range=reportSchema.parse({from:payload.from,to:payload.to});
  if(!Number.isInteger(payload.stalledDays)||payload.stalledDays<1||payload.stalledDays>365)throw new Error("range");
  const {client}=await requireErpPermission(payload.accessToken,"reports.view");
  const {data,error}=await client.rpc("erp_operational_report",{p_from:range.from,p_to:range.to,p_stalled_days:payload.stalledDays});
  if(error)throw error;
  return {ok:true as const,data:data as OperationalReport};
 }catch{return {ok:false as const,error:"No se pudo cargar el reporte operativo. Compruebe permisos y migraciones del módulo."};}
}
