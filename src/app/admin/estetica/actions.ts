"use server";
import {z} from "zod";
import {requireErpPermission} from "@/lib/erpAuth/auth";
const command=z.discriminatedUnion("action",[
 z.object({action:z.literal("create"),productId:z.string().uuid(),baseColor:z.string().trim().min(1).max(60),texture:z.string().trim().min(1).max(100),name:z.string().trim().min(1).max(120)}),
 z.object({action:z.literal("assign"),unitId:z.string().uuid(),version:z.number().int().nonnegative(),finishId:z.string().uuid(),priceCop:z.string().regex(/^[1-9]\d{0,11}$/),confirmed:z.literal(true)}),
 z.object({action:z.literal("publish"),productId:z.string().uuid(),confirmed:z.literal(true)}),
]);
export async function finishAction(payload:{accessToken:unknown;input:unknown;requestId:string}){
 try{const data=command.parse(payload.input),key=z.string().uuid().parse(payload.requestId);const {client}=await requireErpPermission(payload.accessToken,"inventory.manage");const {data:result,error}=await client.rpc("erp_finish_command",{p_action:data.action,p_payload:data,p_key:key});
 if(error)return {ok:false as const,error:error.message.includes("version_conflict")?"La unidad cambió. Actualiza la ficha y revisa la configuración antes de guardar.":error.message.includes("available_units_require")?"Todas las unidades disponibles deben tener acabado, fotos y configuración validados antes de publicar.":error.message.includes("no_sellable")?"Primero completa los controles y habilita al menos una unidad para venta.":"No se guardó. Revisa permisos, acabado, fotos, precio y disponibilidad."};return {ok:true as const,data:result};
 }catch{return {ok:false as const,error:"Datos o sesión inválidos."};}
}
export async function finishRead(payload:{accessToken:unknown;unitId:string;query:string}){
 const {client}=await requireErpPermission(payload.accessToken,"inventory.read");const id=z.string().uuid().parse(payload.unitId);
 const {data,error}=await client.rpc("erp_finish_read",{p_unit:id,p_query:payload.query.slice(0,80)});if(error)throw new Error("No se pudo cargar estética.");return data;
}
