import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getSignalEmailPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return (await import("./signalEmailPreferences.server")).getPreference(context.userId);
  });

export const setSignalEmailPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { enabled: boolean }) => {
    if (!data || typeof data.enabled !== "boolean") throw new Error("invalid_preference");
    return { enabled: data.enabled };
  })
  .handler(async ({ context, data }) => {
    return (await import("./signalEmailPreferences.server")).setPreference(
      context.userId,
      data.enabled,
    );
  });
