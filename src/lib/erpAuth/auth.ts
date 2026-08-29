import {createClient,type SupabaseClient} from "@supabase/supabase-js";
import {AdminAuthError} from "@/lib/personalizadorAdmin/auth";
import type {ErpPermission,ErpRole} from "./types";
import {isErpRole,roleHasPermission} from "./types";

export interface ErpAuthContext{userId:string;role:ErpRole;client:SupabaseClient;}
function env(name:string){const v=process.env[name];if(!v)throw new Error(`[erpAuth] Falta ${name}.`);return v;}
function clientFor(token:string){return createClient(env("NEXT_PUBLIC_SUPABASE_URL"),env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});}
export async function requireErpPermission(accessToken:unknown,permission:ErpPermission):Promise<ErpAuthContext>{
  if(typeof accessToken!=="string"||!accessToken.trim())throw new AdminAuthError("No autenticado.");
  const client=clientFor(accessToken);
  const{data:userData,error:userError}=await client.auth.getUser(accessToken);
  if(userError||!userData.user)throw new AdminAuthError("Sesión inválida o expirada.");
  const{data:profile,error}=await client.from("profiles").select("erp_role,active").eq("id",userData.user.id).maybeSingle<{erp_role:string|null;active:boolean|null}>();
  if(error||!profile||profile.active!==true||!isErpRole(profile.erp_role)||!roleHasPermission(profile.erp_role,permission))throw new AdminAuthError("No tienes permiso para esta operación.");
  return{userId:userData.user.id,role:profile.erp_role,client};
}
