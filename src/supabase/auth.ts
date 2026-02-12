import { supabase } from "@/supabase/client";

type ProfileRow = { is_admin: boolean | null; active?: boolean | null };

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function isAdmin(): Promise<boolean> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return false;

  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin, active")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();

  if (error || !data) return false;
  return Boolean(data.is_admin);
}
