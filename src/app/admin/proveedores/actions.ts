"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/personalizadorAdmin/auth";
import { mapUnexpectedError } from "@/lib/personalizadorAdmin/errorMapping";
import type { AdminResult } from "@/lib/personalizadorAdmin/types";
import { createSuppliersRepository } from "@/lib/repositories/suppliers.repository";
import { RepositoryError } from "@/lib/repositories/errors";
import { createSupplierSchema, issuesFromPurchaseZod, supplierListSchema } from "@/lib/purchaseAdmin/validation";
import type { AdminSupplierDTO } from "@/lib/purchaseAdmin/types";

async function withAdmin<T>(accessToken:unknown,fn:(client:SupabaseClient)=>Promise<AdminResult<T>>):Promise<AdminResult<T>>{
  try{const {client}=await requireAdmin(accessToken);return await fn(client);}catch(err){return mapUnexpectedError(err);}
}
function causeText(err:unknown){if(!(err instanceof RepositoryError))return "";const c=err.cause as {message?:string;details?:string}|undefined;return `${c?.message??""} ${c?.details??""}`;}

export async function listSuppliers(payload:{accessToken:unknown;query?:unknown;limit?:unknown}):Promise<AdminResult<{items:AdminSupplierDTO[]}>>{
  return withAdmin(payload.accessToken,async(client)=>{
    const p=supplierListSchema.safeParse({query:typeof payload.query==="string"?payload.query:"",limit:typeof payload.limit==="number"?payload.limit:100});
    if(!p.success)return{ok:false,error:"VALIDATION_ERROR",issues:issuesFromPurchaseZod(p.error)};
    return{ok:true,data:{items:await createSuppliersRepository(client).list(p.data.query,p.data.limit)}};
  });
}

export async function createSupplier(payload:{accessToken:unknown;[key:string]:unknown}):Promise<AdminResult<AdminSupplierDTO>>{
  const {accessToken,...input}=payload;
  return withAdmin(accessToken,async(client)=>{
    const p=createSupplierSchema.safeParse(input);if(!p.success)return{ok:false,error:"VALIDATION_ERROR",issues:issuesFromPurchaseZod(p.error)};
    try{return{ok:true,data:await createSuppliersRepository(client).create(p.data)};}
    catch(err){if(/uq_suppliers_document_normalized|duplicate key/i.test(causeText(err)))return{ok:false,error:"VALIDATION_ERROR",issues:["Ya existe un proveedor con ese documento."]};throw err;}
  });
}
