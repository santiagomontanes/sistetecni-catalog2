"use server";
import { z } from "zod";
import { requireErpPermission } from "@/lib/erpAuth/auth";
const input=z.discriminatedUnion("action",[
 z.object({action:z.literal("create"),station:z.string().trim().min(1).max(80)}),
 z.object({action:z.literal("join"),code:z.string().trim().regex(/^(\d{5}|[a-fA-F0-9]{16})$/)}),
 z.object({action:z.enum(["read","revoke"]),id:z.string().uuid(),token:z.string().regex(/^[a-f0-9]{64}$/)}),
 z.object({action:z.literal("scan"),id:z.string().uuid(),token:z.string().regex(/^[a-f0-9]{64}$/),value:z.string().trim().min(1).max(300)}),
 z.object({action:z.literal("select"),id:z.string().uuid(),token:z.string().regex(/^[a-f0-9]{64}$/),unitId:z.string().uuid()}),
]);
export async function stationAction(payload:{accessToken:unknown;input:unknown}){
 try {
  const data=input.parse(payload.input);
  const {client}=await requireErpPermission(payload.accessToken,"inventory.read");
  const {data:result,error}=await client.rpc("erp_station_link",{p_action:data.action,p_payload:data});
  if(error) return {ok:false as const,error:"El vínculo no está disponible, expiró o no pertenece a esta sesión. Vuelve a vincular los dispositivos."};
  return {ok:true as const,data:result as {id:string;token?:string;code?:string;pairUntil?:string;expiresAt:string;unitId?:string;paired?:boolean;revision?:number;unitVersion?:number;scan?:string|null;scanSeq?:number;role?:"desktop"|"mobile"}};
 }catch{return {ok:false as const,error:"No se pudo validar la sesión o los datos del vínculo."};}
}
