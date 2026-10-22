import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

export function LoyaltyPendingBadge({ storeId }: { storeId: string }) {
  const { user } = useSession();
  const { data: count, isError } = useQuery({
    queryKey: ["loyalty", user?.id, storeId, "pending-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("loyalty_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("store_id", storeId)
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user && !!storeId,
    staleTime: 30000,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
  if (isError || !count) return null;
  return (
    <span
      className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary"
      aria-label={`${count} resgates aguardando aprovação`}
      title={`${count} resgates aguardando aprovação`}
    >
      {count}
    </span>
  );
}
