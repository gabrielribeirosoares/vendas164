import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

export function usePendingLoyalty(storeId: string, enabled = true) {
  const { user } = useSession();
  return useQuery({
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
    enabled: enabled && !!user && !!storeId,
    staleTime: 30000,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
}

export function LoyaltyPendingBadge({ storeId }: { storeId: string }) {
  const { data: count, isError } = usePendingLoyalty(storeId);
  if (isError)
    return (
      <span
        className="ml-auto text-xs text-destructive"
        role="status"
        title="Não foi possível consultar os resgates. Abra o Clube para tentar novamente."
      >
        Falha nos resgates
      </span>
    );
  if (!count) return null;
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
