/**
 * Helper cliente para llamar Server Actions del panel admin (B6) — adjunta
 * el access_token de la sesión actual (este proyecto no usa cookies de
 * sesión, ver src/lib/personalizadorAdmin/auth.ts) sin repetir
 * `supabase.auth.getSession()` en cada componente.
 */
import { supabase } from "@/supabase/client";

export async function callAdminAction<TPayload extends object, TResult>(
  action: (payload: TPayload & { accessToken: unknown }) => Promise<TResult>,
  payload: TPayload
): Promise<TResult> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  return action({ ...payload, accessToken } as TPayload & { accessToken: unknown });
}
