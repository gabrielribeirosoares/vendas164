import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Coins } from "lucide-react";
import { getStoreLoyaltySummary } from "@/lib/loyalty";

export function StoreLoyaltyBanner({
  storeId,
  userId,
  onOpen,
}: {
  storeId: string;
  userId?: string;
  onOpen: () => void;
}) {
  const summary = useQuery({
    queryKey: ["loyalty", userId, storeId, "summary"],
    queryFn: () => getStoreLoyaltySummary(storeId, userId),
    enabled: !!storeId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });
  if (!userId && (!summary.isSuccess || !summary.data.enabled)) return null;
  if (summary.isSuccess && !summary.data.enabled && !summary.data.hasAccount) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-3 grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-primary/30 bg-primary/[0.06] p-4 text-left transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span
        className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary"
        aria-hidden="true"
      >
        <Coins className="size-6" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold sm:text-base">Clube de Coins</span>
        <span className="mt-0.5 block text-xs text-muted-foreground sm:text-sm">
          {userId && summary.isSuccess ? (
            <>
              <strong className="font-semibold tabular-nums text-foreground">
                {summary.data.balance} Coins
              </strong>
              {summary.data.enabled ? " disponíveis" : " · Programa pausado"}
            </>
          ) : summary.isError ? (
            "Consultar saldo e recompensas"
          ) : (
            "Recompensas da loja"
          )}
        </span>
      </span>
      <span className="flex items-center gap-2 text-sm font-semibold text-primary">
        <span className="sm:hidden">Ver</span>
        <span className="hidden sm:inline">Ver recompensas</span>
        <ArrowRight className="size-5" aria-hidden="true" />
      </span>
    </button>
  );
}
