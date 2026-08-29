import type {SupabaseClient} from "@supabase/supabase-js";
import {RepositoryError} from "./errors";
import {allocateIntegerAmount,safeMarginPercent} from "@/lib/profitabilityAdmin/allocation";
import type {AdminCostEntryDTO,AdminProfitabilityDashboardDTO,AdminProfitabilitySaleDTO,AdminUnitProfitabilityDTO,CostCategory,CostEntryKind} from "@/lib/profitabilityAdmin/types";
import type {ProductUnitStatus} from "@/types/erp";

type SaleRow={id:string;sale_number:string;created_at:string|null;customer_name:string;subtotal_cop:number;discount_cop:number;total_cop:number};
type ItemRow={id:string;sale_id:string;item_type:"catalog"|"manual";product_unit_id:string|null;subtotal_cop:number;sort_order:number};
type UnitRow={id:string;unit_code:string;serial_number:string|null;status:ProductUnitStatus;product_id:string;acquisition_cost_cop:number|null;purchase_id:string|null;sold_at:string|null};
type ProductRow={id:string;title:string};
type PurchaseRow={id:string;purchase_number:string;supplier_name_snapshot:string};
type CostRow={id:string;cost_number:string;entry_kind:CostEntryKind;category:CostCategory;product_unit_id:string|null;sale_id:string|null;description:string;amount_cop:number;incurred_at:string;reference_type:string|null;reference_id:string|null;reversal_of_id:string|null;created_at:string};

const COST_COLS="id,cost_number,entry_kind,category,product_unit_id,sale_id,description,amount_cop,incurred_at,reference_type,reference_id,reversal_of_id,created_at";
function n(v:number|null|undefined){return Number(v??0);}
function mapCost(row:CostRow,reversed:Set<string>):AdminCostEntryDTO{return{id:row.id,costNumber:row.cost_number,entryKind:row.entry_kind,category:row.category,productUnitId:row.product_unit_id,saleId:row.sale_id,description:row.description,amountCop:n(row.amount_cop),incurredAt:row.incurred_at,referenceType:row.reference_type,referenceId:row.reference_id,reversalOfId:row.reversal_of_id,createdAt:row.created_at,reversed:reversed.has(row.id)};}
function sumCosts(rows:CostRow[]){return rows.reduce((s,r)=>s+n(r.amount_cop),0);}

export interface ProfitabilityRepository{listDashboard(limit?:number):Promise<AdminProfitabilityDashboardDTO>;findUnit(unitId:string):Promise<AdminUnitProfitabilityDTO|null>;}
export function createProfitabilityRepository(client:SupabaseClient):ProfitabilityRepository{return{
  async listDashboard(limit=100){
    const {data:sales,error:salesError}=await client.from("sales").select("id,sale_number,created_at,customer_name,subtotal_cop,discount_cop,total_cop").order("created_at",{ascending:false}).limit(limit).returns<SaleRow[]>();
    if(salesError)throw new RepositoryError("profitability.list sales falló",salesError);
    const saleRows=sales??[];if(!saleRows.length)return{summary:{saleCount:0,completeSaleCount:0,reviewSaleCount:0,revenueCop:0,knownCostCop:0,knownProfitCop:0,completeRevenueCop:0,completeCostCop:0,completeProfitCop:0},sales:[]};
    const saleIds=saleRows.map(s=>s.id);
    const {data:items,error:itemsError}=await client.from("sale_items").select("id,sale_id,item_type,product_unit_id,subtotal_cop,sort_order").in("sale_id",saleIds).order("sort_order",{ascending:true}).returns<ItemRow[]>();
    if(itemsError)throw new RepositoryError("profitability.list items falló",itemsError);
    const itemRows=items??[];const unitIds=[...new Set(itemRows.map(i=>i.product_unit_id).filter((x):x is string=>Boolean(x)))];
    let units:UnitRow[]=[];if(unitIds.length){const q=await client.from("product_units").select("id,unit_code,serial_number,status,product_id,acquisition_cost_cop,purchase_id,sold_at").in("id",unitIds).returns<UnitRow[]>();if(q.error)throw new RepositoryError("profitability.list units falló",q.error);units=q.data??[];}
    let costs:CostRow[]=[];const orParts=[`sale_id.in.(${saleIds.join(",")})`,...(unitIds.length?[`product_unit_id.in.(${unitIds.join(",")})`]:[])];const cq=await client.from("cost_entries").select(COST_COLS).or(orParts.join(",")).returns<CostRow[]>();if(cq.error)throw new RepositoryError("profitability.list costs falló",cq.error);costs=cq.data??[];
    const reversedIds=new Set(costs.filter(c=>c.reversal_of_id).map(c=>c.reversal_of_id!));
    const unitMap=new Map(units.map(u=>[u.id,u]));const itemsBySale=new Map<string,ItemRow[]>();for(const i of itemRows){const a=itemsBySale.get(i.sale_id)??[];a.push(i);itemsBySale.set(i.sale_id,a);}
    const result:AdminProfitabilitySaleDTO[]=saleRows.map(s=>{
      const its=(itemsBySale.get(s.id)??[]).sort((a,b)=>a.sort_order-b.sort_order);const physical=its.filter(i=>i.product_unit_id);const manual=its.filter(i=>i.item_type==="manual");
      const acquisition=physical.reduce((sum,i)=>sum+(unitMap.get(i.product_unit_id!)?.acquisition_cost_cop==null?0:n(unitMap.get(i.product_unit_id!)?.acquisition_cost_cop)),0);
      const missing=physical.some(i=>unitMap.get(i.product_unit_id!)?.acquisition_cost_cop==null);
      const unitSet=new Set(physical.map(i=>i.product_unit_id!));const unitExtras=sumCosts(costs.filter(c=>c.product_unit_id&&unitSet.has(c.product_unit_id)));const saleRowsCost=costs.filter(c=>c.sale_id===s.id);const saleCosts=sumCosts(saleRowsCost);const known=acquisition+unitExtras+saleCosts;const revenue=n(s.total_cop);const profit=revenue-known;
      const costingStatus=missing?"missing_acquisition_cost":manual.length?"manual_items_review":"complete";
      const refs=physical.map(i=>unitMap.get(i.product_unit_id!)).filter((u):u is UnitRow=>Boolean(u)).map(u=>({unitId:u.id,unitCode:u.unit_code,serialNumber:u.serial_number}));
      return{saleId:s.id,saleNumber:s.sale_number,createdAt:s.created_at,customerName:s.customer_name,revenueCop:revenue,acquisitionCostCop:acquisition,unitExtraCostsCop:unitExtras,saleCostsCop:saleCosts,knownCostCop:known,knownProfitCop:profit,marginPercent:safeMarginPercent(profit,revenue),physicalItemCount:physical.length,manualItemCount:manual.length,costingStatus,units:refs,saleCostEntries:saleRowsCost.map(c=>mapCost(c,reversedIds))};
    });
    const complete=result.filter(x=>x.costingStatus==="complete");return{summary:{saleCount:result.length,completeSaleCount:complete.length,reviewSaleCount:result.length-complete.length,revenueCop:result.reduce((s,x)=>s+x.revenueCop,0),knownCostCop:result.reduce((s,x)=>s+x.knownCostCop,0),knownProfitCop:result.reduce((s,x)=>s+x.knownProfitCop,0),completeRevenueCop:complete.reduce((s,x)=>s+x.revenueCop,0),completeCostCop:complete.reduce((s,x)=>s+x.knownCostCop,0),completeProfitCop:complete.reduce((s,x)=>s+x.knownProfitCop,0)},sales:result};
  },
  async findUnit(unitId){
    const uq=await client.from("product_units").select("id,unit_code,serial_number,status,product_id,acquisition_cost_cop,purchase_id,sold_at").eq("id",unitId).maybeSingle<UnitRow>();if(uq.error)throw new RepositoryError("profitability.unit falló",uq.error);if(!uq.data)return null;const unit=uq.data;
    const [pq,puq,siq,costq]=await Promise.all([
      client.from("products").select("id,title").eq("id",unit.product_id).maybeSingle<ProductRow>(),
      unit.purchase_id?client.from("purchases").select("id,purchase_number,supplier_name_snapshot").eq("id",unit.purchase_id).maybeSingle<PurchaseRow>():Promise.resolve({data:null,error:null}),
      client.from("sale_items").select("id,sale_id,item_type,product_unit_id,subtotal_cop,sort_order").eq("product_unit_id",unit.id).maybeSingle<ItemRow>(),
      client.from("cost_entries").select(COST_COLS).eq("product_unit_id",unit.id).order("incurred_at",{ascending:true}).returns<CostRow[]>(),
    ]);
    if(pq.error||puq.error||siq.error||costq.error)throw new RepositoryError("profitability.unit relaciones fallaron",pq.error??puq.error??siq.error??costq.error);
    const unitCosts=costq.data??[];const reversed=new Set(unitCosts.filter(c=>c.reversal_of_id).map(c=>c.reversal_of_id!));let sale:SaleRow|null=null;let allItems:ItemRow[]=[];let saleCosts:CostRow[]=[];
    if(siq.data){const sq=await client.from("sales").select("id,sale_number,created_at,customer_name,subtotal_cop,discount_cop,total_cop").eq("id",siq.data.sale_id).single<SaleRow>();if(sq.error)throw new RepositoryError("profitability.unit sale falló",sq.error);sale=sq.data;const iq=await client.from("sale_items").select("id,sale_id,item_type,product_unit_id,subtotal_cop,sort_order").eq("sale_id",sale.id).order("sort_order",{ascending:true}).returns<ItemRow[]>();if(iq.error)throw new RepositoryError("profitability.unit sale_items falló",iq.error);allItems=iq.data??[];const scq=await client.from("cost_entries").select(COST_COLS).eq("sale_id",sale.id).returns<CostRow[]>();if(scq.error)throw new RepositoryError("profitability.unit sale_costs falló",scq.error);saleCosts=scq.data??[];}
    let gross:number|null=null,allocatedDiscount=0,netRevenue:number|null=null,allocatedSaleCosts=0;
    if(sale&&siq.data){const weights=allItems.map(i=>n(i.subtotal_cop));const discounts=allocateIntegerAmount(n(sale.discount_cop),weights);const idx=allItems.findIndex(i=>i.id===siq.data!.id);gross=n(siq.data.subtotal_cop);allocatedDiscount=idx>=0?discounts[idx]:0;netRevenue=gross-allocatedDiscount;const netWeights=allItems.map((i,j)=>n(i.subtotal_cop)-discounts[j]);const saleCostTotal=sumCosts(saleCosts);const costAlloc=allocateIntegerAmount(Math.max(0,saleCostTotal),netWeights);allocatedSaleCosts=idx>=0?costAlloc[idx]:0;}
    const soldMs=unit.sold_at?new Date(unit.sold_at).getTime():null;const pre=unitCosts.filter(c=>soldMs===null||new Date(c.incurred_at).getTime()<=soldMs).reduce((s,c)=>s+n(c.amount_cop),0);const post=soldMs===null?0:unitCosts.filter(c=>new Date(c.incurred_at).getTime()>soldMs).reduce((s,c)=>s+n(c.amount_cop),0);const extras=pre+post;const acquisition=unit.acquisition_cost_cop==null?null:n(unit.acquisition_cost_cop);const totalKnown=acquisition==null?null:acquisition+extras+allocatedSaleCosts;const profit=netRevenue==null||totalKnown==null?null:netRevenue-totalKnown;
    return{unitId:unit.id,unitCode:unit.unit_code,serialNumber:unit.serial_number,status:unit.status,productId:unit.product_id,productName:pq.data?.title??"Producto no disponible",acquisitionCostCop:acquisition,purchaseId:unit.purchase_id,purchaseNumber:(puq.data as PurchaseRow|null)?.purchase_number??null,supplierName:(puq.data as PurchaseRow|null)?.supplier_name_snapshot??null,soldAt:unit.sold_at,saleId:sale?.id??null,saleNumber:sale?.sale_number??null,saleItemId:siq.data?.id??null,saleGrossRevenueCop:gross,allocatedDiscountCop:allocatedDiscount,netRevenueCop:netRevenue,allocatedSaleCostsCop:allocatedSaleCosts,preSaleExtraCostsCop:pre,postSaleExtraCostsCop:post,totalUnitExtraCostsCop:extras,totalKnownCostCop:totalKnown,currentProfitCop:profit,marginPercent:profit==null||netRevenue==null?null:safeMarginPercent(profit,netRevenue),costingStatus:!sale?"unsold":acquisition==null?"missing_acquisition_cost":"complete",costEntries:unitCosts.map(c=>mapCost(c,reversed))};
  }
};}
