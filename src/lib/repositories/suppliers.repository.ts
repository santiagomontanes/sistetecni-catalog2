import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminSupplierDTO } from "@/lib/purchaseAdmin/types";
import { RepositoryError } from "./errors";

interface SupplierRow {
  id: string; name: string; document_type: string|null; document_number: string|null; contact_name: string|null;
  phone: string|null; email: string|null; address: string|null; city: string|null; notes: string|null;
  active: boolean; created_at: string|null;
}
const COLS = "id,name,document_type,document_number,contact_name,phone,email,address,city,notes,active,created_at";
const map = (r:SupplierRow):AdminSupplierDTO => ({ id:r.id,name:r.name,documentType:r.document_type,documentNumber:r.document_number,contactName:r.contact_name,phone:r.phone,email:r.email,address:r.address,city:r.city,notes:r.notes,active:r.active,createdAt:r.created_at });

export interface CreateSupplierInput { name:string; documentType?:string; documentNumber?:string; contactName?:string; phone?:string; email?:string; address?:string; city?:string; notes?:string; }

export function createSuppliersRepository(client:SupabaseClient) {
  return {
    async findById(id:string):Promise<AdminSupplierDTO|null> {
      const {data,error}=await client.from("suppliers").select(COLS).eq("id",id).maybeSingle<SupplierRow>();
      if(error) throw new RepositoryError("SuppliersRepository.findById falló",error);
      return data?map(data):null;
    },
    async list(query="",limit=100):Promise<AdminSupplierDTO[]> {
      const {data,error}=await client.from("suppliers").select(COLS).order("name",{ascending:true}).limit(Math.min(Math.max(limit,1),200)).returns<SupplierRow[]>();
      if(error) throw new RepositoryError("SuppliersRepository.list falló",error);
      const q=query.trim().toLowerCase();
      return (data??[]).map(map).filter(s=>!q||[s.name,s.documentNumber,s.contactName,s.phone,s.city].some(v=>v?.toLowerCase().includes(q)));
    },
    async create(input:CreateSupplierInput):Promise<AdminSupplierDTO> {
      const {data,error}=await client.rpc("erp_create_supplier",{
        p_name:input.name,p_document_type:input.documentType??null,p_document_number:input.documentNumber??null,
        p_contact_name:input.contactName??null,p_phone:input.phone??null,p_email:input.email??null,p_address:input.address??null,
        p_city:input.city??null,p_notes:input.notes??null,
      });
      if(error||typeof data!=="string") throw new RepositoryError("SuppliersRepository.create: RPC erp_create_supplier falló",error);
      const created=await this.findById(data);
      if(!created) throw new RepositoryError("SuppliersRepository.create: proveedor no pudo releerse");
      return created;
    },
  };
}
