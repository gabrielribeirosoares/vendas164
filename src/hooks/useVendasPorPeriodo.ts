import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FiltroVendasPeriodoParams {
  storeId?: string;
  dataInicio?: string;
  dataFim?: string;
}

export function useVendasPorPeriodo({
  storeId,
  dataInicio,
  dataFim,
}: FiltroVendasPeriodoParams) {
  return useQuery({
    queryKey: ["vendas-periodo", storeId, dataInicio, dataFim],
    enabled: !!storeId,
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("*, products(*)")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false });

      if (dataInicio) {
        const startIso = new Date(`${dataInicio}T00:00:00.000Z`).toISOString();
        query = query.gte("created_at", startIso);
      }

      if (dataFim) {
        const endIso = new Date(`${dataFim}T23:59:59.999Z`).toISOString();
        query = query.lte("created_at", endIso);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = data ?? [];
      const userIds = [...new Set(rows.map((r) => r.user_id))];

      const { data: profiles } = userIds.length
        ? await supabase
            .from("profiles")
            .select("id, name, email, phone")
            .in("id", userIds)
        : { data: [] };

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

      return rows.map((order) => ({
        ...order,
        profiles: profileMap.get(order.user_id) || null,
      }));
    },
  });
}
