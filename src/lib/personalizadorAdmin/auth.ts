/** Verificación de acceso para Server Actions del panel. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {isErpRole} from "@/lib/erpAuth/types";

export class AdminAuthError extends Error { constructor(message:string){super(message);this.name="AdminAuthError";} }
export interface AdminContext { userId:string; client:SupabaseClient; }
export interface AuthClientLike {
  auth:{getUser(jwt?:string):Promise<{data:{user:{id:string}|null};error:{message:string}|null}>};
  from(table:string):{select(columns:string):{eq(column:string,value:string):{maybeSingle<T>():Promise<{data:T|null;error:{message:string}|null}>}}};
}
function getRequiredEnv(name:string):string{const value=process.env[name];if(!value)throw new Error(`[personalizadorAdmin/auth] Falta la variable de entorno "${name}".`);return value;}
function defaultClientFactory(accessToken:string):AuthClientLike{const url=getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");const anonKey=getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");const client=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${accessToken}`}}});return client as unknown as AuthClientLike;}
interface LegacyProfileRow{is_admin:boolean|null;}
interface ErpProfileRow{erp_role:string|null;active:boolean|null;}
/**
 * Compatibilidad Fase 2:
 * 1) primero verifica is_admin como siempre (esto permite tests/deploy antes de aplicar la migración 2D);
 * 2) solo si no es admin, intenta acceso por erp_role activo distinto de viewer.
 * La autorización fina de cada mutación vive además en los wrappers/RLS de Fase 2.
 */
export async function requireAdmin(accessToken:unknown,clientFactory:(accessToken:string)=>AuthClientLike=defaultClientFactory):Promise<AdminContext>{
  if(typeof accessToken!=="string"||accessToken.trim().length===0)throw new AdminAuthError("No autenticado.");
  const client=clientFactory(accessToken);const{data:userData,error:userError}=await client.auth.getUser(accessToken);
  if(userError||!userData.user)throw new AdminAuthError("Sesión inválida o expirada.");
  const{data:legacy,error:legacyError}=await client.from("profiles").select("is_admin").eq("id",userData.user.id).maybeSingle<LegacyProfileRow>();
  if(legacyError)throw new AdminAuthError("No se pudo verificar el permiso de administrador.");
  if(legacy?.is_admin===true)return{userId:userData.user.id,client:client as unknown as SupabaseClient};
  // En proyectos donde Fase 2 aún no se ha aplicado esta segunda lectura puede fallar;
  // se trata simplemente como acceso denegado, nunca como autorización por defecto.
  const{data:erp,error:erpError}=await client.from("profiles").select("erp_role,active").eq("id",userData.user.id).maybeSingle<ErpProfileRow>();
  if(erpError||!erp||erp.active!==true||!isErpRole(erp.erp_role)||erp.erp_role==="viewer")throw new AdminAuthError("No tienes permisos de administrador.");
  return{userId:userData.user.id,client:client as unknown as SupabaseClient};
}
