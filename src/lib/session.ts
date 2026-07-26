import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function syncProfile(u: User | null | undefined) {
      if (!u) return;
      await supabase.from("profiles").upsert(
        {
          id: u.id,
          name: u.user_metadata?.name || u.email?.split("@")[0] || "Cliente",
          email: u.email,
          phone: u.user_metadata?.phone || null,
        },
        { onConflict: "id" }
      ).then(() => undefined);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) syncProfile(data.session.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
      if (s?.user) syncProfile(s.user);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user: (session?.user ?? null) as User | null, loading };
}
