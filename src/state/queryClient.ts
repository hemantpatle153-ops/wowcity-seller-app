import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/errors";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      // Retry only when the network hiccuped; a 4xx will not fix itself.
      retry: (count, error) => count < 2 && error instanceof ApiError && (error.isNetwork || error.status >= 500),
      refetchOnWindowFocus: false
    },
    mutations: { retry: false }
  }
});
