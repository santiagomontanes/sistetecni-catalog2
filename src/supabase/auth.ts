import { supabase } from "@/supabase/client";
import type {ErpRole} from "@/lib/erpAuth/types";
import {isErpRole} from "@/lib/erpAuth/types";

type ProfileRow = { is_admin: boolean | null; erp_role?: string | null; active?: boolean | null; display_name?: string | null; };

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
export async function signOutUser() { const { error } = await supabase.auth.signOut(); if (error) throw error; }
export async function getSession() { const { data, error } = await supabase.auth.getSession(); if (error) return null; return data.session ?? null; }

export async function isAdmin(): Promise<boolean> {
  const session = await getSession(); const userId = session?.user?.id; if (!userId) return false;
  const { data, error } = await supabase.from("profiles").select("is_admin").eq("id", userId).maybeSingle<ProfileRow>();
  if (error || !data) return false; return data.is_admin === true;
}

export async function getErpProfile():Promise<{role:ErpRole;active:boolean;displayName:string|null}|null>{
  const session=await getSession();const userId=session?.user?.id;if(!userId)return null;
  const{data,error}=await supabase.from("profiles").select("erp_role,active,display_name").eq("id",userId).maybeSingle<ProfileRow>();
  if(error||!data||data.active!==true||!isErpRole(data.erp_role))return null;
  return{role:data.erp_role,active:true,displayName:data.display_name??null};
}
export async function hasErpPanelAccess():Promise<boolean>{const p=await getErpProfile();return Boolean(p&&p.role!=="viewer");}
