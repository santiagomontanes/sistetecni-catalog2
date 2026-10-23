import {NextResponse} from "next/server";
import {z} from "zod";
import {randomUUID} from "node:crypto";
import {requireErpPermission} from "@/lib/erpAuth/auth";
import {getAdminClient} from "@/supabase/admin";
import {imageKind} from "@/lib/operations/image";
import {boundedFormData} from "@/lib/operations/upload";
export const runtime="nodejs";
export async function POST(request:Request){
 const headers={"Cache-Control":"no-store"};
 try{const {client}=await requireErpPermission(request.headers.get("authorization")?.replace(/^Bearer /,""),"inventory.manage");
 if(Number(request.headers.get("content-length")??0)>5_300_000)throw new Error("size");
 const form=await boundedFormData(request),id=z.string().uuid().parse(form.get("finishId")),file=form.get("file");
 if(!(file instanceof File)||file.size>5_242_880||file.size<12)throw new Error("image");
 const bytes=new Uint8Array(await file.arrayBuffer()),mime=imageKind(bytes);if(!mime||mime!==file.type)throw new Error("image");
 const {data,error}=await client.from("product_finishes").select("id").eq("id",id).single();if(error||!data)throw new Error("finish");
 const path=`${id}/${randomUUID()}.${mime==="image/jpeg"?"jpg":mime.split("/")[1]}`;
 const store=getAdminClient().storage.from("catalog-finishes");const up=await store.upload(path,bytes,{contentType:mime,upsert:false});if(up.error)throw up.error;
 const saved=await client.rpc("erp_finish_command",{p_action:"photo",p_payload:{finishId:id,path},p_key:randomUUID()});
 if(saved.error){await store.remove([path]);throw saved.error;}return NextResponse.json({ok:true},{headers});
 }catch{return NextResponse.json({error:"No se guardó. Usa JPEG, PNG o WebP hasta 5 MB y comprueba acceso al acabado."},{status:400,headers});}
}
