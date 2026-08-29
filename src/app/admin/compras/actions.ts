"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/personalizadorAdmin/auth";
import { mapUnexpectedError } from "@/lib/personalizadorAdmin/errorMapping";
import type { AdminResult } from "@/lib/personalizadorAdmin/types";
import { createPurchasesRepository } from "@/lib/repositories/purchases.repository";
import { createSuppliersRepository } from "@/lib/repositories/suppliers.repository";
import { createProductsRepository } from "@/lib/repositories/products.repository";
import { RepositoryError } from "@/lib/repositories/errors";
import { issuesFromPurchaseZod, purchaseIdSchema, purchaseListSchema, receivePurchaseBatchSchema, supplierListSchema } from "@/lib/purchaseAdmin/validation";
import { productSearchSchema } from "@/lib/erpAdmin/validation";
import type { AdminPurchaseDetailDTO, AdminPurchaseListItemDTO, AdminPurchaseProductDTO, AdminSupplierDTO } from "@/lib/purchaseAdmin/types";

async function withAdmin<T>(accessToken:unknown,fn:(client:SupabaseClient)=>Promise<AdminResult<T>>):Promise<AdminResult<T>>{
  try{const {client}=await requireAdmin(accessToken);return await fn(client);}catch(err){return mapUnexpectedError(err);}
}
function causeText(err:unknown){if(!(err instanceof RepositoryError))return "";const c=err.cause as {message?:string;details?:string}|undefined;return `${c?.message??""} ${c?.details??""}`;}

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

export async function listPurchaseSuppliers(payload:{accessToken:unknown;query?:unknown}):Promise<AdminResult<{items:AdminSupplierDTO[]}>>{
  return withAdmin(payload.accessToken,async(client)=>{
    const p=supplierListSchema.safeParse({query:typeof payload.query==="string"?payload.query:"",limit:200});
    if(!p.success)return{ok:false,error:"VALIDATION_ERROR",issues:issuesFromPurchaseZod(p.error)};
    const items=(await createSuppliersRepository(client).list(p.data.query,p.data.limit)).filter(x=>x.active);
    return{ok:true,data:{items}};
  });
}

export async function searchPurchaseProducts(payload:{accessToken:unknown;query:unknown}):Promise<AdminResult<{items:AdminPurchaseProductDTO[]}>>{
  return withAdmin(payload.accessToken,async(client)=>{
    const p=productSearchSchema.safeParse({query:payload.query});
    if(!p.success)return{ok:false,error:"VALIDATION_ERROR",issues:p.error.issues.map(x=>x.message)};
    const products=await createProductsRepository(client).search(p.data.query,20);
    return{ok:true,data:{items:products.map(x=>({id:x.id,title:x.title,brand:x.brand,model:x.model,cpu:x.cpu,ram:x.ram,storage:x.storage}))}};
  });
}

export async function receivePurchaseBatch(payload:{accessToken:unknown;[key:string]:unknown}):Promise<AdminResult<AdminPurchaseDetailDTO>>{
  const {accessToken,...input}=payload;
  return withAdmin(accessToken,async(client)=>{
    const p=receivePurchaseBatchSchema.safeParse(input);if(!p.success)return{ok:false,error:"VALIDATION_ERROR",issues:issuesFromPurchaseZod(p.error)};
    const specUnits=p.data.units.map(u=>{
      const specOverrides:Record<string,unknown>={};
      if(u.ramGb!==undefined)specOverrides.ramGb=u.ramGb;
      if(u.storageGb!==undefined)specOverrides.storageGb=u.storageGb;
      if(u.storageType!==undefined)specOverrides.storageType=u.storageType;
      if(u.conditionNotes!==undefined)specOverrides.conditionNotes=u.conditionNotes;
      return{productId:u.productId,serialNumber:u.serialNumber,baseCostCop:u.baseCostCop,batteryHealthPercent:u.batteryHealthPercent,storageHealthPercent:u.storageHealthPercent,specOverrides,notes:u.notes};
    });
    try{
      const created=await createPurchasesRepository(client).receive({supplierId:p.data.supplierId,supplierInvoiceReference:p.data.supplierInvoiceReference,purchaseDate:p.data.purchaseDate,sharedCostsCop:p.data.sharedCostsCop,notes:p.data.notes,units:specUnits});
      return{ok:true,data:created};
    }catch(err){
      const t=causeText(err);
      if(/uq_product_units_serial_normalized|duplicate key.*serial/i.test(t))return{ok:false,error:"VALIDATION_ERROR",issues:["Uno de los seriales del lote ya existe en Inventario."]};
      if(/supplier_not_found_or_inactive/i.test(t))return{ok:false,error:"VALIDATION_ERROR",issues:["El proveedor ya no existe o está inactivo."]};
      if(/product_not_found_at/i.test(t))return{ok:false,error:"VALIDATION_ERROR",issues:["Uno de los productos del lote ya no existe."]};
      throw err;
    }
  });
}
