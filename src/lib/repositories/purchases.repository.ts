import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminPurchaseDetailDTO, AdminPurchaseItemDTO, AdminPurchaseListItemDTO } from "@/lib/purchaseAdmin/types";
import { RepositoryError } from "./errors";

interface PurchaseRow {
  id:string; purchase_number:string; supplier_id:string; supplier_name_snapshot:string; supplier_document_snapshot:string|null;
  supplier_phone_snapshot:string|null; supplier_invoice_reference:string|null; purchase_date:string; status:"received"; item_count:number;
  merchandise_subtotal_cop:number; shared_costs_cop:number; total_cost_cop:number; notes:string|null; created_at:string;
}
interface PurchaseItemRow {
  id:string; product_id:string; product_unit_id:string; product_name_snapshot:string; unit_code_snapshot:string; serial_number_snapshot:string|null;
  base_cost_cop:number; allocated_extra_cost_cop:number; landed_cost_cop:number; sort_order:number; notes:string|null;
}
const PURCHASE_COLS="id,purchase_number,supplier_id,supplier_name_snapshot,supplier_document_snapshot,supplier_phone_snapshot,supplier_invoice_reference,purchase_date,status,item_count,merchandise_subtotal_cop,shared_costs_cop,total_cost_cop,notes,created_at";
const ITEM_COLS="id,product_id,product_unit_id,product_name_snapshot,unit_code_snapshot,serial_number_snapshot,base_cost_cop,allocated_extra_cost_cop,landed_cost_cop,sort_order,notes";
const mapList=(r:PurchaseRow):AdminPurchaseListItemDTO=>({id:r.id,purchaseNumber:r.purchase_number,supplierId:r.supplier_id,supplierName:r.supplier_name_snapshot,supplierInvoiceReference:r.supplier_invoice_reference,purchaseDate:r.purchase_date,status:r.status,itemCount:Number(r.item_count),merchandiseSubtotalCop:Number(r.merchandise_subtotal_cop),sharedCostsCop:Number(r.shared_costs_cop),totalCostCop:Number(r.total_cost_cop),createdAt:r.created_at});
const mapItem=(r:PurchaseItemRow):AdminPurchaseItemDTO=>({id:r.id,productId:r.product_id,productUnitId:r.product_unit_id,productName:r.product_name_snapshot,unitCode:r.unit_code_snapshot,serialNumber:r.serial_number_snapshot,baseCostCop:Number(r.base_cost_cop),allocatedExtraCostCop:Number(r.allocated_extra_cost_cop),landedCostCop:Number(r.landed_cost_cop),sortOrder:Number(r.sort_order),notes:r.notes});

export interface ReceivePurchaseUnitInput { productId:string; serialNumber?:string; baseCostCop:number; batteryHealthPercent?:number; storageHealthPercent?:number; specOverrides?:Record<string,unknown>; notes?:string; }
export interface ReceivePurchaseInput { supplierId:string; supplierInvoiceReference?:string; purchaseDate:string; sharedCostsCop:number; notes?:string; units:ReceivePurchaseUnitInput[]; }

export function createPurchasesRepository(client:SupabaseClient){
  return {
    async list(query="",limit=100):Promise<AdminPurchaseListItemDTO[]> {
      const {data,error}=await client.from("purchases").select(PURCHASE_COLS).order("created_at",{ascending:false}).limit(Math.min(Math.max(limit,1),200)).returns<PurchaseRow[]>();
      if(error) throw new RepositoryError("PurchasesRepository.list falló",error);
      const q=query.trim().toLowerCase();
      return (data??[]).map(mapList).filter(x=>!q||[x.purchaseNumber,x.supplierName,x.supplierInvoiceReference].some(v=>v?.toLowerCase().includes(q)));
    },
    async findById(id:string):Promise<AdminPurchaseDetailDTO|null> {
      const {data,error}=await client.from("purchases").select(PURCHASE_COLS).eq("id",id).maybeSingle<PurchaseRow>();
      if(error) throw new RepositoryError("PurchasesRepository.findById falló",error);
      if(!data) return null;
      const {data:items,error:itemError}=await client.from("purchase_items").select(ITEM_COLS).eq("purchase_id",id).order("sort_order",{ascending:true}).returns<PurchaseItemRow[]>();
      if(itemError) throw new RepositoryError("PurchasesRepository.findById items falló",itemError);
      return {...mapList(data),supplierDocument:data.supplier_document_snapshot,supplierPhone:data.supplier_phone_snapshot,notes:data.notes,items:(items??[]).map(mapItem)};
    },
    async receive(input:ReceivePurchaseInput):Promise<AdminPurchaseDetailDTO> {
      const {data,error}=await client.rpc("erp_receive_purchase_batch",{
        p_supplier_id:input.supplierId,p_supplier_invoice_reference:input.supplierInvoiceReference??null,p_purchase_date:input.purchaseDate,
        p_shared_costs_cop:input.sharedCostsCop,p_notes:input.notes??null,p_units:input.units.map(u=>({productId:u.productId,serialNumber:u.serialNumber??null,baseCostCop:u.baseCostCop,batteryHealthPercent:u.batteryHealthPercent??null,storageHealthPercent:u.storageHealthPercent??null,specOverrides:u.specOverrides??{},notes:u.notes??null})),
      });
      if(error||typeof data!=="string") throw new RepositoryError("PurchasesRepository.receive: RPC erp_receive_purchase_batch falló",error);
      const created=await this.findById(data);
      if(!created) throw new RepositoryError("PurchasesRepository.receive: compra no pudo releerse");
      return created;
    },
  };
}
