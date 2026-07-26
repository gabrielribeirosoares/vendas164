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

      const { data: existing } = await supabase
        .from("profiles")
        .select("id, name, email, phone")
        .eq("id", u.id)
        .maybeSingle();

      // Se já existe registro no banco, corrige se estiver sem e-mail ou com nome genérico "Cliente"
      if (existing) {
        const updates: { email?: string; name?: string; phone?: string } = {};
        if (!existing.email && u.email) {
          updates.email = u.email;
        }
        if (
          (!existing.name || existing.name === "Cliente" || existing.name === "Cliente cadastrado") &&
          u.email
        ) {
          updates.name = u.user_metadata?.name || u.email.split("@")[0];
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from("profiles").update(updates).eq("id", u.id);
        }
        return;
      }

      // Se não existe registro ainda, cria o registro inicial
      const emailPrefix = u.email ? u.email.split("@")[0] : null;
      const metaName = u.user_metadata?.name || u.user_metadata?.full_name;
      const fallbackName = metaName && metaName.trim() ? metaName.trim() : (u.email || emailPrefix || "Cliente");

      await supabase.from("profiles").insert({
        id: u.id,
        name: fallbackName,
        email: u.email || null,
        phone: u.user_metadata?.phone || null,
      });
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
