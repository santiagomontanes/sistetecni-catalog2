import type { SupabaseClient } from "@supabase/supabase-js";
import { RepositoryError } from "./errors";
import type { AdminAfterSalesCaseDetailDTO, AdminAfterSalesCaseEventDTO, AdminAfterSalesCaseListItemDTO, AfterSalesCaseAction, AfterSalesCaseStatus, AfterSalesCaseType, AfterSalesCoverageStatus, AfterSalesResolutionType } from "../afterSalesAdmin/types";

interface CaseRow {
  id:string; case_number:string; case_type:AfterSalesCaseType; status:AfterSalesCaseStatus;
  sale_id:string; sale_item_id:string; product_unit_id:string; customer_id:string|null;
  sale_number_snapshot:string; customer_name_snapshot:string; customer_document_snapshot:string; customer_phone_snapshot:string;
  product_name_snapshot:string; unit_code_snapshot:string; serial_number_snapshot:string|null;
  reported_issue:string; intake_condition:string|null; evidence_urls:string[]|null; diagnosis:string|null; resolution:string|null;
  resolution_type:AfterSalesResolutionType|null; estimated_cost_cop:number|null; final_cost_cop:number|null;
  warranty_expires_at:string|null; coverage_status:AfterSalesCoverageStatus; opened_at:string; closed_at:string|null; created_at:string; updated_at:string;
}
interface EventRow { id:string; event_type:string; from_status:string|null; to_status:string|null; note:string|null; cost_cop:number|null; created_at:string; }

const CASE_COLUMNS = "id,case_number,case_type,status,sale_id,sale_item_id,product_unit_id,customer_id,sale_number_snapshot,customer_name_snapshot,customer_document_snapshot,customer_phone_snapshot,product_name_snapshot,unit_code_snapshot,serial_number_snapshot,reported_issue,intake_condition,evidence_urls,diagnosis,resolution,resolution_type,estimated_cost_cop,final_cost_cop,warranty_expires_at,coverage_status,opened_at,closed_at,created_at,updated_at";

function listDto(r:CaseRow):AdminAfterSalesCaseListItemDTO { return { id:r.id, caseNumber:r.case_number, caseType:r.case_type, status:r.status, coverageStatus:r.coverage_status, customerName:r.customer_name_snapshot, customerPhone:r.customer_phone_snapshot, productName:r.product_name_snapshot, unitCode:r.unit_code_snapshot, serialNumber:r.serial_number_snapshot, reportedIssue:r.reported_issue, openedAt:r.opened_at, updatedAt:r.updated_at }; }
function eventDto(r:EventRow):AdminAfterSalesCaseEventDTO { return { id:r.id,eventType:r.event_type,fromStatus:r.from_status,toStatus:r.to_status,note:r.note,costCop:r.cost_cop===null?null:Number(r.cost_cop),createdAt:r.created_at }; }

export function createAfterSalesCasesRepository(client:SupabaseClient) {
  return {
    async open(input:{saleItemId:string;caseType:AfterSalesCaseType;reportedIssue:string;intakeCondition?:string;evidenceUrls?:string[]}) {
      const { data,error } = await client.rpc("erp_open_after_sales_case", { p_sale_item_id:input.saleItemId,p_case_type:input.caseType,p_reported_issue:input.reportedIssue,p_intake_condition:input.intakeCondition??null,p_evidence_urls:input.evidenceUrls??[] });
      if(error||typeof data!=="string") throw new RepositoryError("AfterSalesCasesRepository.open falló",error);
      return data;
    },
    async progress(input:{caseId:string;action:AfterSalesCaseAction;note?:string;diagnosis?:string;costCop?:number}) {
      const { data,error } = await client.rpc("erp_progress_after_sales_case", { p_case_id:input.caseId,p_action:input.action,p_note:input.note??null,p_diagnosis:input.diagnosis??null,p_cost_cop:input.costCop??null });
      if(error||typeof data!=="string") throw new RepositoryError("AfterSalesCasesRepository.progress falló",error);
      return data;
    },
    async list(input:{status?:AfterSalesCaseStatus;query?:string;limit?:number}) {
      let q = client.from("after_sales_cases").select(CASE_COLUMNS).order("created_at",{ascending:false}).limit(input.limit??100);
      if(input.status) q=q.eq("status",input.status);
      const query=(input.query??"").replace(/[%,()]/g,"").trim();
      if(query) q=q.or(`case_number.ilike.%${query}%,customer_name_snapshot.ilike.%${query}%,customer_document_snapshot.ilike.%${query}%,customer_phone_snapshot.ilike.%${query}%,unit_code_snapshot.ilike.%${query}%,serial_number_snapshot.ilike.%${query}%`);
      const {data,error}=await q.returns<CaseRow[]>();
      if(error) throw new RepositoryError("AfterSalesCasesRepository.list falló",error);
      return (data??[]).map(listDto);
    },
    async findById(id:string):Promise<AdminAfterSalesCaseDetailDTO|null> {
      const {data,error}=await client.from("after_sales_cases").select(CASE_COLUMNS).eq("id",id).maybeSingle<CaseRow>();
      if(error) throw new RepositoryError("AfterSalesCasesRepository.findById falló",error); if(!data) return null;
      const [{data:events,error:eventError},{data:unit,error:unitError}] = await Promise.all([
        client.from("after_sales_case_events").select("id,event_type,from_status,to_status,note,cost_cop,created_at").eq("case_id",id).order("created_at",{ascending:true}).returns<EventRow[]>(),
        client.from("product_units").select("status").eq("id",data.product_unit_id).single<{status:string}>()
      ]);
      if(eventError||unitError) throw new RepositoryError("AfterSalesCasesRepository.findById relaciones fallaron",eventError??unitError);
      return { ...listDto(data), saleId:data.sale_id,saleItemId:data.sale_item_id,productUnitId:data.product_unit_id,customerId:data.customer_id,saleNumber:data.sale_number_snapshot,customerDocument:data.customer_document_snapshot,intakeCondition:data.intake_condition,evidenceUrls:data.evidence_urls??[],diagnosis:data.diagnosis,resolution:data.resolution,resolutionType:data.resolution_type,estimatedCostCop:data.estimated_cost_cop===null?null:Number(data.estimated_cost_cop),finalCostCop:data.final_cost_cop===null?null:Number(data.final_cost_cop),warrantyExpiresAt:data.warranty_expires_at,closedAt:data.closed_at,unitStatus:unit.status,events:(events??[]).map(eventDto) };
    }
  };
}
