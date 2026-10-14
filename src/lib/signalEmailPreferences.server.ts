import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
const db = supabaseAdmin as unknown as SupabaseClient;

export async function getPreference(userId: string) {
  if (process.env.SIGNAL_EMAIL_PREFERENCES_ENABLED !== "true") {
    return { available: false, enabled: false, email: null as string | null };
  }
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error || !data.user) throw new Error("preference_user_failed");
  const email = data.user.email_confirmed_at ? data.user.email || null : null;
  const { data: preference, error: readError } = await db
    .from("signal_email_preferences")
    .select("enabled,email")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw new Error("preference_read_failed");
  return {
    available: true,
    enabled: !!(email && preference?.enabled && preference.email === email),
    email,
  };
}

export async function setPreference(userId: string, enabled: boolean) {
  if (enabled && process.env.SIGNAL_EMAIL_PREFERENCES_ENABLED !== "true")
    throw new Error("email_preferences_disabled");
  if (!enabled) {
    const { error } = await db
      .from("signal_email_preferences")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) throw new Error("preference_save_failed");
    return;
  }
  const state = await getPreference(userId);
  if (!state.email) throw new Error("confirmed_email_required");
  const { error } = await db.from("signal_email_preferences").upsert({
    user_id: userId,
    email: state.email,
    enabled: true,
    consented_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("preference_save_failed");
}
