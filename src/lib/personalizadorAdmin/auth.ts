/**
 * Verificación de administrador para las Server Actions del panel (B6).
 *
 * Este proyecto NO usa @supabase/ssr ni cookies de sesión — la sesión de
 * Supabase Auth vive en el navegador (localStorage). Por eso una Server
 * Action no puede "leer la sesión actual" por su cuenta: el cliente debe
 * enviar explícitamente su `access_token` (ya lo tiene, vía
 * `supabase.auth.getSession()`) como parte del payload de cada acción.
 *
 * requireAdmin() verifica ese token contra Supabase Auth (nunca confía en
 * que sea válido solo porque llegó) y comprueba is_admin=true en
 * `profiles` — todo ANTES de tocar cualquier dato. Deliberadamente NO usa
 * el cliente admin (service_role): construye un cliente "scoped" con el
 * propio token del usuario, así que además de esta verificación explícita,
 * cada query posterior que use el `client` devuelto queda TAMBIÉN sujeta a
 * las policies RLS de is_admin ya existentes (upgrade_options,
 * product_upgrade_options, quote_requests) — dos capas independientes,
 * nunca una sola. Mismo principio que "no confíes únicamente en que la
 * ruta /admin esté oculta" aplicado a nivel de datos.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class AdminAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAuthError";
  }
}

export interface AdminContext {
  userId: string;
  /** Cliente scoped con el access_token del usuario — RLS lo trata como ese usuario, no como service_role. */
  client: SupabaseClient;
}

/** Mínimo necesario de la superficie de SupabaseClient que requireAdmin usa — facilita inyectar un doble de prueba sin red. */
export interface AuthClientLike {
  auth: {
    getUser(jwt?: string): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
  };
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle<T>(): Promise<{ data: T | null; error: { message: string } | null }>;
      };
    };
  };
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[personalizadorAdmin/auth] Falta la variable de entorno "${name}".`);
  }
  return value;
}

function defaultClientFactory(accessToken: string): AuthClientLike {
  const url = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  // El PostgrestFilterBuilder real es "thenable" (awaitable) pero no
  // estructuralmente idéntico a la interfaz mínima de arriba — mismo
  // criterio de cast ya usado en fakeClient.ts para el mismo tipo de
  // desajuste entre el builder real de supabase-js y una interfaz simplificada.
  return client as unknown as AuthClientLike;
}

interface ProfileRow {
  is_admin: boolean | null;
}

/**
 * @param accessToken el `session.access_token` que el cliente ya tiene tras iniciar sesión.
 * @param clientFactory inyectable para tests — por defecto crea un cliente Supabase real scoped con el token.
 */
export async function requireAdmin(
  accessToken: unknown,
  clientFactory: (accessToken: string) => AuthClientLike = defaultClientFactory
): Promise<AdminContext> {
  if (typeof accessToken !== "string" || accessToken.trim().length === 0) {
    throw new AdminAuthError("No autenticado.");
  }

  const client = clientFactory(accessToken);

  const { data: userData, error: userError } = await client.auth.getUser(accessToken);
  if (userError || !userData.user) {
    throw new AdminAuthError("Sesión inválida o expirada.");
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .maybeSingle<ProfileRow>();

  if (profileError) {
    throw new AdminAuthError("No se pudo verificar el permiso de administrador.");
  }
  if (!profile?.is_admin) {
    throw new AdminAuthError("No tienes permisos de administrador.");
  }

  return { userId: userData.user.id, client: client as unknown as SupabaseClient };
}
