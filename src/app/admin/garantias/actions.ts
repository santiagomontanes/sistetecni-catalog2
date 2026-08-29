"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/personalizadorAdmin/auth";
import { mapUnexpectedError } from "@/lib/personalizadorAdmin/errorMapping";
import type { AdminResult } from "@/lib/personalizadorAdmin/types";
import { createAfterSalesCasesRepository } from "@/lib/repositories/afterSalesCases.repository";
import { RepositoryError } from "@/lib/repositories/errors";
import { afterSalesCaseIdSchema, afterSalesListSchema, afterSalesOriginIdSchema, issuesFromAfterSalesZod, openAfterSalesCaseSchema, progressAfterSalesCaseSchema } from "@/lib/afterSalesAdmin/validation";
import type { AdminAfterSalesCaseDetailDTO, AdminAfterSalesCaseListItemDTO, AdminAfterSalesOriginDTO } from "@/lib/afterSalesAdmin/types";

async function withAdmin<T>(accessToken:unknown, fn:(client:SupabaseClient)=>Promise<AdminResult<T>>):Promise<AdminResult<T>> {
  try { const {client}=await requireAdmin(accessToken); return await fn(client); }
  catch(err){ return mapUnexpectedError(err); }
}

function repositoryText(err:unknown):string {
  if(!(err instanceof RepositoryError)) return "";
  const cause=err.cause as {message?:string;details?:string;hint?:string}|undefined;
  return `${cause?.message??""} ${cause?.details??""} ${cause?.hint??""}`;
}

function addMonthsClampedUtc(iso:string,months:number):string {
  const source=new Date(iso);
  const day=source.getUTCDate();
  const targetMonth=source.getUTCMonth()+months;
  const targetYear=source.getUTCFullYear()+Math.floor(targetMonth/12);
  const normalizedMonth=((targetMonth%12)+12)%12;
  const lastDay=new Date(Date.UTC(targetYear,normalizedMonth+1,0)).getUTCDate();
  const result=new Date(source);
  result.setUTCFullYear(targetYear,normalizedMonth,Math.min(day,lastDay));
  return result.toISOString();
}

export async function listAfterSalesCases(payload:{accessToken:unknown;status?:unknown;query?:unknown;limit?:unknown}):Promise<AdminResult<{items:AdminAfterSalesCaseListItemDTO[]}>> {
  return withAdmin(payload.accessToken,async(client)=>{
    const parsed=afterSalesListSchema.safeParse({status:payload.status||undefined,query:typeof payload.query==="string"?payload.query:"",limit:typeof payload.limit==="number"?payload.limit:100});
    if(!parsed.success) return {ok:false,error:"VALIDATION_ERROR",issues:issuesFromAfterSalesZod(parsed.error)};
    const items=await createAfterSalesCasesRepository(client).list(parsed.data); return {ok:true,data:{items}};
  });
}

export async function getAfterSalesCase(payload:{accessToken:unknown;caseId:unknown}):Promise<AdminResult<AdminAfterSalesCaseDetailDTO>> {
  return withAdmin(payload.accessToken,async(client)=>{
    const parsed=afterSalesCaseIdSchema.safeParse(payload.caseId); if(!parsed.success) return {ok:false,error:"VALIDATION_ERROR",issues:issuesFromAfterSalesZod(parsed.error)};
    const item=await createAfterSalesCasesRepository(client).findById(parsed.data); if(!item) return {ok:false,error:"NOT_FOUND"}; return {ok:true,data:item};
  });
}

export async function getAfterSalesOrigin(payload:{accessToken:unknown;saleItemId:unknown}):Promise<AdminResult<AdminAfterSalesOriginDTO>> {
  return withAdmin(payload.accessToken,async(client)=>{
    const parsed=afterSalesOriginIdSchema.safeParse(payload.saleItemId); if(!parsed.success) return {ok:false,error:"VALIDATION_ERROR",issues:issuesFromAfterSalesZod(parsed.error)};
    const {data:item,error:itemError}=await client.from("sale_items").select("id,sale_id,product_unit_id,product_name").eq("id",parsed.data).maybeSingle<{id:string;sale_id:string;product_unit_id:string|null;product_name:string}>();
    if(itemError) throw new RepositoryError("getAfterSalesOrigin sale_item falló",itemError); if(!item?.product_unit_id) return {ok:false,error:"NOT_FOUND"};
    const [{data:sale,error:saleError},{data:unit,error:unitError},{count,error:caseError}]=await Promise.all([
      client.from("sales").select("id,sale_number,created_at,warranty_months,customer_name,customer_document,customer_phone").eq("id",item.sale_id).single<{id:string;sale_number:string;created_at:string;warranty_months:number;customer_name:string;customer_document:string;customer_phone:string}>(),
      client.from("product_units").select("id,unit_code,serial_number,status").eq("id",item.product_unit_id).single<{id:string;unit_code:string;serial_number:string|null;status:string}>(),
      client.from("after_sales_cases").select("id",{count:"exact",head:true}).eq("product_unit_id",item.product_unit_id).in("status",["open","diagnosing","repair","waiting_customer"])
    ]);
    if(saleError||unitError||caseError) throw new RepositoryError("getAfterSalesOrigin relaciones fallaron",saleError??unitError??caseError);
    const warrantyExpiresAt=sale.warranty_months>0?addMonthsClampedUtc(sale.created_at,sale.warranty_months):null;
    return {ok:true,data:{saleItemId:item.id,saleId:sale.id,saleNumber:sale.sale_number,saleCreatedAt:sale.created_at,warrantyMonths:sale.warranty_months,warrantyExpiresAt,customerName:sale.customer_name,customerDocument:sale.customer_document,customerPhone:sale.customer_phone,productUnitId:unit.id,productName:item.product_name,unitCode:unit.unit_code,serialNumber:unit.serial_number,unitStatus:unit.status,hasOpenCase:(count??0)>0}};
  });
}

export async function openAfterSalesCase(payload:{accessToken:unknown;[key:string]:unknown}):Promise<AdminResult<AdminAfterSalesCaseDetailDTO>> {
  const {accessToken,...input}=payload; return withAdmin(accessToken,async(client)=>{
    const parsed=openAfterSalesCaseSchema.safeParse(input); if(!parsed.success) return {ok:false,error:"VALIDATION_ERROR",issues:issuesFromAfterSalesZod(parsed.error)};
    const repo=createAfterSalesCasesRepository(client);
    try {
      const id=await repo.open(parsed.data); const detail=await repo.findById(id); if(!detail) return {ok:false,error:"NOT_FOUND"}; return {ok:true,data:detail};
    } catch(err) {
      const text=repositoryText(err);
      if(/open_case_already_exists/i.test(text)) return {ok:false,error:"VALIDATION_ERROR",issues:["Esta unidad ya tiene un caso posventa abierto."]};
      if(/unit_must_be_sold_to_open_case/i.test(text)) return {ok:false,error:"VALIDATION_ERROR",issues:["La unidad ya no está en estado Vendido. Actualiza la venta antes de abrir el caso."]};
      if(/sale_item_unit_required/i.test(text)) return {ok:false,error:"VALIDATION_ERROR",issues:["Este ítem no está asociado a una unidad física STU."]};
      throw err;
    }
  });
}

export async function progressAfterSalesCase(payload:{accessToken:unknown;[key:string]:unknown}):Promise<AdminResult<AdminAfterSalesCaseDetailDTO>> {
  const {accessToken,...input}=payload; return withAdmin(accessToken,async(client)=>{
    const parsed=progressAfterSalesCaseSchema.safeParse(input); if(!parsed.success) return {ok:false,error:"VALIDATION_ERROR",issues:issuesFromAfterSalesZod(parsed.error)};
    const repo=createAfterSalesCasesRepository(client);
    try {
      const id=await repo.progress(parsed.data); const detail=await repo.findById(id); if(!detail) return {ok:false,error:"NOT_FOUND"}; return {ok:true,data:detail};
    } catch(err) {
      const text=repositoryText(err);
      if(/case_already_terminal/i.test(text)) return {ok:false,error:"VALIDATION_ERROR",issues:["Este caso ya está cerrado o cancelado."]};
      if(/invalid_case_action|unit_not_ready|unit_not_returnable|unit_not_retirable|case_cannot_cancel|unit_not_cancelable|return_case_must_be/i.test(text)) return {ok:false,error:"VALIDATION_ERROR",issues:["Esa acción ya no corresponde al estado actual del caso o del equipo. Recarga el expediente."]};
      throw err;
    }
  });
}
