import { QueryClient } from "@tanstack/react-query";

// QueryClient singleton compartilhado entre router e componentes.
// Evita perda de cache e refetches desnecessários entre chamadas.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});