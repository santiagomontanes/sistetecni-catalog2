"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/personalizadorAdmin/auth";
import { mapUnexpectedError } from "@/lib/personalizadorAdmin/errorMapping";
import type { AdminResult } from "@/lib/personalizadorAdmin/types";
import { createPurchasesRepository } from "@/lib/repositories/purchases.repository";
import { issuesFromPurchaseZod, purchaseIdSchema, purchaseListSchema } from "@/lib/purchaseAdmin/validation";
import type { AdminPurchaseDetailDTO, AdminPurchaseListItemDTO } from "@/lib/purchaseAdmin/types";

async function withAdmin<T>(accessToken:unknown,fn:(client:SupabaseClient)=>Promise<AdminResult<T>>):Promise<AdminResult<T>>{
  try{const {client}=await requireAdmin(accessToken);return await fn(client);}catch(err){return mapUnexpectedError(err);}
}

export async function listPurchases(payload:{accessToken:unknown;query?:unknown;limit?:unknown}):Promise<AdminResult<{items:AdminPurchaseListItemDTO[]}>>{
  return withAdmin(payload.accessToken,async(client)=>{
    const p=purchaseListSchema.safeParse({query:typeof payload.query==="string"?payload.query:"",limit:typeof payload.limit==="number"?payload.limit:100});
    if(!p.success)return{ok:false,error:"VALIDATION_ERROR",issues:issuesFromPurchaseZod(p.error)};
    return{ok:true,data:{items:await createPurchasesRepository(client).list(p.data.query,p.data.limit)}};
  });
}

export async function getPurchase(payload:{accessToken:unknown;purchaseId:unknown}):Promise<AdminResult<AdminPurchaseDetailDTO>>{
  return withAdmin(payload.accessToken,async(client)=>{
    const p=purchaseIdSchema.safeParse(payload.purchaseId);if(!p.success)return{ok:false,error:"VALIDATION_ERROR",issues:issuesFromPurchaseZod(p.error)};
    const item=await createPurchasesRepository(client).findById(p.data);return item?{ok:true,data:item}:{ok:false,error:"NOT_FOUND"};
  });
}
