import { NextResponse } from "next/server";
import {z} from "zod";
import {randomUUID} from "node:crypto";
import {requireErpPermission} from "@/lib/erpAuth/auth";
import {getAdminClient} from "@/supabase/admin";
import {imageKind} from "@/lib/operations/image";
import {boundedFormData} from "@/lib/operations/upload";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store"};
function token(r:Request){return r.headers.get("authorization")?.replace(/^Bearer /,"");}
export async function GET(request:Request){
 try{const {client}=await requireErpPermission(token(request),"inventory.read");const id=z.string().uuid().parse(new URL(request.url).searchParams.get("unit"));
 const {data,error}=await client.from("erp_unit_photos").select("id,path,created_at,context").eq("unit_id",id).order("created_at",{ascending:false}).limit(100);
 if(error)throw error;
 const admin=getAdminClient();const photos=await Promise.all((data??[]).map(async p=>{const {data:s,error:e}=await admin.storage.from("workshop-private").createSignedUrl(p.path,120);if(e)throw e;return {id:p.id,url:s.signedUrl,createdAt:p.created_at,context:p.context};}));
 return NextResponse.json({photos},{headers});
 }catch{return NextResponse.json({error:"No se pudo acceder a las fotos privadas."},{status:403,headers});}
}
export async function POST(request:Request){
 try{const {client}=await requireErpPermission(token(request),"inventory.manage");
 if(Number(request.headers.get("content-length")??0)>5_300_000)return NextResponse.json({error:"Máximo 5 MB."},{status:413,headers});
 const form=await boundedFormData(request);const unit=z.string().uuid().parse(form.get("unit"));const file=form.get("file");
 if(!(file instanceof File)||file.size>5_242_880||file.size<12) return NextResponse.json({error:"Selecciona una imagen JPEG, PNG o WebP de hasta 5 MB."},{status:400,headers});
 const bytes=new Uint8Array(await file.arrayBuffer()),mime=imageKind(bytes);
 if(!mime||file.type!==mime)return NextResponse.json({error:"El archivo no coincide con un formato de imagen permitido."},{status:400,headers});
 const check=await client.rpc("erp_workshop_read",{p_unit_id:unit,p_search:"",p_offset:0});if(check.error)throw check.error;
 const path=`units/${unit}/${randomUUID()}.${mime==="image/jpeg"?"jpg":mime.split("/")[1]}`;
 const store=getAdminClient().storage.from("workshop-private");const up=await store.upload(path,bytes,{contentType:mime,upsert:false});if(up.error)throw up.error;
 const saved=await client.rpc("erp_unit_photo_add",{p_unit:unit,p_path:path,p_mime:mime,p_bytes:file.size});
 if(saved.error){await store.remove([path]);throw saved.error;}
 return NextResponse.json({id:saved.data},{headers});
 }catch{return NextResponse.json({error:"No se guardó la foto. Comprueba permisos, conexión y activación del taller."},{status:400,headers});}
}
