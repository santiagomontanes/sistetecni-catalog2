import { supabase } from "@/supabase/client";
import type {ErpRole} from "@/lib/erpAuth/types";
import {isErpRole} from "@/lib/erpAuth/types";

type ProfileRow = { is_admin: boolean | null; erp_role?: string | null; active?: boolean | null; display_name?: string | null; };

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  // Una sola sesión por usuario: cierra las demás sesiones de esta persona. Si falla, no bloquea el ingreso.
  try { await supabase.rpc("erp_claim_single_session"); } catch { /* sin la función (entorno sin migrar) se conserva el comportamiento anterior */ }
  return data;
}
// scope local: cerrar sesión aquí no cierra el celular vinculado ni otros dispositivos de la misma persona.
export async function signOutUser() { const { error } = await supabase.auth.signOut({ scope: "local" }); if (error) throw error; }
/** true si el servidor ya no reconoce esta sesión (iniciada en otro lado). Un fallo de red NO cuenta. */
export async function sessionWasClosedElsewhere(): Promise<boolean> {
  const { data: current } = await supabase.auth.getSession();
  if (!current.session) return false;
  const { error } = await supabase.auth.getUser();
  if (!error) return false;
  const { status, code, message } = error as { status?: number; code?: string; message?: string };
  // El servidor responde 400/401/403 "session not found / Auth session missing" cuando la sesión fue cerrada.
  return (status === 400 || status === 401 || status === 403) && (code === "session_not_found" || code === "bad_jwt" || /session|jwt/i.test(message ?? ""));
}
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
