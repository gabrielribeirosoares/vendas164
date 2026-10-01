import { QueryClient } from "@tanstack/react-query";

// QueryClient singleton compartilhado entre router e componentes.
// Evita perda de cache e refetches desnecessários entre chamadas.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});