import { createClient } from "@supabase/supabase-js";
import { isErpRole } from "../erpAuth/types";
import { AdminAuthError } from "../personalizadorAdmin/auth";
import { attendanceError } from "./validation";
import { ZodError } from "zod";

export async function attendanceAuth(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new AdminAuthError("No autenticado");
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: user, error } = await client.auth.getUser(token);
  if (error || !user.user) throw new AdminAuthError("Sesión inválida");
  const { data: profile, error: profileError } = await client.from("profiles").select("id,erp_role,active,display_name").eq("id", user.user.id).single();
  if (profileError || !profile?.active || !isErpRole(profile.erp_role) || profile.erp_role === "viewer") throw new AdminAuthError("No autorizado");
  return { client, userId: user.user.id, profile };
}

export async function attendanceEnabled(client: Awaited<ReturnType<typeof attendanceAuth>>["client"]) {
  const { data, error } = await client.from("attendance_settings").select("enabled").eq("singleton", true).single();
  if (error || !data?.enabled) throw new Error("attendance_disabled");
}

export function attendanceFailure(error: unknown) {
  if (error instanceof AdminAuthError) return Response.json({ error: "No tienes una sesión autorizada." }, { status: 403 });
  if (error instanceof ZodError) return Response.json({ error: "Datos inválidos: " + error.issues.map(issue => issue.path.join(".") + " " + issue.message).join("; ") }, { status: 400 });
  const message = error instanceof Error ? error.message : "";
  return Response.json({ error: attendanceError(message) }, { status: message.includes("version_conflict") ? 409 : 400 });
}
