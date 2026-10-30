"use server";
import{requireErpPermission}from"@/lib/erpAuth/auth";import{mapUnexpectedError}from"@/lib/personalizadorAdmin/errorMapping";import type{AdminResult}from"@/lib/personalizadorAdmin/types";import{issues,userRoleSchema}from"@/lib/adminPhase2/validation";import type{UserProfileDTO}from"@/lib/adminPhase2/types";import{z}from"zod";import{getAdminClient}from"@/supabase/admin";import{isErpRole}from"@/lib/erpAuth/types";
export async function listUsers(p:{accessToken:unknown}):Promise<AdminResult<{items:UserProfileDTO[]}>>{try{const{client}=await requireErpPermission(p.accessToken,"users.manage");const{data,error}=await client.from("profiles").select("id,email,display_name,erp_role,active,is_admin,created_at").order("created_at",{ascending:true});if(error)throw error;const items:UserProfileDTO[]=(data??[]).filter(r=>isErpRole(r.erp_role)).map(r=>({id:r.id,email:r.email,displayName:r.display_name,role:r.erp_role,active:r.active===true,isAdmin:r.is_admin===true,createdAt:r.created_at}));return{ok:true,data:{items}};}catch(e){return mapUnexpectedError(e);}}
export async function setUserRole(p:{accessToken:unknown;[k:string]:unknown}):Promise<AdminResult<{id:string}>>{const{accessToken,...input}=p;const v=userRoleSchema.safeParse(input);if(!v.success)return{ok:false,error:"VALIDATION_ERROR",issues:issues(v.error)};try{const{client}=await requireErpPermission(accessToken,"users.manage");const{data,error}=await client.rpc("erp_set_profile_role",{p_profile_id:v.data.profileId,p_role:v.data.role,p_display_name:v.data.displayName??null,p_active:v.data.active});if(error)throw error;return{ok:true,data:{id:String(data)}};}catch(e){return mapUnexpectedError(e);}}

const ROLES = ["admin", "supervisor", "vendedor", "tecnico", "caja", "bodega", "viewer"] as const;
const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Escribe un correo válido.").max(160),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres.").max(72, "La contraseña es demasiado larga."),
  displayName: z.string().trim().min(2, "Escribe el nombre de la persona.").max(120),
  role: z.enum(ROLES),
}).strict();
const resetPasswordSchema = z.object({ profileId: z.string().uuid(), password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres.").max(72, "La contraseña es demasiado larga.") }).strict();

// Crea la cuenta de acceso (Supabase Auth) y su perfil con rol. Solo el administrador (users.manage).
export async function createUser(p: { accessToken: unknown; [k: string]: unknown }): Promise<AdminResult<{ id: string }>> {
  const { accessToken, ...input } = p;
  const v = createUserSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "VALIDATION_ERROR", issues: issues(v.error) };
  try {
    await requireErpPermission(accessToken, "users.manage");
    const admin = getAdminClient();
    const created = await admin.auth.admin.createUser({ email: v.data.email, password: v.data.password, email_confirm: true, user_metadata: { display_name: v.data.displayName } });
    if (created.error || !created.data.user) {
      const msg = created.error?.message ?? "";
      if (/already|registered|exists/i.test(msg)) return { ok: false, error: "VALIDATION_ERROR", issues: ["Ya existe un usuario con ese correo."] };
      throw created.error ?? new Error("create_user_failed");
    }
    const id = created.data.user.id;
    const { error } = await admin.from("profiles").upsert({ id, email: v.data.email, display_name: v.data.displayName, erp_role: v.data.role, is_admin: v.data.role === "admin", active: true }, { onConflict: "id" });
    if (error) { await admin.auth.admin.deleteUser(id); throw error; }
    return { ok: true, data: { id } };
  } catch (e) { return mapUnexpectedError(e); }
}

// El administrador define una contraseña nueva para otra persona.
export async function resetUserPassword(p: { accessToken: unknown; [k: string]: unknown }): Promise<AdminResult<{ id: string }>> {
  const { accessToken, ...input } = p;
  const v = resetPasswordSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "VALIDATION_ERROR", issues: issues(v.error) };
  try {
    await requireErpPermission(accessToken, "users.manage");
    const admin = getAdminClient();
    const { error } = await admin.auth.admin.updateUserById(v.data.profileId, { password: v.data.password });
    if (error) throw error;
    return { ok: true, data: { id: v.data.profileId } };
  } catch (e) { return mapUnexpectedError(e); }
}
