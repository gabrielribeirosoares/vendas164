import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ReservarMiniaturaParams {
  produtoId: string;
  quantidade: number;
}

export function useReservarMiniatura() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ produtoId, quantidade }: ReservarMiniaturaParams) => {
      const { data, error } = await supabase.rpc("reservar_miniatura", {
        p_produto_id: produtoId,
        p_quantidade: quantidade,
      });

      if (error) {
        throw error;
      }

      if (data === false) {
        throw new Error("Estoque insuficiente para concluir a reserva.");
      }

      return data;
    },
    onMutate: async ({ produtoId, quantidade }: ReservarMiniaturaParams) => {
      await queryClient.cancelQueries({ queryKey: ["store-products"] });
      await queryClient.cancelQueries({ queryKey: ["products"] });

      const previousStoreProducts = queryClient.getQueriesData({ queryKey: ["store-products"] });
      const previousProducts = queryClient.getQueriesData({ queryKey: ["products"] });

      queryClient.setQueriesData({ queryKey: ["store-products"] }, (oldData: any) => {
        if (!Array.isArray(oldData)) return oldData;
        return oldData.map((item: any) => {
          if (item.id === produtoId) {
            return {
              ...item,
              stock: Math.max(0, Number(item.stock || 0) - quantidade),
            };
          }
          return item;
        });
      });

      queryClient.setQueriesData({ queryKey: ["products"] }, (oldData: any) => {
        if (!Array.isArray(oldData)) return oldData;
        return oldData.map((item: any) => {
          if (item.id === produtoId) {
            return {
              ...item,
              stock: Math.max(0, Number(item.stock || 0) - quantidade),
            };
          }
          return item;
        });
      });

      return { previousStoreProducts, previousProducts };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousStoreProducts) {
        context.previousStoreProducts.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      if (context?.previousProducts) {
        context.previousProducts.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["store-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
