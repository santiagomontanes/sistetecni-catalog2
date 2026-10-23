import {NextResponse} from "next/server";
import {z} from "zod";
import {getAdminClient} from "@/supabase/admin";
import {erpAgentControlConfig,erpAgentControlEnabled,hashWaId,verifyErpAgentRequest} from "@/lib/erpAgent/auth";
import {shippingEnabled} from "@/lib/shipping/service";
import {readShippingBody,ShippingBodyTooLarge} from "@/lib/shipping/http";
export const runtime="nodejs";export const dynamic="force-dynamic";
const id=z.string().uuid(),waId=z.string().regex(/^\d{8,20}$/);
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("claim"),limit:z.number().int().min(1).max(50).default(20)}).strict(),
 z.object({action:z.literal("begin"),jobId:id,leaseToken:id,waId}).strict(),
 z.object({action:z.literal("finish"),jobId:id,sendToken:id,waId,outcome:z.enum(["sent","not_sent","uncertain"]),providerMessageId:z.string().min(1).max(200).optional()}).strict(),
 z.object({action:z.literal("ack"),jobId:id,leaseToken:id,success:z.boolean(),error:z.string().regex(/^[a-z_]{1,80}$/).optional()}).strict(),
]);
export async function POST(request:Request){
 const headers={"Cache-Control":"no-store"};
 if(!shippingEnabled()||!erpAgentControlEnabled())return NextResponse.json({error:"NOT_FOUND"},{status:404,headers});
 try{
  const rawBody=await readShippingBody(request),config=erpAgentControlConfig();
  if(!verifyErpAgentRequest({rawBody,timestampHeader:request.headers.get("x-erp-agent-timestamp"),signatureHeader:request.headers.get("x-erp-agent-signature"),config}))return NextResponse.json({error:"UNAUTHORIZED"},{status:401,headers});
  const parsed=schema.parse(JSON.parse(rawBody));const args:Record<string,unknown>={...parsed};delete args.action;
  if("waId" in parsed){args.waIdHash=hashWaId(parsed.waId);delete args.waId;}
  const {data,error}=await getAdminClient().rpc("erp_shipping_reminder_command",{p_action:parsed.action,p_args:args});
  if(error)return NextResponse.json({error:"JOB_NOT_AUTHORIZED_OR_CONFLICT"},{status:error.code==="42501"?403:409,headers});
  return NextResponse.json({ok:true,data},{headers});
 }catch(error){return NextResponse.json({error:"INVALID_JOB_REQUEST"},{status:error instanceof ShippingBodyTooLarge?413:400,headers});}
}
