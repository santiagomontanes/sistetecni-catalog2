import { supabase } from "@/supabase/client";

type ProfileRow = {
  is_admin: boolean | null;
};

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session ?? null;
}

export async function isAdmin(): Promise<boolean> {
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return false;

  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();

  if (error || !data) return false;
  return data.is_admin === true;
}
